use tauri::State;

use notecli::models::{ChatMessage, NormalizedNotification, TimelineOptions};

use super::{get_credentials, AppState, Result};

// --- Notifications ---

#[tauri::command]
pub async fn api_get_notifications(
    app_state: State<'_, AppState>,
    account_id: String,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNotification>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_notifications(&host, &token, &account_id, options.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn api_get_notifications_grouped(
    app_state: State<'_, AppState>,
    account_id: String,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNotification>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_notifications_grouped(&host, &token, &account_id, options.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn api_get_unread_notification_count(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<i64> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_unread_notification_count(&host, &token)
        .await
}

#[tauri::command]
pub async fn api_mark_all_notifications_as_read(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .mark_all_notifications_as_read(&host, &token)
        .await
}

// --- Unread chat ---

#[tauri::command]
pub async fn api_get_unread_chat(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<bool> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_unread_chat(&host, &token).await
}

// --- Chat ---

#[tauri::command]
pub async fn api_get_chat_history(
    app_state: State<'_, AppState>,
    account_id: String,
    limit: Option<i64>,
    room: Option<bool>,
) -> Result<Vec<ChatMessage>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_chat_history(&host, &token, limit.unwrap_or(100), room.unwrap_or(false))
        .await
}

#[tauri::command]
pub async fn api_get_chat_user_messages(
    app_state: State<'_, AppState>,
    account_id: String,
    user_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<ChatMessage>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_chat_user_messages(
            &host,
            &token,
            &user_id,
            limit.unwrap_or(30),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_chat_room_messages(
    app_state: State<'_, AppState>,
    account_id: String,
    room_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<ChatMessage>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_chat_room_messages(
            &host,
            &token,
            &room_id,
            limit.unwrap_or(30),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_create_chat_message(
    app_state: State<'_, AppState>,
    account_id: String,
    user_id: Option<String>,
    room_id: Option<String>,
    text: String,
) -> Result<ChatMessage> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    match (user_id, room_id) {
        (Some(uid), _) => {
            client
                .create_chat_message_to_user(&host, &token, &uid, &text)
                .await
        }
        (_, Some(rid)) => {
            client
                .create_chat_message_to_room(&host, &token, &rid, &text)
                .await
        }
        _ => Err(notecli::error::NoteDeckError::InvalidInput(
            "Either userId or roomId is required".to_string(),
        )),
    }
}

// --- Chat reactions ---

#[tauri::command]
pub async fn api_react_chat_message(
    app_state: State<'_, AppState>,
    account_id: String,
    message_id: String,
    reaction: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .react_chat_message(&host, &token, &message_id, &reaction)
        .await
}

#[tauri::command]
pub async fn api_unreact_chat_message(
    app_state: State<'_, AppState>,
    account_id: String,
    message_id: String,
    reaction: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .unreact_chat_message(&host, &token, &message_id, &reaction)
        .await
}

// --- Legacy messaging ---

#[tauri::command]
pub async fn api_create_messaging_message(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<ChatMessage> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.create_messaging_message(&host, &token, params).await
}
