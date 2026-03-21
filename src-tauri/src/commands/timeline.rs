use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;

use notecli::api::MisskeyClient;
use notecli::db::Database;
use notecli::error::NoteDeckError;
use notecli::models::{
    Antenna, Channel, Clip, CreateNoteParams, NormalizedDriveFile, NormalizedNote,
    NormalizedNoteReaction, RawCreateNoteResponse, RawNote, SearchOptions, TimelineOptions,
    TimelineType, UserList,
};

use super::{
    extract_ogp_urls, get_credentials, get_credentials_or_anon, Result, TimelineEnriched,
    MAX_UPLOAD_BYTES,
};

// --- Timelines ---

#[tauri::command]
pub async fn api_get_timeline(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    timeline_type: TimelineType,
    options: Option<TimelineOptions>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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

// --- Lists / Antennas ---

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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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

// --- Clips ---

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

// --- Channels ---

#[tauri::command]
pub async fn api_get_channels(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<Vec<Channel>> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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

// --- Notes ---

#[tauri::command]
pub async fn api_get_note(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
) -> Result<NormalizedNote> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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

// --- Reactions ---

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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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

// --- Favorites ---

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

// --- Note thread ---

#[tauri::command]
pub async fn api_get_note_children(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    note_id: String,
    limit: Option<u32>,
) -> Result<Vec<NormalizedNote>> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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

// --- Search ---

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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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

// --- Upload ---

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

// --- Cache ---

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

#[tauri::command]
pub fn api_search_notes_local(
    db: State<'_, Arc<Database>>,
    account_id: String,
    query: String,
    limit: Option<i64>,
    since_date: Option<String>,
    until_date: Option<String>,
    ascending: Option<bool>,
) -> Result<Vec<NormalizedNote>> {
    if query.len() > 1000 {
        return Err(NoteDeckError::InvalidInput(
            "Search query too long".to_string(),
        ));
    }
    db.search_cached_notes_advanced(
        &account_id,
        &query,
        limit.unwrap_or(30).clamp(1, 200),
        since_date.as_deref(),
        until_date.as_deref(),
        ascending.unwrap_or(false),
    )
}

#[tauri::command]
pub fn api_delete_cached_note(db: State<'_, Arc<Database>>, note_id: String) -> Result<()> {
    db.delete_cached_note(&note_id)
}
