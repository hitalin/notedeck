use std::collections::HashMap;

use tauri::State;

use crate::api::MisskeyClient;
use crate::db::Database;
use crate::models::*;
use crate::streaming::StreamingManager;

type Result<T> = std::result::Result<T, String>;

fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}

/// Look up account credentials from DB
fn get_credentials(db: &Database, account_id: &str) -> Result<(String, String)> {
    let accounts = db.load_accounts().map_err(db_err)?;
    let account = accounts
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| format!("Account not found: {account_id}"))?;
    Ok((account.host, account.token))
}

// --- DB: Accounts ---

#[tauri::command]
pub fn load_accounts(db: State<'_, Database>) -> Result<Vec<Account>> {
    db.load_accounts().map_err(db_err)
}

#[tauri::command]
pub fn upsert_account(db: State<'_, Database>, account: Account) -> Result<()> {
    db.upsert_account(&account).map_err(db_err)
}

#[tauri::command]
pub fn delete_account(db: State<'_, Database>, id: String) -> Result<()> {
    db.delete_account(&id).map_err(db_err)
}

// --- DB: Servers ---

#[tauri::command]
pub fn load_servers(db: State<'_, Database>) -> Result<Vec<StoredServer>> {
    db.load_servers().map_err(db_err)
}

#[tauri::command]
pub fn get_server(db: State<'_, Database>, host: String) -> Result<Option<StoredServer>> {
    db.get_server(&host).map_err(db_err)
}

#[tauri::command]
pub fn upsert_server(db: State<'_, Database>, server: StoredServer) -> Result<()> {
    db.upsert_server(&server).map_err(db_err)
}

// --- API ---

#[tauri::command]
pub async fn api_get_timeline(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    timeline_type: String,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_timeline(&host, &token, &account_id, &timeline_type, options.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn api_get_note(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
) -> Result<NormalizedNote> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_note(&host, &token, &account_id, &note_id).await
}

#[tauri::command]
pub async fn api_create_note(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    params: CreateNoteParams,
) -> Result<NormalizedNote> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .create_note(&host, &token, &account_id, params)
        .await
}

#[tauri::command]
pub async fn api_create_reaction(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
    reaction: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .create_reaction(&host, &token, &note_id, &reaction)
        .await
}

#[tauri::command]
pub async fn api_delete_reaction(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_reaction(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_get_user(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    user_id: String,
) -> Result<NormalizedUser> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_get_user_detail(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    user_id: String,
) -> Result<NormalizedUserDetail> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_detail(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_get_user_notes(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    user_id: String,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_user_notes(&host, &token, &account_id, &user_id, options.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn api_get_server_emojis(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
) -> Result<HashMap<String, String>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_server_emojis(&host, &token).await
}

#[tauri::command]
pub async fn api_get_notifications(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNotification>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_notifications(&host, &token, &account_id, options.unwrap_or_default())
        .await
}

// --- Auth ---

#[tauri::command]
pub async fn auth_start(host: String, permissions: Option<Vec<String>>) -> Result<AuthSession> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let perms = permissions.unwrap_or_else(|| {
        vec![
            "read:account",
            "read:blocks",
            "read:drive",
            "read:favorites",
            "read:following",
            "read:messaging",
            "read:mutes",
            "read:notifications",
            "read:reactions",
            "write:drive",
            "write:favorites",
            "write:following",
            "write:messaging",
            "write:mutes",
            "write:notes",
            "write:notifications",
            "write:reactions",
            "write:votes",
        ]
        .into_iter()
        .map(String::from)
        .collect()
    });
    let permission_str = perms.join(",");
    let url = format!(
        "https://{host}/miauth/{session_id}?name=notedeck&permission={permission_str}"
    );
    Ok(AuthSession {
        session_id,
        url,
        host,
    })
}

#[tauri::command]
pub async fn auth_complete(
    client: State<'_, MisskeyClient>,
    session: AuthSession,
) -> Result<AuthResult> {
    client
        .complete_auth(&session.host, &session.session_id)
        .await
}

#[tauri::command]
pub async fn auth_verify_token(
    client: State<'_, MisskeyClient>,
    host: String,
    token: String,
) -> Result<NormalizedUser> {
    client.verify_token(&host, &token).await
}

// --- Streaming ---

#[tauri::command]
pub async fn stream_connect(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(app, &account_id, &host, &token).await
}

#[tauri::command]
pub async fn stream_disconnect(
    app: tauri::AppHandle,
    streaming: State<'_, StreamingManager>,
    account_id: String,
) -> Result<()> {
    streaming.disconnect(&app, &account_id).await;
    Ok(())
}

#[tauri::command]
pub async fn stream_subscribe_timeline(
    streaming: State<'_, StreamingManager>,
    account_id: String,
    timeline_type: String,
) -> Result<String> {
    streaming
        .subscribe_timeline(&account_id, &timeline_type)
        .await
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
