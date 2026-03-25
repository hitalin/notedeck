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
        } else if notif_type == "achievementEarned" {
            if let Some(name) = notification.get("achievement").and_then(|v| v.as_str()) {
                format!("{label}: {}", achievement_label(name))
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

fn achievement_label(name: &str) -> &str {
    match name {
        "notes1" => "はじめてのノート",
        "notes10" => "10ノート",
        "notes100" => "100ノート",
        "notes500" => "500ノート",
        "notes1000" => "1,000ノート",
        "notes5000" => "5,000ノート",
        "notes10000" => "10,000ノート",
        "notes20000" => "20,000ノート",
        "notes30000" => "30,000ノート",
        "notes40000" => "40,000ノート",
        "notes50000" => "50,000ノート",
        "notes60000" => "60,000ノート",
        "notes70000" => "70,000ノート",
        "notes80000" => "80,000ノート",
        "notes90000" => "90,000ノート",
        "notes100000" => "100,000ノート",
        "login3" => "ログイン3日",
        "login7" => "ログイン7日",
        "login15" => "ログイン15日",
        "login30" => "ログイン30日",
        "login60" => "ログイン60日",
        "login100" => "ログイン100日",
        "login200" => "ログイン200日",
        "login300" => "ログイン300日",
        "login400" => "ログイン400日",
        "login500" => "ログイン500日",
        "login600" => "ログイン600日",
        "login700" => "ログイン700日",
        "login800" => "ログイン800日",
        "login900" => "ログイン900日",
        "login1000" => "ログイン1,000日",
        "passedSinceAccountCreated1" => "アカウント作成から1年",
        "passedSinceAccountCreated2" => "アカウント作成から2年",
        "passedSinceAccountCreated3" => "アカウント作成から3年",
        "loggedInOnBirthday" => "誕生日にログイン",
        "loggedInOnNewYearsDay" => "元日にログイン",
        "noteClipped1" => "はじめてのクリップ",
        "noteFavorited1" => "はじめてのお気に入り",
        "myNoteFavorited1" => "お気に入りされた",
        "profileFilled" => "プロフィール設定",
        "markedAsCat" => "Cat",
        "following1" => "はじめてのフォロー",
        "following10" => "10フォロー",
        "following50" => "50フォロー",
        "following100" => "100フォロー",
        "following300" => "300フォロー",
        "followers1" => "はじめてのフォロワー",
        "followers10" => "10フォロワー",
        "followers50" => "50フォロワー",
        "followers100" => "100フォロワー",
        "followers300" => "300フォロワー",
        "followers500" => "500フォロワー",
        "followers1000" => "1,000フォロワー",
        "collectAchievements30" => "実績コレクター",
        "viewAchievements3min" => "実績を眺める",
        "iLoveMisskey" => "I Love Misskey",
        "foundTreasure" => "隠された宝物",
        "client30min" => "30分利用",
        "client60min" => "60分利用",
        "noteDeletedWithin1min" => "1分以内に削除",
        "postedAtLateNight" => "深夜の投稿",
        "postedAt0min0sec" => "ジャスト0分0秒",
        "selfQuote" => "セルフ引用",
        "htl20npm" => "TLが速い",
        "viewInstanceChart" => "インスタンスチャートを見る",
        "outputHelloWorldOnScratchpad" => "Hello, World!",
        "open3windows" => "3つのウィンドウ",
        "driveFolderCircularReference" => "循環参照",
        "reactWithoutRead" => "読まずにリアクション",
        "clickedClickHere" => "ここをクリック",
        "justPlainLucky" => "ただの幸運",
        "setNameToSyuilo" => "しゅいろの名前",
        "cookieClicked" => "クッキークリック",
        "brainDiver" => "Brain Diver",
        "smashTestNotificationButton" => "通知テスト連打",
        "tutorialCompleted" => "チュートリアル完了",
        "bubbleGameExplodingHead" => "バブルゲーム",
        "bubbleGameDoubleExplodingHead" => "バブルゲーム(ダブル)",
        _ => name,
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
