use notecli::streaming::FrontendEmitter;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

pub struct TauriEmitter {
    app: AppHandle,
}

impl TauriEmitter {
    pub fn new(app: AppHandle) -> Self {
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

        if let Err(e) = self
            .app
            .notification()
            .builder()
            .title(user_name)
            .body(&body)
            .show()
        {
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
        let wrapped = serde_json::json!({
            "kind": event,
            "payload": payload,
        });
        if let Err(e) = self.app.emit("stream-event", wrapped) {
            eprintln!("[stream] emit {event} failed: {e}");
        }
    }
}
