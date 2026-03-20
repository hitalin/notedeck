use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

use notecli::api::MisskeyClient;
use notecli::db::Database;
use notecli::error::NoteDeckError;
use notecli::keychain;
use notecli::models::{
    Account, AccountPublic, Antenna, AuthSession, Channel, ChatMessage, Clip, CreateNoteParams,
    NormalizedDriveFile, NormalizedNote, NormalizedNoteReaction, NormalizedNotification,
    NormalizedUser, NormalizedUserDetail, RawCreateNoteResponse, RawNote, SearchOptions,
    ServerEmoji, StoredServer, TimelineOptions, TimelineType, UserList,
};
use notecli::streaming::StreamingManager;
use tauri::Manager;
use zeroize::Zeroize;

/// Regex for extracting HTTPS URLs from note text
static URL_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"https?://[\w\-._~:/?#\[\]@!$&'()*+,;=%]+").unwrap());

/// Media extensions to skip OGP prefetch for (they won't have OGP tags)
static MEDIA_EXT_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|ogg|wav)(\?.*)?$")
        .unwrap()
});

#[derive(Serialize)]
pub struct TimelineEnriched {
    pub notes: Vec<NormalizedNote>,
    pub ogp_hints: HashMap<String, crate::ogp::OgpData>,
}

fn extract_ogp_urls(text: &str) -> Vec<String> {
    URL_RE
        .find_iter(text)
        .map(|m| m.as_str().to_string())
        .filter(|u| !MEDIA_EXT_RE.is_match(u))
        .collect()
}

type Result<T> = std::result::Result<T, NoteDeckError>;

const CREDENTIAL_CACHE_TTL: Duration = Duration::from_secs(60);

struct CachedCredential {
    host: String,
    token: String,
    cached_at: Instant,
}

impl Drop for CachedCredential {
    fn drop(&mut self) {
        self.token.zeroize();
    }
}

pub struct CredentialCache {
    cache: Mutex<HashMap<String, CachedCredential>>,
}

impl CredentialCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    fn get(&self, account_id: &str) -> Option<(String, String)> {
        let mut cache = self.cache.lock().ok()?;
        if let Some(entry) = cache.get(account_id) {
            if entry.cached_at.elapsed() < CREDENTIAL_CACHE_TTL {
                return Some((entry.host.clone(), entry.token.clone()));
            }
            // Expired: remove immediately (triggers Drop → zeroize)
            cache.remove(account_id);
        }
        None
    }

    fn insert(&self, account_id: &str, host: &str, token: &str) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(
                account_id.to_string(),
                CachedCredential {
                    host: host.to_string(),
                    token: token.to_string(),
                    cached_at: Instant::now(),
                },
            );
        }
    }

    pub fn invalidate(&self, account_id: &str) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.remove(account_id); // Drop → zeroize
        }
    }
}

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

static CREDENTIAL_CACHE: LazyLock<CredentialCache> = LazyLock::new(CredentialCache::new);

/// Look up account credentials: uses in-memory cache, then keychain, then DB (lazy migration)
pub fn get_credentials(db: &Database, account_id: &str) -> Result<(String, String)> {
    // Fast path: check in-memory cache first
    if let Some(cached) = CREDENTIAL_CACHE.get(account_id) {
        return Ok(cached);
    }

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
        CREDENTIAL_CACHE.insert(account_id, &host, &token);
        return Ok((host, token));
    }

    // Fallback: use DB token
    let mut db_token = account.token.clone();
    if !db_token.is_empty() {
        // Try lazy migration to keychain; verify before clearing DB
        if keychain::store_token(account_id, &db_token).is_ok()
            && keychain::get_token(account_id).ok().flatten().is_some()
        {
            let _ = db.clear_token(account_id);
        }
        let token = db_token.clone();
        db_token.zeroize();
        CREDENTIAL_CACHE.insert(account_id, &host, &token);
        return Ok((host, token));
    }

    Err(NoteDeckError::Auth(format!(
        "No token found for account {account_id}"
    )))
}

/// Invalidate cached credentials (call on logout/token change)
pub fn invalidate_credentials(account_id: &str) {
    CREDENTIAL_CACHE.invalidate(account_id);
}

