use std::sync::Arc;

use tauri::State;

use notecli::api::MisskeyClient;
use notecli::db::Database;
use notecli::models::{ChatMessage, NormalizedNotification, TimelineOptions};

use super::{get_credentials, Result};

// --- Notifications ---

#[tauri::command]
pub async fn api_get_notifications(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNotification>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_notifications(&host, &token, &account_id, options.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn api_get_unread_notification_count(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<i64> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_unread_notification_count(&host, &token)
        .await
}

#[tauri::command]
pub async fn api_mark_all_notifications_as_read(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .mark_all_notifications_as_read(&host, &token)
        .await
}

// --- Unread chat ---

#[tauri::command]
pub async fn api_get_unread_chat(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<bool> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_unread_chat(&host, &token).await
}

// --- Chat ---

#[tauri::command]
pub async fn api_get_chat_history(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    limit: Option<i64>,
    room: Option<bool>,
) -> Result<Vec<ChatMessage>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_chat_history(&host, &token, limit.unwrap_or(100), room.unwrap_or(false))
        .await
}

#[tauri::command]
pub async fn api_get_chat_user_messages(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<ChatMessage>> {
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
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    room_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<ChatMessage>> {
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
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: Option<String>,
    room_id: Option<String>,
    text: String,
) -> Result<ChatMessage> {
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
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    message_id: String,
    reaction: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .react_chat_message(&host, &token, &message_id, &reaction)
        .await
}

#[tauri::command]
pub async fn api_unreact_chat_message(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    message_id: String,
    reaction: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .unreact_chat_message(&host, &token, &message_id, &reaction)
        .await
}

// --- Legacy messaging ---

#[tauri::command]
pub async fn api_create_messaging_message(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    params: serde_json::Value,
) -> Result<ChatMessage> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.create_messaging_message(&host, &token, params).await
}
