use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use tauri::State;

use crate::api::MisskeyClient;
use crate::db::Database;
use crate::error::NoteDeckError;
use crate::keychain;
use crate::models::{
    Account, AccountPublic, AuthSession, CreateNoteParams, NormalizedDriveFile, NormalizedNote,
    NormalizedNoteReaction, NormalizedNotification, NormalizedUser, NormalizedUserDetail,
    Antenna, Clip, SearchOptions, StoredServer, TimelineOptions, TimelineType, UserList,
};
use crate::streaming::StreamingManager;
use zeroize::Zeroize;

type Result<T> = std::result::Result<T, NoteDeckError>;

/// Tracks MiAuth sessions to prevent replay attacks.
/// Sessions expire after 15 minutes and are consumed on completion.
pub struct AuthSessionTracker {
    sessions: Mutex<HashMap<String, (String, Instant)>>, // session_id -> (host, created_at)
}

const AUTH_SESSION_TTL_SECS: u64 = 900; // 15 minutes

impl AuthSessionTracker {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    fn register(&self, session_id: &str, host: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        // Purge expired entries while we have the lock
        sessions.retain(|_, (_, created)| created.elapsed().as_secs() < AUTH_SESSION_TTL_SECS);
        sessions.insert(session_id.to_string(), (host.to_string(), Instant::now()));
    }

    fn consume(&self, session_id: &str, host: &str) -> std::result::Result<(), NoteDeckError> {
        let mut sessions = self.sessions.lock().unwrap();
        match sessions.remove(session_id) {
            Some((stored_host, created)) => {
                if created.elapsed().as_secs() >= AUTH_SESSION_TTL_SECS {
                    return Err(NoteDeckError::Auth("Auth session expired".to_string()));
                }
                if stored_host != host {
                    return Err(NoteDeckError::Auth("Host mismatch".to_string()));
                }
                Ok(())
            }
            None => Err(NoteDeckError::Auth(
                "Invalid or already consumed auth session".to_string(),
            )),
        }
    }
}

/// Look up account credentials: tries keychain first, falls back to DB (lazy migration)
fn get_credentials(db: &Database, account_id: &str) -> Result<(String, String)> {
    let account = db
        .get_account(account_id)?
        .ok_or_else(|| NoteDeckError::AccountNotFound(account_id.to_string()))?;
    let host = account.host.clone();

    // Try keychain first (ignore errors — keychain may be unavailable)
    if let Some(token) = keychain::get_token(account_id).ok().flatten() {
        // Keychain has the token; clear DB copy if still present
        if !account.token.is_empty() {
            let _ = db.clear_token(account_id);
        }
        return Ok((host, token));
    }

    // Fallback: use DB token
    let mut db_token = account.token.clone();
    if !db_token.is_empty() {
        // Try lazy migration to keychain; verify before clearing DB
        if keychain::store_token(account_id, &db_token).is_ok()
            && keychain::get_token(account_id)
                .ok()
                .flatten()
                .is_some()
        {
            let _ = db.clear_token(account_id);
        }
        let token = db_token.clone();
        db_token.zeroize();
        return Ok((host, token));
    }

    Err(NoteDeckError::Auth(format!(
        "No token found for account {account_id}"
    )))
}

// --- DB: Accounts ---

#[tauri::command]
pub fn load_accounts(db: State<'_, Database>) -> Result<Vec<AccountPublic>> {
    let accounts = db.load_accounts()?;
    Ok(accounts.iter().map(AccountPublic::from).collect())
}

#[tauri::command]
pub fn delete_account(db: State<'_, Database>, id: String) -> Result<()> {
    let _ = keychain::delete_token(&id);
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
pub async fn api_get_endpoints(
    client: State<'_, MisskeyClient>,
    host: String,
) -> Result<Vec<String>> {
    let host = validate_host(&host)?;
    client.get_endpoints(&host).await
}

#[tauri::command]
pub async fn api_get_user_policies(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
) -> Result<HashMap<String, bool>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_policies(&host, &token).await
}

#[tauri::command]
pub async fn api_update_user_setting(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    key: String,
    value: bool,
) -> Result<()> {
    // Only allow mode-flag toggles (e.g., isInYamiMode, isInHanamiMode)
    if !(key.starts_with("isIn") && key.ends_with("Mode") && key.len() <= 30) {
        return Err(NoteDeckError::InvalidInput(format!("Disallowed setting key: {key}")));
    }
    let (host, token) = get_credentials(&db, &account_id)?;
    client.update_user_setting(&host, &token, &key, value).await
}

