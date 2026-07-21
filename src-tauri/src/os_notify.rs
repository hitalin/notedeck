//! OS 通知のクリック遷移 (#754)。
//!
//! tauri-plugin-notification のデスクトップ実装はクリックイベントを取得できない
//! (上流 tauri-apps/plugins-workspace#2150) ため、プラットフォームで経路を分ける:
//!
//! - Linux / Windows: user-notify crate で表示し、クリック (Default action) を
//!   コールバックで受けて main window をフォーカス + `NotificationClicked` を emit
//! - macOS: user-notify は署名済み bundle (Apple Developer 署名) が必須のため
//!   従来の plugin 経路を維持 (クリック遷移なし)。署名導入時に解禁する
//! - Android: plugin の `extra` にコンテキストを積み、JS 側 onAction が遷移する
//!   (このモジュールは使わない — streaming.rs 参照)

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

/// OS 通知クリック時にフロントへ渡す遷移コンテキスト。
/// noteId があればノート詳細、なければ userId でユーザー詳細を開く。
/// どちらもない (要約通知・システム通知) 場合はウィンドウのフォーカスのみ。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct NotificationClicked {
    pub account_id: String,
    pub note_id: Option<String>,
    pub user_id: Option<String>,
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
mod desktop {
    use std::collections::HashMap;
    use std::sync::{Arc, OnceLock};

    use tauri::Manager;
    use tauri_specta::Event;
    use user_notify::{NotificationManager, NotificationResponseAction};

    use super::NotificationClicked;

    static MANAGER: OnceLock<Arc<dyn NotificationManager>> = OnceLock::new();

    /// user-notify manager を初期化し、クリックコールバックを登録する。
    /// setup (Phase 1) から 1 回だけ呼ぶ。
    pub fn init<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
        let manager = user_notify::get_notification_manager(app.config().identifier.clone(), None);
        let handle = app.clone();
        let register_result = manager.register(
            Box::new(move |response| {
                // Dismiss (スワイプ/閉じる) では遷移しない
                if !matches!(response.action, NotificationResponseAction::Default) {
                    return;
                }
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
                let info = &response.user_info;
                if let Some(account_id) = info.get("accountId") {
                    let event = NotificationClicked {
                        account_id: account_id.clone(),
                        note_id: info.get("noteId").cloned(),
                        user_id: info.get("userId").cloned(),
                    };
                    if let Err(e) = event.emit(&handle) {
                        tracing::warn!("[notification] click emit failed: {e}");
                    }
                }
            }),
            vec![],
        );
        if let Err(e) = register_result {
            tracing::warn!("[notification] click handler registration failed: {e:?}");
        }
        let _ = MANAGER.set(manager);
    }

    /// OS 通知を表示する。context があればクリック時の遷移ペイロードとして
    /// user_info に積む。
    pub fn show(title: &str, body: Option<&str>, context: Option<&NotificationClicked>) {
        // 未初期化 (ユニットテスト等) は no-op
        let Some(manager) = MANAGER.get() else {
            return;
        };
        let mut builder = user_notify::NotificationBuilder::new().title(title);
        if let Some(body) = body {
            builder = builder.body(body);
        }
        if let Some(ctx) = context {
            let mut info = HashMap::new();
            info.insert("accountId".to_string(), ctx.account_id.clone());
            if let Some(note_id) = &ctx.note_id {
                info.insert("noteId".to_string(), note_id.clone());
            }
            if let Some(user_id) = &ctx.user_id {
                info.insert("userId".to_string(), user_id.clone());
            }
            builder = builder.set_user_info(info);
        }
        // Linux の send_notification は内部でブロッキングの notify-rust
        // handle_action を呼び、通知が閉じられるまで返らない。tokio ワーカーを
        // 塞がないよう通知 1 件ごとに専用スレッドで送る (通知は数秒で expire
        // するのでスレッドは短命)。
        let manager = Arc::clone(manager);
        std::thread::spawn(move || {
            if let Err(e) = tauri::async_runtime::block_on(manager.send_notification(builder)) {
                tracing::warn!("[notification] failed to send: {e:?}");
            }
        });
    }
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
pub use desktop::{init, show};
