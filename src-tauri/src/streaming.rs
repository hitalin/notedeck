use notecli::streaming::FrontendEmitter;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

/// Typed wrapper for stream events — avoids repeated `serde_json::json!` allocation.
#[derive(Serialize, Clone)]
struct StreamEventWrapper<'a> {
    kind: &'a str,
    payload: &'a Value,
}

#[cfg(target_os = "android")]
const NOTIFICATION_CHANNEL_ID: &str = "notedeck_notifications";

pub struct TauriEmitter {
    app: AppHandle,
}

impl TauriEmitter {
    pub fn new(app: AppHandle) -> Self {
        #[cfg(target_os = "android")]
        {
            use tauri_plugin_notification::{Channel, Importance};
            let channel = Channel::builder(NOTIFICATION_CHANNEL_ID, "通知")
                .importance(Importance::Default)
                .build();
            let _ = app.notification().create_channel(channel);
        }
        Self { app }
    }

    fn send_native_notification(&self, payload: &Value) {
        let notification = match payload.get("notification") {
            Some(n) => n,
            None => return,
        };

        let notif_type = notification
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let label = match notif_type {
            "reaction" => "リアクション",
            "reply" => "リプライ",
            "renote" => "リノート",
            "quote" => "引用",
            "mention" => "メンション",
            "follow" => "フォロー",
            "followRequestAccepted" => "フォローリクエスト承認",
            "receiveFollowRequest" => "フォローリクエスト",
            "pollEnded" => "投票終了",
            "achievementEarned" => "実績獲得",
            "app" => "通知",
            "login" => "ログイン検知",
            "test" => "テスト通知",
            _ => return,
        };

        let user_name = notification
            .get("user")
            .and_then(|u| {
                u.get("name")
                    .and_then(|v| v.as_str())
                    .or_else(|| u.get("username").and_then(|v| v.as_str()))
            })
            .unwrap_or("誰か");

        let body = if notif_type == "reaction" {
            if let Some(reaction) = notification.get("reaction").and_then(|v| v.as_str()) {
                format!("{label} {reaction}")
            } else {
                label.to_string()
            }
        } else {
            label.to_string()
        };

        #[allow(unused_mut)]
        let mut builder = self
            .app
            .notification()
            .builder()
            .title(user_name)
            .body(&body);
        #[cfg(target_os = "android")]
        {
            builder = builder.channel_id(NOTIFICATION_CHANNEL_ID);
        }
        if let Err(e) = builder.show() {
            eprintln!("[notification] failed to send: {e}");
        }
    }
}

impl FrontendEmitter for TauriEmitter {
    fn emit(&self, event: &str, payload: Value) {
        if event == "stream-notification" {
            self.send_native_notification(&payload);
        }

        // Consolidate all stream-* events into a single "stream-event" with kind discriminator
        let wrapped = StreamEventWrapper {
            kind: event,
            payload: &payload,
        };
        if let Err(e) = self.app.emit("stream-event", &wrapped) {
            eprintln!("[stream] emit {event} failed: {e}");
        }
    }
}
