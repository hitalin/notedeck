use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;

use crate::error::NoteDeckError;
use crate::models::*;


// --- Tauri event payloads ---

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamNoteEvent {
    pub account_id: String,
    pub subscription_id: String,
    pub note: NormalizedNote,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamNotificationEvent {
    pub account_id: String,
    pub subscription_id: String,
    pub notification: NormalizedNotification,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamMainEvent {
    pub account_id: String,
    pub subscription_id: String,
    pub event_type: String,
    pub body: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStatusEvent {
    pub account_id: String,
    pub state: String,
}

// --- Internal commands sent to the WebSocket task ---

enum WsCommand {
    Subscribe { channel: String, id: String },
    Unsubscribe { id: String },
    Shutdown,
}

struct ConnectionHandle {
    cmd_tx: mpsc::UnboundedSender<WsCommand>,
    task: tokio::task::JoinHandle<()>,
    host: String,
}

// --- Subscription tracking ---

#[derive(Debug, Clone)]
struct SubscriptionInfo {
    account_id: String,
    host: String,
    /// "timeline" or "main"
    kind: String,
    /// The Misskey channel name (e.g. "homeTimeline", "main")
    channel: String,
}

pub struct StreamingManager {
    connections: Arc<Mutex<HashMap<String, ConnectionHandle>>>,
    subscriptions: Arc<Mutex<HashMap<String, SubscriptionInfo>>>,
}

impl StreamingManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            subscriptions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        account_id: &str,
        host: &str,
        token: &str,
    ) -> Result<(), NoteDeckError> {
        let mut conns = self.connections.lock().await;
        if conns.contains_key(account_id) {
            return Ok(());
        }

        let url = format!("wss://{host}/streaming?i={token}");

        // Verify initial connection
        let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| NoteDeckError::WebSocket(e.to_string()))?;

        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();

        let account_id_owned = account_id.to_string();
        let url_owned = url.clone();
        let subscriptions = self.subscriptions.clone();
        let app_clone = app.clone();

        let task = tokio::spawn(async move {
            connection_task(
                app_clone,
                account_id_owned,
                url_owned,
                ws_stream,
                cmd_rx,
                subscriptions,
            )
            .await;
        });

        conns.insert(
            account_id.to_string(),
            ConnectionHandle {
                cmd_tx,
                task,
                host: host.to_string(),
            },
        );

        let _ = app.emit(
            "stream-status",
            StreamStatusEvent {
                account_id: account_id.to_string(),
                state: "connected".to_string(),
            },
        );

        Ok(())
    }

    pub async fn disconnect(&self, app: &AppHandle, account_id: &str) {
        let mut conns = self.connections.lock().await;
        if let Some(handle) = conns.remove(account_id) {
            let _ = handle.cmd_tx.send(WsCommand::Shutdown);
            let _ = handle.task.await;
        }

        // Remove all subscriptions for this account
        let mut subs = self.subscriptions.lock().await;
        subs.retain(|_, info| info.account_id != account_id);

        let _ = app.emit(
            "stream-status",
            StreamStatusEvent {
                account_id: account_id.to_string(),
                state: "disconnected".to_string(),
            },
        );
    }

    pub async fn subscribe_timeline(
        &self,
        account_id: &str,
        timeline_type: TimelineType,
    ) -> Result<String, NoteDeckError> {
        let sub_id = uuid::Uuid::new_v4().to_string();
        let channel = timeline_type.ws_channel().to_string();

        let host = self.get_host(account_id).await?;
        self.send_subscribe(account_id, &channel, &sub_id).await?;

        let mut subs = self.subscriptions.lock().await;
        subs.insert(
            sub_id.clone(),
            SubscriptionInfo {
                account_id: account_id.to_string(),
                host,
                kind: "timeline".to_string(),
                channel: channel.clone(),
            },
        );

        Ok(sub_id)
    }

    pub async fn subscribe_main(&self, account_id: &str) -> Result<String, NoteDeckError> {
        let sub_id = uuid::Uuid::new_v4().to_string();

        let host = self.get_host(account_id).await?;
        self.send_subscribe(account_id, "main", &sub_id).await?;

        let mut subs = self.subscriptions.lock().await;
        subs.insert(
            sub_id.clone(),
            SubscriptionInfo {
                account_id: account_id.to_string(),
                host,
                kind: "main".to_string(),
                channel: "main".to_string(),
            },
        );

        Ok(sub_id)
    }

    pub async fn unsubscribe(&self, account_id: &str, subscription_id: &str) -> Result<(), NoteDeckError> {
        let conns = self.connections.lock().await;
        let handle = conns
            .get(account_id)
            .ok_or_else(|| NoteDeckError::NoConnection(account_id.to_string()))?;

        handle
            .cmd_tx
            .send(WsCommand::Unsubscribe {
                id: subscription_id.to_string(),
            })
            .map_err(|_| NoteDeckError::ConnectionClosed)?;

        drop(conns);

        let mut subs = self.subscriptions.lock().await;
        subs.remove(subscription_id);

        Ok(())
    }

    async fn get_host(&self, account_id: &str) -> Result<String, NoteDeckError> {
        let conns = self.connections.lock().await;
        conns
            .get(account_id)
            .map(|h| h.host.clone())
            .ok_or_else(|| NoteDeckError::NoConnection(account_id.to_string()))
    }

    async fn send_subscribe(
        &self,
        account_id: &str,
        channel: &str,
        sub_id: &str,
    ) -> Result<(), NoteDeckError> {
        let conns = self.connections.lock().await;
        let handle = conns
            .get(account_id)
            .ok_or_else(|| NoteDeckError::NoConnection(account_id.to_string()))?;

        handle
            .cmd_tx
            .send(WsCommand::Subscribe {
                channel: channel.to_string(),
                id: sub_id.to_string(),
            })
            .map_err(|_| NoteDeckError::ConnectionClosed)
    }
}