#[tauri::command]
pub async fn api_get_endpoint_params(
    client: State<'_, MisskeyClient>,
    host: String,
    endpoint: String,
) -> Result<Vec<String>> {
    let host = validate_host(&host)?;
    if endpoint.len() > 100 || !endpoint.chars().all(|c| c.is_alphanumeric() || c == '/' || c == '-') {
        return Err(NoteDeckError::InvalidInput("Invalid endpoint name".to_string()));
    }
    client.get_endpoint_params(&host, &endpoint).await
}

#[tauri::command]
pub async fn api_get_timeline(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    timeline_type: TimelineType,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_timeline(&host, &token, &account_id, timeline_type.clone(), options.unwrap_or_default())
        .await?;
    if let Err(e) = db.cache_notes(&notes, timeline_type.as_str()) {
        eprintln!("[cache] failed to cache timeline notes: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_user_lists(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
) -> Result<Vec<UserList>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_lists(&host, &token).await
}

#[tauri::command]
pub async fn api_get_antennas(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
) -> Result<Vec<Antenna>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_antennas(&host, &token).await
}

#[tauri::command]
pub async fn api_get_antenna_notes(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    antenna_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_antenna_notes(
            &host,
            &token,
            &account_id,
            &antenna_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_favorites(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_favorites(
            &host,
            &token,
            &account_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_mentions(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_mentions(
            &host,
            &token,
            &account_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_clips(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
) -> Result<Vec<Clip>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_clips(&host, &token).await
}

#[tauri::command]
pub async fn api_get_clip_notes(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    clip_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_clip_notes(
            &host,
            &token,
            &account_id,
            &clip_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
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
pub async fn api_get_note_reactions(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
    reaction_type: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<NormalizedNoteReaction>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_note_reactions(
            &host,
            &token,
            &note_id,
            reaction_type.as_deref(),
            limit.unwrap_or(11).clamp(1, 100),
        )
        .await
}

#[tauri::command]
pub async fn api_update_note(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
    params: CreateNoteParams,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .update_note(&host, &token, &note_id, params)
        .await
}

const MAX_UPLOAD_BYTES: usize = 50 * 1024 * 1024; // 50 MB

#[tauri::command]
pub async fn api_upload_file(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    file_name: String,
    file_data: Vec<u8>,
    content_type: String,
    is_sensitive: bool,
) -> Result<NormalizedDriveFile> {
    if file_data.len() > MAX_UPLOAD_BYTES {
        return Err(NoteDeckError::InvalidInput("File too large".to_string()));
    }
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .upload_file(&host, &token, &file_name, file_data, &content_type, is_sensitive)
        .await
}

#[tauri::command]
pub async fn api_create_favorite(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.create_favorite(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_delete_favorite(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_favorite(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_delete_note(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_note(&host, &token, &note_id).await
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
    if query.len() > 1000 {
        return Err(NoteDeckError::InvalidInput("Search query too long".to_string()));
    }
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .search_notes(&host, &token, &account_id, &query, options.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn api_get_note_children(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
    limit: Option<u32>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_note_children(&host, &token, &account_id, &note_id, limit.unwrap_or(30).clamp(1, 100))
        .await
}

#[tauri::command]
pub async fn api_get_note_conversation(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    note_id: String,
    limit: Option<u32>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_note_conversation(&host, &token, &account_id, &note_id, limit.unwrap_or(30).clamp(1, 100))
        .await
}

#[tauri::command]
pub async fn api_lookup_user(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    username: String,
    host: Option<String>,
) -> Result<NormalizedUser> {
    if username.is_empty() || username.len() > 255 {
        return Err(NoteDeckError::InvalidInput("Invalid username".to_string()));
    }
    let validated_host = host.map(|h| validate_host(&h)).transpose()?;
    let (server_host, token) = get_credentials(&db, &account_id)?;
    client
        .lookup_user(&server_host, &token, &username, validated_host.as_deref())
        .await
}

#[tauri::command]
pub async fn api_follow_user(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.follow_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_unfollow_user(
    db: State<'_, Database>,
    client: State<'_, MisskeyClient>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unfollow_user(&host, &token, &user_id).await
}

#[tauri::command]
pub fn api_get_cached_timeline(
    db: State<'_, Database>,
    account_id: String,
    timeline_type: String,
    limit: Option<i64>,
) -> Result<Vec<NormalizedNote>> {
    db.get_cached_timeline(&account_id, &timeline_type, limit.unwrap_or(40).clamp(1, 200))
}

#[tauri::command]
pub fn api_search_notes_local(
    db: State<'_, Database>,
    account_id: String,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<NormalizedNote>> {
    if query.len() > 1000 {
        return Err(NoteDeckError::InvalidInput("Search query too long".to_string()));
    }
    db.search_cached_notes(&account_id, &query, limit.unwrap_or(30).clamp(1, 200))
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

    // SSRF prevention: block loopback, private, and link-local addresses
    let ssrf_blocked = [
        "localhost",
        "127.",
        "0.0.0.0",
        "[::1]",
        "::1",
        "10.",
        "192.168.",
        "169.254.",
        "[fc",       // IPv6 ULA (fc00::/7)
        "[fd",       // IPv6 ULA (fd00::/8)
        "[fe80:",    // IPv6 link-local
        "[::ffff:",  // IPv4-mapped IPv6
    ];
    if ssrf_blocked.iter().any(|p| normalized.starts_with(p)) {
        return Err(NoteDeckError::InvalidInput(
            "Loopback and private addresses are not allowed".to_string(),
        ));
    }
    // 172.16.0.0/12
    if normalized.starts_with("172.") {
        if let Some(second) = normalized.strip_prefix("172.").and_then(|s| s.split('.').next()) {
            if let Ok(n) = second.parse::<u8>() {
                if (16..=31).contains(&n) {
                    return Err(NoteDeckError::InvalidInput(
                        "Loopback and private addresses are not allowed".to_string(),
                    ));
                }
            }
        }
    }
    // Block reserved TLDs
    if normalized.ends_with(".local")
        || normalized.ends_with(".internal")
        || normalized.ends_with(".localhost")
    {
        return Err(NoteDeckError::InvalidInput(
            "Reserved domain names are not allowed".to_string(),
        ));
    }

    Ok(normalized)
}

#[tauri::command]
pub async fn auth_start(
    tracker: State<'_, AuthSessionTracker>,
    host: String,
    permissions: Option<Vec<String>>,
) -> Result<AuthSession> {
    let host = validate_host(&host)?;
    let session_id = uuid::Uuid::new_v4().to_string();
    let perms = permissions.unwrap_or_else(|| {
        vec![
            "read:account",
            "write:account",
            "read:notifications",
            "read:reactions",
            "read:favorites",
            "write:drive",
            "write:favorites",
            "write:following",
            "write:notes",
            "write:reactions",
            "write:votes",
        ]
        .into_iter()
        .map(String::from)
        .collect()
    });
    for perm in &perms {
        if !perm.chars().all(|c| c.is_alphanumeric() || c == ':' || c == '-') || perm.len() > 50 {
            return Err(NoteDeckError::InvalidInput(format!("Invalid permission: {perm}")));
        }
    }
    let permission_str = perms.join(",");
    let url = format!(
        "https://{host}/miauth/{session_id}?name=notedeck&permission={permission_str}"
    );
    tracker.register(&session_id, &host);
    Ok(AuthSession {
        session_id,
        url,
        host,
    })
}

#[tauri::command]
pub async fn auth_complete_and_save(
    tracker: State<'_, AuthSessionTracker>,
    client: State<'_, MisskeyClient>,
    db: State<'_, Database>,
    session: AuthSession,
    software: String,
) -> Result<AccountPublic> {
    // Validate this session was created by auth_start and hasn't been replayed
    tracker.consume(&session.session_id, &session.host)?;

    let auth_result = client
        .complete_auth(&session.host, &session.session_id)
        .await?;

    let mut token = auth_result.token;

    // DB にはトークン込みで保存（キーチェーンのフォールバック）
    let account = Account {
        id: uuid::Uuid::new_v4().to_string(),
        host: session.host.clone(),
        token: token.clone(),
        user_id: auth_result.user.id.clone(),
        username: auth_result.user.username.clone(),
        display_name: auth_result.user.name.clone(),
        avatar_url: auth_result.user.avatar_url.clone(),
        software,
    };

    db.upsert_account(&account)?;

    // Re-auth の場合、DB 上の id は既存のものが維持されるので正しい id を返す
    let saved = db
        .get_account_by_host_user(&session.host, &auth_result.user.id)?
        .ok_or_else(|| NoteDeckError::Auth("Failed to save account".to_string()))?;

    // キーチェーンに保存し、読み戻せたら DB のトークンをクリア
    if keychain::store_token(&saved.id, &token).is_ok()
        && keychain::get_token(&saved.id)
            .ok()
            .flatten()
            .is_some()
    {
        let _ = db.clear_token(&saved.id);
    }
    token.zeroize();

    Ok(AccountPublic::from(&saved))
    // account, saved が drop → token が zeroize される
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
    streaming
        .subscribe_antenna(&account_id, &antenna_id)
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
