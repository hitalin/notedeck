use std::collections::HashMap;

use tauri::State;

use crate::api::MisskeyClient;
use crate::db::Database;
use crate::error::NoteDeckError;
use crate::models::{
    Account, AuthResult, AuthSession, CreateNoteParams, NormalizedNote, NormalizedNotification,
    NormalizedUser, NormalizedUserDetail, SearchOptions, StoredServer, TimelineOptions, TimelineType,
};
use crate::streaming::StreamingManager;

type Result<T> = std::result::Result<T, NoteDeckError>;

/// Look up account credentials from DB
fn get_credentials(db: &Database, account_id: &str) -> Result<(String, String)> {
    let account = db
        .get_account(account_id)?
        .ok_or_else(|| NoteDeckError::AccountNotFound(account_id.to_string()))?;
    Ok((account.host, account.token))
}

// --- DB: Accounts ---

#[tauri::command]
pub fn load_accounts(db: State<'_, Database>) -> Result<Vec<Account>> {
    db.load_accounts()
}

#[tauri::command]
pub fn upsert_account(db: State<'_, Database>, account: Account) -> Result<()> {
    db.upsert_account(&account)
}

#[tauri::command]
pub fn delete_account(db: State<'_, Database>, id: String) -> Result<()> {
    db.delete_account(&id)
}

// --- DB: Servers ---

#[tauri::command]
pub fn load_servers(db: State<'_, Database>) -> Result<Vec<StoredServer>> {
    db.load_servers()
}

#[tauri::command]
pub fn get_server(db: State<'_, Database>, host: String) -> Result<Option<StoredServer>> {
    db.get_server(&host)
}

#[tauri::command]
pub fn upsert_server(db: State<'_, Database>, server: StoredServer) -> Result<()> {
    db.upsert_server(&server)
}

// --- API ---

#[tauri::command]
pub async fn api_get_timeline(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    timeline_type: TimelineType,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_timeline(&host, &token, &account_id, timeline_type, options.unwrap_or_default())
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

#[tauri::command]
pub async fn api_search_notes(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .search_notes(&host, &token, &account_id, &query, options.unwrap_or_default())
        .await
}

// --- Theme ---

#[tauri::command]
pub async fn api_fetch_account_theme(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;

    let mut result = serde_json::json!({});

    // 1. Try new preferences sync
    let sync_scope = vec!["client".to_string(), "preferences".to_string(), "sync".to_string()];
    if let Ok(Some(data)) = client.get_registry_all(&host, &token, &sync_scope).await {
        if let Some(dark) = data.get("default:darkTheme") {
            result["syncDark"] = dark.clone();
        }
        if let Some(light) = data.get("default:lightTheme") {
            result["syncLight"] = light.clone();
        }
    }

    // 2. Try legacy Pizzax/ColdDeviceStorage
    if result.get("syncDark").is_none() && result.get("syncLight").is_none() {
        let base_scope = vec!["client".to_string(), "base".to_string()];
        if let Ok(Some(data)) = client.get_registry_all(&host, &token, &base_scope).await {
            if let Some(dark) = data.get("darkTheme") {
                result["baseDark"] = dark.clone();
            }
            if let Some(light) = data.get("lightTheme") {
                result["baseLight"] = light.clone();
            }
        }
    }

    // 3. Fall back to server defaults from /api/meta
    let has_any = result.get("syncDark").is_some()
        || result.get("syncLight").is_some()
        || result.get("baseDark").is_some()
        || result.get("baseLight").is_some();

    if !has_any {
        if let Ok(meta) = client.get_meta(&host, &token).await {
            if let Some(dark) = meta.get("defaultDarkTheme") {
                result["metaDark"] = dark.clone();
            }
            if let Some(light) = meta.get("defaultLightTheme") {
                result["metaLight"] = light.clone();
            }
        }
    }

    Ok(result)
}

// --- Auth ---

fn validate_host(host: &str) -> Result<String> {
    let normalized = host.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err(NoteDeckError::InvalidInput("Host cannot be empty".to_string()));
    }
    if normalized.len() > 253 {
        return Err(NoteDeckError::InvalidInput("Host too long".to_string()));
    }
    if normalized.contains(['/', '?', '#', '@', ' ', '\n', '\r']) {
        return Err(NoteDeckError::InvalidInput(format!("Invalid host: {normalized}")));
    }
    Ok(normalized)
}

#[tauri::command]
pub async fn auth_start(host: String, permissions: Option<Vec<String>>) -> Result<AuthSession> {
    let host = validate_host(&host)?;
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
    timeline_type: TimelineType,
) -> Result<String> {
    streaming
        .subscribe_timeline(&account_id, timeline_type)
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
