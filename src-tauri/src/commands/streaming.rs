use tauri::State;

use notecli::db::Database;
use notecli::models::TimelineType;
use notecli::streaming::StreamingManager;

use super::{get_credentials, AppState, Result};

/// Ensure the streaming WebSocket is connected for the given account.
async fn ensure_stream_connected(
    db: &Database,
    streaming: &StreamingManager,
    account_id: &str,
) -> Result<()> {
    let (host, token) = get_credentials(db, account_id)?;
    streaming.connect(account_id, &host, &token).await
}

#[tauri::command]
pub async fn stream_connect(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
) -> Result<()> {
    let db = app_state.db().await;
    ensure_stream_connected(&db, &streaming, &account_id).await
}

/// Connect + subscribe in a single IPC round-trip (timeline).
#[tauri::command]
pub async fn stream_connect_and_subscribe_timeline(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
    timeline_type: TimelineType,
    list_id: Option<String>,
) -> Result<String> {
    let db = app_state.db().await;
    ensure_stream_connected(&db, &streaming, &account_id).await?;
    streaming
        .subscribe_timeline(&account_id, timeline_type, list_id)
        .await
}

/// Connect + subscribe in a single IPC round-trip (antenna).
#[tauri::command]
pub async fn stream_connect_and_subscribe_antenna(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
    antenna_id: String,
) -> Result<String> {
    let db = app_state.db().await;
    ensure_stream_connected(&db, &streaming, &account_id).await?;
    streaming.subscribe_antenna(&account_id, &antenna_id).await
}

/// Connect + subscribe in a single IPC round-trip (channel).
#[tauri::command]
pub async fn stream_connect_and_subscribe_channel(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
    channel_id: String,
) -> Result<String> {
    let db = app_state.db().await;
    ensure_stream_connected(&db, &streaming, &account_id).await?;
    streaming.subscribe_channel(&account_id, &channel_id).await
}

#[tauri::command]
pub async fn stream_disconnect(
    streaming: State<'_, StreamingManager>,
    account_id: String,
) -> Result<()> {
    streaming.disconnect(&account_id).await;
    Ok(())
}

/// Switch between realtime (WebSocket) and polling (HTTP) mode.
/// Subscriptions are preserved across the switch.
#[tauri::command]
pub async fn stream_set_mode(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
    mode: String,
    interval_ms: Option<u64>,
) -> Result<()> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming
        .set_mode(&account_id, &host, &token, &mode, interval_ms)
        .await
}

#[tauri::command]
pub async fn stream_subscribe_timeline(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    timeline_type: TimelineType,
    list_id: Option<String>,
) -> Result<String> {
    streaming
        .subscribe_timeline(&account_id, timeline_type, list_id)
        .await
}

#[tauri::command]
pub async fn stream_subscribe_antenna(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    antenna_id: String,
) -> Result<String> {
    streaming.subscribe_antenna(&account_id, &antenna_id).await
}

#[tauri::command]
pub async fn stream_subscribe_channel(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    channel_id: String,
) -> Result<String> {
    streaming.subscribe_channel(&account_id, &channel_id).await
}

#[tauri::command]
pub async fn stream_subscribe_chat_user(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    other_id: String,
) -> Result<String> {
    streaming.subscribe_chat_user(&account_id, &other_id).await
}

#[tauri::command]
pub async fn stream_subscribe_chat_room(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    room_id: String,
) -> Result<String> {
    streaming.subscribe_chat_room(&account_id, &room_id).await
}

#[tauri::command]
pub async fn stream_subscribe_main(
    streaming: State<'_, StreamingManager>,
    account_id: String,
) -> Result<String> {
    streaming.subscribe_main(&account_id).await
}

#[tauri::command]
pub async fn stream_unsubscribe(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    subscription_id: String,
) -> Result<()> {
    streaming.unsubscribe(&account_id, &subscription_id).await
}

#[tauri::command]
pub async fn stream_sub_note(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    streaming.sub_note(&account_id, &note_id).await
}

#[tauri::command]
pub async fn stream_unsub_note(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    streaming.unsub_note(&account_id, &note_id).await
}