type WsStream = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;
type WsRead = futures_util::stream::SplitStream<WsStream>;
type WsWrite = Arc<
    Mutex<
        futures_util::stream::SplitSink<WsStream, Message>,
    >,
>;

enum WsExitReason {
    Disconnected,
    Shutdown,
}

const MAX_BACKOFF_SECS: u64 = 30;

/// Top-level task that handles reconnection with exponential backoff.
async fn connection_task(
    app: AppHandle,
    account_id: String,
    url: String,
    initial_ws: WsStream,
    mut cmd_rx: mpsc::UnboundedReceiver<WsCommand>,
    subscriptions: Arc<Mutex<HashMap<String, SubscriptionInfo>>>,
) {
    let mut backoff_secs: u64 = 1;

    // Run the first session with the already-connected WebSocket
    let reason = run_ws_session(&app, &account_id, initial_ws, &mut cmd_rx, &subscriptions).await;
    if matches!(reason, WsExitReason::Shutdown) {
        return;
    }

    // Reconnection loop
    loop {
        let _ = app.emit(
            "stream-status",
            StreamStatusEvent {
                account_id: account_id.clone(),
                state: "reconnecting".to_string(),
            },
        );

        // Wait with backoff, but listen for Shutdown during the wait
        let sleep = tokio::time::sleep(Duration::from_secs(backoff_secs));
        tokio::pin!(sleep);

        let shutdown_during_wait = loop {
            tokio::select! {
                _ = &mut sleep => break false,
                cmd = cmd_rx.recv() => {
                    match cmd {
                        Some(WsCommand::Shutdown) | None => break true,
                        // Subscribe/Unsubscribe: safe to drop here because the
                        // subscriptions table is already updated by the caller.
                        // run_ws_session will re-subscribe from that table.
                        _ => {}
                    }
                }
            }
        };

        if shutdown_during_wait {
            return;
        }

        // Attempt reconnection
        match tokio_tungstenite::connect_async(&url).await {
            Ok((ws_stream, _)) => {
                backoff_secs = 1; // Reset backoff on success

                let _ = app.emit(
                    "stream-status",
                    StreamStatusEvent {
                        account_id: account_id.clone(),
                        state: "connected".to_string(),
                    },
                );

                let reason = run_ws_session(
                    &app,
                    &account_id,
                    ws_stream,
                    &mut cmd_rx,
                    &subscriptions,
                )
                .await;

                if matches!(reason, WsExitReason::Shutdown) {
                    return;
                }
            }
            Err(_) => {
                backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
            }
        }
    }
}