/// Write account list (non-secret metadata only) to a JSON file for background workers.
/// The file contains host, account_id, and username — no tokens.
pub fn export_account_list(app: &tauri::AppHandle, db: &Database) {
    let Ok(app_dir) = app.path().app_data_dir() else {
        return;
    };
    let Ok(accounts) = db.load_accounts() else {
        return;
    };
    let list: Vec<serde_json::Value> = accounts
        .iter()
        .map(|a| {
            serde_json::json!({
                "id": a.id,
                "host": a.host,
                "username": a.username,
            })
        })
        .collect();
    let _ = std::fs::write(
        app_dir.join("poll_accounts.json"),
        serde_json::to_string(&list).unwrap_or_default(),
    );
}

// --- DB: Accounts ---

#[tauri::command]
pub fn load_accounts(db: State<'_, Arc<Database>>) -> Result<Vec<AccountPublic>> {
    let accounts = db.load_accounts()?;
    Ok(accounts.iter().map(AccountPublic::from).collect())
}

#[tauri::command]
pub fn delete_account(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<()> {
    invalidate_credentials(&id);
    let _ = keychain::delete_token(&id);
    db.delete_account(&id)?;
    export_account_list(&app, &db);
    Ok(())
}

// --- DB: Servers ---

#[tauri::command]
pub fn load_servers(db: State<'_, Arc<Database>>) -> Result<Vec<StoredServer>> {
    db.load_servers()
}

#[tauri::command]
pub fn get_server(db: State<'_, Arc<Database>>, host: String) -> Result<Option<StoredServer>> {
    db.get_server(&host)
}

#[tauri::command]
pub fn upsert_server(db: State<'_, Arc<Database>>, server: StoredServer) -> Result<()> {
    db.upsert_server(&server)
}

// --- API ---

#[tauri::command]
pub async fn api_get_endpoints(
    client: State<'_, Arc<MisskeyClient>>,
    host: String,
) -> Result<Vec<String>> {
    let host = validate_host(&host)?;
    client.get_endpoints(&host).await
}

#[tauri::command]
pub async fn api_get_user_policies(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<HashMap<String, bool>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_policies(&host, &token).await
}

#[tauri::command]
pub async fn api_update_user_setting(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    key: String,
    value: bool,
) -> Result<()> {
    // Only allow mode-flag toggles (e.g., isInYamiMode, isInHanamiMode)
    if !(key.starts_with("isIn") && key.ends_with("Mode") && key.len() <= 30) {
        return Err(NoteDeckError::InvalidInput(format!(
            "Disallowed setting key: {key}"
        )));
    }
    let (host, token) = get_credentials(&db, &account_id)?;
    client.update_user_setting(&host, &token, &key, value).await
}

#[tauri::command]
pub async fn api_get_endpoint_params(
    client: State<'_, Arc<MisskeyClient>>,
    host: String,
    endpoint: String,
) -> Result<Vec<String>> {
    let host = validate_host(&host)?;
    if endpoint.len() > 100
        || !endpoint
            .chars()
            .all(|c| c.is_alphanumeric() || c == '/' || c == '-')
    {
        return Err(NoteDeckError::InvalidInput(
            "Invalid endpoint name".to_string(),
        ));
    }
    client.get_endpoint_params(&host, &endpoint).await
}

#[tauri::command]
pub async fn api_get_timeline(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    timeline_type: TimelineType,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let opts = options.unwrap_or_default();
    let cache_key = if timeline_type.as_str() == "user-list" {
        if let Some(ref list_id) = opts.list_id {
            format!("user-list:{list_id}")
        } else {
            timeline_type.as_str().to_string()
        }
    } else {
        timeline_type.as_str().to_string()
    };
    let notes = client
        .get_timeline(&host, &token, &account_id, timeline_type, opts)
        .await?;
    if let Err(e) = db.cache_notes(&notes, &cache_key) {
        eprintln!("[cache] failed to cache timeline notes: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_timeline_enriched(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    ogp_cache: State<'_, crate::ogp::OgpCache>,
    account_id: String,
    timeline_type: TimelineType,
    options: Option<TimelineOptions>,
) -> Result<TimelineEnriched> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let opts = options.unwrap_or_default();
    let cache_key = if timeline_type.as_str() == "user-list" {
        if let Some(ref list_id) = opts.list_id {
            format!("user-list:{list_id}")
        } else {
            timeline_type.as_str().to_string()
        }
    } else {
        timeline_type.as_str().to_string()
    };
    let notes = client
        .get_timeline(&host, &token, &account_id, timeline_type, opts)
        .await?;
    if let Err(e) = db.cache_notes(&notes, &cache_key) {
        eprintln!("[cache] failed to cache timeline notes: {e}");
    }

    // Extract unique URLs from all note texts (skip media URLs)
    let mut urls: Vec<String> = Vec::new();
    for note in &notes {
        if let Some(ref text) = note.text {
            urls.extend(extract_ogp_urls(text));
        }
        if let Some(ref renote) = note.renote {
            if let Some(ref text) = renote.text {
                urls.extend(extract_ogp_urls(text));
            }
        }
    }
    urls.sort_unstable();
    urls.dedup();

    // Parallel OGP prefetch (best-effort, errors are silently skipped)
    let ogp_hints = if urls.is_empty() {
        HashMap::new()
    } else {
        let ogp = &*ogp_cache;
        let futs: Vec<_> = urls
            .into_iter()
            .map(|url| {
                let host = host.clone();
                let token = token.clone();
                async move {
                    let result = ogp.get_ogp_via_server(&url, &host, &token).await;
                    (url, result.ok())
                }
            })
            .collect();
        let results = futures_util::future::join_all(futs).await;
        results
            .into_iter()
            .filter_map(|(url, data)| data.map(|d| (url, d)))
            .collect()
    };

    Ok(TimelineEnriched { notes, ogp_hints })
}

#[tauri::command]
pub async fn api_get_user_lists(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<Vec<UserList>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_lists(&host, &token).await
}

#[tauri::command]
pub async fn api_get_antennas(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<Vec<Antenna>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_antennas(&host, &token).await
}

#[tauri::command]
pub async fn api_get_antenna_notes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    antenna_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_antenna_notes(
            &host,
            &token,
            &account_id,
            &antenna_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await?;
    if let Err(e) = db.cache_notes(&notes, &format!("antenna:{antenna_id}")) {
        eprintln!("[cache] failed to cache antenna notes: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_favorites(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_favorites(
            &host,
            &token,
            &account_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await?;
    if let Err(e) = db.cache_notes(&notes, "favorites") {
        eprintln!("[cache] failed to cache favorites: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_featured_notes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    limit: Option<i64>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_featured_notes(&host, &token, &account_id, limit.unwrap_or(30))
        .await?;
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_mentions(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
    visibility: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_mentions(
            &host,
            &token,
            &account_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
            visibility.as_deref(),
        )
        .await?;
    if let Err(e) = db.cache_notes(&notes, "mentions") {
        eprintln!("[cache] failed to cache mentions: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_clips(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<Vec<Clip>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_clips(&host, &token).await
}

#[tauri::command]
pub async fn api_get_clip_notes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    clip_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_clip_notes(
            &host,
            &token,
            &account_id,
            &clip_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await?;
    if let Err(e) = db.cache_notes(&notes, &format!("clip:{clip_id}")) {
        eprintln!("[cache] failed to cache clip notes: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_channels(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<Vec<Channel>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_channels(&host, &token).await
}

#[tauri::command]
pub async fn api_get_channel_notes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    channel_id: String,
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_channel_notes(
            &host,
            &token,
            &account_id,
            &channel_id,
            limit.unwrap_or(20),
            since_id.as_deref(),
            until_id.as_deref(),
        )
        .await?;
    if let Err(e) = db.cache_notes(&notes, &format!("channel:{channel_id}")) {
        eprintln!("[cache] failed to cache channel notes: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_note(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<NormalizedNote> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_note(&host, &token, &account_id, &note_id).await
}

#[tauri::command]
pub async fn api_create_note(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    params: CreateNoteParams,
    channel_id: Option<String>,
) -> Result<NormalizedNote> {
    let (host, token) = get_credentials(&db, &account_id)?;
    if let Some(ref ch_id) = channel_id {
        // Build request body manually to include channelId
        // (notecli's CreateNoteParams doesn't have channelId)
        let mut body = serde_json::json!({ "channelId": ch_id });
        if let Some(ref v) = params.text {
            body["text"] = serde_json::json!(v);
        }
        if let Some(ref v) = params.cw {
            body["cw"] = serde_json::json!(v);
        }
        if let Some(ref v) = params.visibility {
            body["visibility"] = serde_json::json!(v);
        }
        if let Some(v) = params.local_only {
            body["localOnly"] = serde_json::json!(v);
        }
        if let Some(ref flags) = params.mode_flags {
            for (key, value) in flags {
                if key.starts_with("isNoteIn") && key.ends_with("Mode") && key.len() <= 30 {
                    body[key] = serde_json::json!(value);
                }
            }
        }
        if let Some(ref v) = params.reply_id {
            body["replyId"] = serde_json::json!(v);
        }
        if let Some(ref v) = params.renote_id {
            body["renoteId"] = serde_json::json!(v);
        }
        if let Some(ref v) = params.file_ids {
            body["fileIds"] = serde_json::json!(v);
        }
        if let Some(ref v) = params.poll {
            body["poll"] = serde_json::json!(v);
        }
        if let Some(ref v) = params.scheduled_at {
            body["scheduledAt"] = serde_json::json!(v);
        }
        let data = client.request(&host, &token, "notes/create", body).await?;
        let raw: RawCreateNoteResponse = serde_json::from_value(data)?;
        Ok(raw.created_note.normalize(&account_id, &host))
    } else {
        client.create_note(&host, &token, &account_id, params).await
    }
}

#[tauri::command]
pub async fn api_create_reaction(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
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
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_reaction(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_get_note_reactions(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
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
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
    params: CreateNoteParams,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.update_note(&host, &token, &note_id, params).await
}

const MAX_UPLOAD_BYTES: usize = 50 * 1024 * 1024; // 50 MB

#[tauri::command]
pub async fn api_upload_file(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
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
        .upload_file(
            &host,
            &token,
            &file_name,
            file_data,
            &content_type,
            is_sensitive,
        )
        .await
}

#[tauri::command]
pub async fn api_upload_file_from_path(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    file_path: String,
    is_sensitive: bool,
) -> Result<NormalizedDriveFile> {
    let path = std::path::Path::new(&file_path);
    let file_data = std::fs::read(path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to read file: {e}")))?;
    if file_data.len() > MAX_UPLOAD_BYTES {
        return Err(NoteDeckError::InvalidInput("File too large".to_string()));
    }
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let content_type = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .upload_file(
            &host,
            &token,
            &file_name,
            file_data,
            &content_type,
            is_sensitive,
        )
        .await
}

#[tauri::command]
pub async fn api_create_favorite(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.create_favorite(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_delete_favorite(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_favorite(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_delete_note(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_note(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_get_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<NormalizedUser> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_get_user_detail(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<NormalizedUserDetail> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_detail(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_get_user_notes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let notes = client
        .get_user_notes(
            &host,
            &token,
            &account_id,
            &user_id,
            options.unwrap_or_default(),
        )
        .await?;
    if let Err(e) = db.cache_notes(&notes, &format!("user:{user_id}")) {
        eprintln!("[cache] failed to cache user notes: {e}");
    }
    Ok(notes)
}

#[tauri::command]
pub async fn api_get_server_emojis(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<Vec<ServerEmoji>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_server_emojis(&host, &token).await
}

#[tauri::command]
pub async fn api_get_pinned_reactions(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<Vec<String>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_pinned_reactions(&host, &token).await
}

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
pub async fn api_search_notes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Vec<NormalizedNote>> {
    if query.len() > 1000 {
        return Err(NoteDeckError::InvalidInput(
            "Search query too long".to_string(),
        ));
    }
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .search_notes(
            &host,
            &token,
            &account_id,
            &query,
            options.unwrap_or_default(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_note_children(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
    limit: Option<u32>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_note_children(
            &host,
            &token,
            &account_id,
            &note_id,
            limit.unwrap_or(30).clamp(1, 100),
        )
        .await
}

#[tauri::command]
pub async fn api_get_note_renotes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
    limit: Option<u32>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    let data = client
        .request(
            &host,
            &token,
            "notes/renotes",
            serde_json::json!({ "noteId": note_id, "limit": limit.unwrap_or(30).clamp(1, 100) }),
        )
        .await?;
    let raw: Vec<RawNote> = serde_json::from_value(data)?;
    Ok(raw
        .into_iter()
        .map(|n| n.normalize(&account_id, &host))
        .collect())
}

#[tauri::command]
pub async fn api_get_note_conversation(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
    limit: Option<u32>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_note_conversation(
            &host,
            &token,
            &account_id,
            &note_id,
            limit.unwrap_or(30).clamp(1, 100),
        )
        .await
}

#[tauri::command]
pub async fn api_lookup_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
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
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.follow_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_unfollow_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unfollow_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_accept_follow_request(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.accept_follow_request(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_reject_follow_request(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.reject_follow_request(&host, &token, &user_id).await
}

#[tauri::command]
pub fn api_get_cached_timeline(
    db: State<'_, Arc<Database>>,
    account_id: String,
    timeline_type: String,
    limit: Option<i64>,
) -> Result<Vec<NormalizedNote>> {
    db.get_cached_timeline(
        &account_id,
        &timeline_type,
        limit.unwrap_or(40).clamp(1, 200),
    )
}

#[tauri::command]
pub fn api_search_notes_local(
    db: State<'_, Arc<Database>>,
    account_id: String,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<NormalizedNote>> {
    if query.len() > 1000 {
        return Err(NoteDeckError::InvalidInput(
            "Search query too long".to_string(),
        ));
    }
    db.search_cached_notes(&account_id, &query, limit.unwrap_or(30).clamp(1, 200))
}

#[tauri::command]
pub fn api_delete_cached_note(db: State<'_, Arc<Database>>, note_id: String) -> Result<()> {
    db.delete_cached_note(&note_id)
}

#[tauri::command]
pub fn api_get_cached_timeline_before(
    db: State<'_, Arc<Database>>,
    account_id: String,
    timeline_type: String,
    before: String,
    limit: Option<i64>,
) -> Result<Vec<NormalizedNote>> {
    if before.len() > 30 {
        return Err(NoteDeckError::InvalidInput("Invalid date".to_string()));
    }
    db.get_cached_timeline_before(
        &account_id,
        &timeline_type,
        &before,
        limit.unwrap_or(40).clamp(1, 200),
    )
}

#[tauri::command]
pub fn api_get_cache_date_range(
    db: State<'_, Arc<Database>>,
    account_id: String,
    timeline_type: String,
) -> Result<Option<(String, String)>> {
    db.get_cache_date_range(&account_id, &timeline_type)
}

// --- Pin/Unpin ---

#[tauri::command]
pub async fn api_pin_note(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.pin_note(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_unpin_note(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unpin_note(&host, &token, &note_id).await
}

#[tauri::command]
pub async fn api_get_user_pinned_note_ids(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<Vec<String>> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_user_pinned_note_ids(&host, &token, &user_id)
        .await
}

// --- Mute/Block ---

#[tauri::command]
pub async fn api_mute_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.mute_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_unmute_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unmute_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_block_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.block_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_unblock_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unblock_user(&host, &token, &user_id).await
}

// --- Report ---

#[tauri::command]
pub async fn api_report_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
    comment: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.report_user(&host, &token, &user_id, &comment).await
}

// --- Clip operations ---

#[tauri::command]
pub async fn api_add_note_to_clip(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    clip_id: String,
    note_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .add_note_to_clip(&host, &token, &clip_id, &note_id)
        .await
}

// --- User list operations ---

#[tauri::command]
pub async fn api_add_user_to_list(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    list_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .add_user_to_list(&host, &token, &list_id, &user_id)
        .await
}

#[tauri::command]
pub async fn api_remove_user_from_list(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    list_id: String,
    user_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .remove_user_from_list(&host, &token, &list_id, &user_id)
        .await
}

// --- Follow list & relations ---

#[tauri::command]
pub async fn api_get_following(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
    limit: Option<i64>,
    until_id: Option<String>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_following(
            &host,
            &token,
            &user_id,
            limit.unwrap_or(30).clamp(1, 100),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_followers(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
    limit: Option<i64>,
    until_id: Option<String>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_followers(
            &host,
            &token,
            &user_id,
            limit.unwrap_or(30).clamp(1, 100),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_user_relations(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_ids: Vec<String>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_relations(&host, &token, &user_ids).await
}

// --- Notifications ---

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

// --- Self (current user) ---

#[tauri::command]
pub async fn api_get_self(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_self(&host, &token).await
}

// --- Drive ---

#[tauri::command]
pub async fn api_get_drive_folders(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    folder_id: Option<String>,
    limit: Option<i64>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_drive_folders(
            &host,
            &token,
            folder_id.as_deref(),
            limit.unwrap_or(30).clamp(1, 100),
        )
        .await
}

#[tauri::command]
pub async fn api_get_drive_files(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    folder_id: Option<String>,
    limit: Option<i64>,
    file_type: Option<String>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_drive_files(
            &host,
            &token,
            folder_id.as_deref(),
            limit.unwrap_or(30).clamp(1, 100),
            file_type.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_delete_drive_file(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    file_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_drive_file(&host, &token, &file_id).await
}

// --- Follow requests ---

#[tauri::command]
pub async fn api_get_follow_requests(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    limit: Option<i64>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_follow_requests(&host, &token, limit.unwrap_or(30).clamp(1, 100))
        .await
}

// --- Explore (users/roles) ---

#[tauri::command]
pub async fn api_search_users(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    query: Option<String>,
    origin: Option<String>,
    sort: Option<String>,
    state: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .search_users(
            &host,
            &token,
            query.as_deref(),
            origin.as_deref(),
            sort.as_deref(),
            state.as_deref(),
            limit.unwrap_or(30).clamp(1, 100),
            offset,
        )
        .await
}

#[tauri::command]
pub async fn api_get_roles(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_roles(&host, &token).await
}

#[tauri::command]
pub async fn api_get_role_users(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    role_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_role_users(
            &host,
            &token,
            &role_id,
            limit.unwrap_or(30).clamp(1, 100),
            offset,
        )
        .await
}

// --- Announcements ---

#[tauri::command]
pub async fn api_get_announcements(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    limit: Option<i64>,
    is_active: Option<bool>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_announcements(
            &host,
            &token,
            limit.unwrap_or(30).clamp(1, 100),
            is_active.unwrap_or(true),
        )
        .await
}

#[tauri::command]
pub async fn api_read_announcement(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    announcement_id: String,
) -> Result<()> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .read_announcement(&host, &token, &announcement_id)
        .await
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

// --- Generic API proxy ---

#[tauri::command]
pub async fn api_request(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    endpoint: String,
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    if endpoint.is_empty() || endpoint.len() > 100 {
        return Err(NoteDeckError::InvalidInput(
            "Invalid endpoint name".to_string(),
        ));
    }
    if !endpoint
        .chars()
        .all(|c| c.is_alphanumeric() || c == '/' || c == '-' || c == '_')
    {
        return Err(NoteDeckError::InvalidInput(
            "Invalid endpoint name".to_string(),
        ));
    }
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .request(
            &host,
            &token,
            &endpoint,
            params.unwrap_or(serde_json::json!({})),
        )
        .await
}

// --- Theme ---

#[tauri::command]
pub async fn api_fetch_account_theme(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;

    let mut result = serde_json::json!({});

    // Fetch all three sources in parallel
    let sync_scope = vec![
        "client".to_string(),
        "preferences".to_string(),
        "sync".to_string(),
    ];
    let base_scope = vec!["client".to_string(), "base".to_string()];
    let (sync_res, base_res, meta_res) = tokio::join!(
        client.get_registry_all(&host, &token, &sync_scope),
        client.get_registry_all(&host, &token, &base_scope),
        client.get_meta(&host, &token),
    );

    // Apply sync results (highest priority)
    if let Ok(Some(data)) = sync_res {
        if let Some(dark) = data.get("default:darkTheme") {
            result["syncDark"] = dark.clone();
        }
        if let Some(light) = data.get("default:lightTheme") {
            result["syncLight"] = light.clone();
        }
    }

    // Fall back to legacy base if sync had nothing
    if result.get("syncDark").is_none() && result.get("syncLight").is_none() {
        if let Ok(Some(data)) = base_res {
            if let Some(dark) = data.get("darkTheme") {
                result["baseDark"] = dark.clone();
            }
            if let Some(light) = data.get("lightTheme") {
                result["baseLight"] = light.clone();
            }
        }
    }

    // Fall back to server defaults from /api/meta
    let has_any = result.get("syncDark").is_some()
        || result.get("syncLight").is_some()
        || result.get("baseDark").is_some()
        || result.get("baseLight").is_some();

    if !has_any {
        if let Ok(meta) = meta_res {
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
        return Err(NoteDeckError::InvalidInput(
            "Host cannot be empty".to_string(),
        ));
    }
    if normalized.len() > 253 {
        return Err(NoteDeckError::InvalidInput("Host too long".to_string()));
    }
    if normalized.contains(['/', '?', '#', '@', ' ', '\n', '\r']) {
        return Err(NoteDeckError::InvalidInput(format!(
            "Invalid host: {normalized}"
        )));
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
        "[fc",      // IPv6 ULA (fc00::/7)
        "[fd",      // IPv6 ULA (fd00::/8)
        "[fe80:",   // IPv6 link-local
        "[::ffff:", // IPv4-mapped IPv6
    ];
    if ssrf_blocked.iter().any(|p| normalized.starts_with(p)) {
        return Err(NoteDeckError::InvalidInput(
            "Loopback and private addresses are not allowed".to_string(),
        ));
    }
    // 172.16.0.0/12
    if normalized.starts_with("172.") {
        if let Some(second) = normalized
            .strip_prefix("172.")
            .and_then(|s| s.split('.').next())
        {
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
            "read:drive",
            "write:drive",
            "write:favorites",
            "read:following",
            "write:following",
            "write:notes",
            "write:reactions",
            "write:votes",
            "read:channels",
            "write:channels",
            "read:chat",
            "write:chat",
            "read:flash",
            "read:flash-likes",
            "write:flash-likes",
            "read:pages",
            "read:page-likes",
            "write:page-likes",
            "read:gallery",
            "read:gallery-likes",
            "write:gallery-likes",
        ]
        .into_iter()
        .map(String::from)
        .collect()
    });
    for perm in &perms {
        if !perm
            .chars()
            .all(|c| c.is_alphanumeric() || c == ':' || c == '-')
            || perm.len() > 50
        {
            return Err(NoteDeckError::InvalidInput(format!(
                "Invalid permission: {perm}"
            )));
        }
    }
    let permission_str = perms.join(",");
    let url =
        format!("https://{host}/miauth/{session_id}?name=notedeck&permission={permission_str}");
    tracker.register(&session_id, &host);
    Ok(AuthSession {
        session_id,
        url,
        host,
    })
}

#[tauri::command]
pub async fn auth_complete_and_save(
    app: tauri::AppHandle,
    tracker: State<'_, AuthSessionTracker>,
    client: State<'_, Arc<MisskeyClient>>,
    db: State<'_, Arc<Database>>,
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
        && keychain::get_token(&saved.id).ok().flatten().is_some()
    {
        let _ = db.clear_token(&saved.id);
    }
    token.zeroize();

    export_account_list(&app, &db);

    Ok(AccountPublic::from(&saved))
    // account, saved が drop → token が zeroize される
}

// --- OGP Preview ---

#[tauri::command]
pub async fn fetch_ogp(
    ogp_cache: State<'_, crate::ogp::OgpCache>,
    db: State<'_, Arc<Database>>,
    url: String,
    account_id: Option<String>,
) -> Result<crate::ogp::OgpData> {
    if url.len() > 2048 {
        return Err(NoteDeckError::InvalidInput("URL too long".to_string()));
    }

    // With server context: plugins → server → direct HTML parse
    // Without: plugins → direct HTML parse
    let result = if let Some(ref aid) = account_id {
        if let Ok((host, token)) = get_credentials(&db, aid) {
            ogp_cache.get_ogp_via_server(&url, &host, &token).await
        } else {
            ogp_cache.get_ogp(&url).await
        }
    } else {
        ogp_cache.get_ogp(&url).await
    };

    result.map_err(|e| NoteDeckError::InvalidInput(format!("OGP: {e}")))
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

// --- Server Discovery (unauthenticated, CORS-free) ---

#[tauri::command]
pub async fn fetch_nodeinfo(
    client: State<'_, Arc<MisskeyClient>>,
    host: String,
) -> Result<serde_json::Value> {
    client.fetch_nodeinfo(&host).await
}

#[tauri::command]
pub async fn fetch_server_meta(
    client: State<'_, Arc<MisskeyClient>>,
    host: String,
) -> Result<serde_json::Value> {
    client.fetch_server_meta(&host).await
}

// --- Streaming ---

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
    db: State<'_, Arc<Database>>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
) -> Result<()> {
    ensure_stream_connected(&db, &streaming, &account_id).await
}

/// Connect + subscribe in a single IPC round-trip (timeline).
#[tauri::command]
pub async fn stream_connect_and_subscribe_timeline(
    db: State<'_, Arc<Database>>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
    timeline_type: TimelineType,
    list_id: Option<String>,
) -> Result<String> {
    ensure_stream_connected(&db, &streaming, &account_id).await?;
    streaming
        .subscribe_timeline(&account_id, timeline_type, list_id)
        .await
}

/// Connect + subscribe in a single IPC round-trip (antenna).
#[tauri::command]
pub async fn stream_connect_and_subscribe_antenna(
    db: State<'_, Arc<Database>>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
    antenna_id: String,
) -> Result<String> {
    ensure_stream_connected(&db, &streaming, &account_id).await?;
    streaming.subscribe_antenna(&account_id, &antenna_id).await
}

/// Connect + subscribe in a single IPC round-trip (channel).
#[tauri::command]
pub async fn stream_connect_and_subscribe_channel(
    db: State<'_, Arc<Database>>,
    streaming: State<'_, StreamingManager>,
    account_id: String,
    channel_id: String,
) -> Result<String> {
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

#[tauri::command]
pub fn get_cli_commands() -> Vec<notecli::cli::CliCommandInfo> {
    notecli::cli::command_metadata()
}

#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- extract_ogp_urls ---

    #[test]
    fn extract_urls_from_text() {
        let text = "Check https://example.com/article and https://blog.example.com/post";
        let urls = extract_ogp_urls(text);
        assert_eq!(urls.len(), 2);
        assert!(urls.contains(&"https://example.com/article".to_string()));
    }

    #[test]
    fn skip_media_urls() {
        let text = "Image: https://example.com/photo.jpg and https://example.com/video.mp4";
        let urls = extract_ogp_urls(text);
        assert!(urls.is_empty());
    }

    #[test]
    fn skip_media_with_query_params() {
        let text = "https://example.com/image.png?w=800";
        let urls = extract_ogp_urls(text);
        assert!(urls.is_empty());
    }

    #[test]
    fn extract_non_media_urls_only() {
        let text = "See https://example.com/page and https://example.com/photo.webp";
        let urls = extract_ogp_urls(text);
        assert_eq!(urls.len(), 1);
        assert_eq!(urls[0], "https://example.com/page");
    }

    #[test]
    fn empty_text_no_urls() {
        assert!(extract_ogp_urls("").is_empty());
        assert!(extract_ogp_urls("no urls here").is_empty());
    }

    // --- validate_host ---

    #[test]
    fn valid_host() {
        assert_eq!(validate_host("Misskey.IO").unwrap(), "misskey.io");
    }

    #[test]
    fn valid_host_trims_whitespace() {
        assert_eq!(validate_host("  example.com  ").unwrap(), "example.com");
    }

    #[test]
    fn reject_empty_host() {
        assert!(validate_host("").is_err());
        assert!(validate_host("   ").is_err());
    }

    #[test]
    fn reject_host_with_path() {
        assert!(validate_host("example.com/path").is_err());
    }

    #[test]
    fn reject_localhost() {
        assert!(validate_host("localhost").is_err());
        assert!(validate_host("localhost:3000").is_err());
    }

    #[test]
    fn reject_loopback_ipv4() {
        assert!(validate_host("127.0.0.1").is_err());
        assert!(validate_host("127.0.0.1:8080").is_err());
    }

    #[test]
    fn reject_private_ranges() {
        assert!(validate_host("10.0.0.1").is_err());
        assert!(validate_host("192.168.1.1").is_err());
        assert!(validate_host("172.16.0.1").is_err());
        assert!(validate_host("172.31.255.255").is_err());
    }

    #[test]
    fn allow_172_outside_private() {
        // 172.15.x.x and 172.32.x.x are public
        assert!(validate_host("172.15.0.1").is_ok());
        assert!(validate_host("172.32.0.1").is_ok());
    }

    #[test]
    fn reject_ipv6_loopback() {
        assert!(validate_host("[::1]").is_err());
        assert!(validate_host("::1").is_err());
    }

    #[test]
    fn reject_reserved_tlds() {
        assert!(validate_host("myserver.local").is_err());
        assert!(validate_host("app.internal").is_err());
        assert!(validate_host("test.localhost").is_err());
    }

    #[test]
    fn reject_long_host() {
        let long = "a".repeat(254);
        assert!(validate_host(&long).is_err());
    }

    // --- AuthSessionTracker ---

    #[test]
    fn auth_session_register_and_consume() {
        let tracker = AuthSessionTracker::new();
        tracker.register("sess-1", "misskey.io");
        assert!(tracker.consume("sess-1", "misskey.io").is_ok());
    }

    #[test]
    fn auth_session_double_consume_fails() {
        let tracker = AuthSessionTracker::new();
        tracker.register("sess-1", "misskey.io");
        tracker.consume("sess-1", "misskey.io").unwrap();
        assert!(tracker.consume("sess-1", "misskey.io").is_err());
    }

    #[test]
    fn auth_session_host_mismatch() {
        let tracker = AuthSessionTracker::new();
        tracker.register("sess-1", "misskey.io");
        let err = tracker.consume("sess-1", "evil.com").unwrap_err();
        assert!(err.to_string().contains("Host mismatch"));
    }

    #[test]
    fn auth_session_unknown_id() {
        let tracker = AuthSessionTracker::new();
        assert!(tracker.consume("nonexistent", "misskey.io").is_err());
    }

    // --- CredentialCache ---

    #[test]
    fn credential_cache_insert_and_get() {
        let cache = CredentialCache::new();
        cache.insert("acc-1", "misskey.io", "token-123");
        let (host, token) = cache.get("acc-1").unwrap();
        assert_eq!(host, "misskey.io");
        assert_eq!(token, "token-123");
    }

    #[test]
    fn credential_cache_miss() {
        let cache = CredentialCache::new();
        assert!(cache.get("nonexistent").is_none());
    }

    #[test]
    fn credential_cache_invalidate() {
        let cache = CredentialCache::new();
        cache.insert("acc-1", "misskey.io", "token");
        cache.invalidate("acc-1");
        assert!(cache.get("acc-1").is_none());
    }
}