/// Run a single WebSocket session. Re-subscribes existing channels, then enters the message loop.
async fn run_ws_session(
    app: &AppHandle,
    account_id: &str,
    ws_stream: WsStream,
    cmd_rx: &mut mpsc::UnboundedReceiver<WsCommand>,
    subscriptions: &Arc<Mutex<HashMap<String, SubscriptionInfo>>>,
) -> WsExitReason {
    let (write, read) = ws_stream.split();
    let write = Arc::new(Mutex::new(write));

    // Collect subscriptions to replay, then drop the lock before doing I/O
    let to_resub: Vec<(String, String)> = {
        let subs = subscriptions.lock().await;
        subs.iter()
            .filter(|(_, info)| info.account_id == account_id)
            .map(|(sub_id, info)| (sub_id.clone(), info.channel.clone()))
            .collect()
    };

    for (sub_id, channel) in &to_resub {
        let msg = json!({
            "type": "connect",
            "body": { "channel": channel, "id": sub_id }
        });
        let mut w = write.lock().await;
        let _ = w.send(Message::Text(msg.to_string().into())).await;
    }

    ws_loop(app, account_id, read, write, cmd_rx, subscriptions).await
}

async fn ws_loop(
    app: &AppHandle,
    account_id: &str,
    mut read: WsRead,
    write: WsWrite,
    cmd_rx: &mut mpsc::UnboundedReceiver<WsCommand>,
    subscriptions: &Arc<Mutex<HashMap<String, SubscriptionInfo>>>,
) -> WsExitReason {
    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_ws_message(app, account_id, &text, subscriptions).await;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let mut w = write.lock().await;
                        let _ = w.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => {
                        return WsExitReason::Disconnected;
                    }
                    _ => {}
                }
            }
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(WsCommand::Subscribe { channel, id }) => {
                        let msg = json!({
                            "type": "connect",
                            "body": { "channel": channel, "id": id }
                        });
                        let mut w = write.lock().await;
                        let _ = w.send(Message::Text(msg.to_string().into())).await;
                    }
                    Some(WsCommand::Unsubscribe { id }) => {
                        let msg = json!({
                            "type": "disconnect",
                            "body": { "id": id }
                        });
                        let mut w = write.lock().await;
                        let _ = w.send(Message::Text(msg.to_string().into())).await;
                    }
                    Some(WsCommand::Shutdown) | None => {
                        let mut w = write.lock().await;
                        let _ = w.close().await;
                        return WsExitReason::Shutdown;
                    }
                }
            }
        }
    }
}

async fn handle_ws_message(
    app: &AppHandle,
    account_id: &str,
    text: &str,
    subscriptions: &Arc<Mutex<HashMap<String, SubscriptionInfo>>>,
) {
    let msg: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Misskey streaming: { "type": "channel", "body": { "id": "...", "type": "...", "body": ... } }
    if msg.get("type").and_then(|v| v.as_str()) != Some("channel") {
        return;
    }

    let body = match msg.get("body") {
        Some(b) => b,
        None => return,
    };

    let sub_id = match body.get("id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return,
    };

    let event_type = match body.get("type").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return,
    };

    let event_body = match body.get("body") {
        Some(b) => b.clone(),
        None => return,
    };

    let subs = subscriptions.lock().await;
    let info = match subs.get(sub_id) {
        Some(i) => i.clone(),
        None => return,
    };
    drop(subs);

    if info.kind == "timeline" && event_type == "note" {
        if let Ok(raw) = serde_json::from_value::<RawNote>(event_body) {
            let note = raw.normalize(account_id, &info.host);
            let _ = app.emit(
                "stream-note",
                StreamNoteEvent {
                    account_id: account_id.to_string(),
                    subscription_id: sub_id.to_string(),
                    note,
                },
            );
        }
    } else if info.kind == "main" {
        if event_type == "notification" {
            if let Ok(raw) = serde_json::from_value::<RawNotification>(event_body.clone()) {
                let notification = raw.normalize(account_id, &info.host);
                let _ = app.emit(
                    "stream-notification",
                    StreamNotificationEvent {
                        account_id: account_id.to_string(),
                        subscription_id: sub_id.to_string(),
                        notification,
                    },
                );
            }
        } else {
            let _ = app.emit(
                "stream-main-event",
                StreamMainEvent {
                    account_id: account_id.to_string(),
                    subscription_id: sub_id.to_string(),
                    event_type: event_type.to_string(),
                    body: event_body,
                },
            );
        }
    }
}
