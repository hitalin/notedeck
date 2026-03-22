use std::sync::Arc;

use tauri::State;

use notecli::api::{MisskeyClient, SearchUsersOptions};
use notecli::db::Database;
use notecli::error::NoteDeckError;
use notecli::models::{NormalizedNote, NormalizedUser, NormalizedUserDetail, TimelineOptions};

use super::{get_credentials, get_credentials_or_anon, validate_host, Result};

// --- User profile ---

#[tauri::command]
pub async fn api_get_user(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<NormalizedUser> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client.get_user(&host, &token, &user_id).await
}

#[tauri::command]
pub async fn api_get_user_detail(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<NormalizedUserDetail> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
pub async fn api_get_user_notes_filtered(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_user_notes_filtered(&host, &token, params)
        .await
}

#[tauri::command]
pub async fn api_get_user_featured_notes(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
    limit: Option<i64>,
    until_id: Option<String>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_user_featured_notes(
            &host,
            &token,
            &user_id,
            limit.unwrap_or(30).clamp(1, 100),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn api_get_user_achievements(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    user_id: String,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .get_user_achievements(&host, &token, &user_id)
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
    let (server_host, token) = get_credentials_or_anon(&db, &account_id)?;
    client
        .lookup_user(&server_host, &token, &username, validated_host.as_deref())
        .await
}

#[tauri::command]
pub async fn api_get_self(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_self(&host, &token).await
}

// --- Follow / Unfollow ---

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

// --- Mute / Block ---

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

// --- Search ---

#[tauri::command]
#[allow(clippy::too_many_arguments)]
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
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client
        .search_users(
            &host,
            &token,
            SearchUsersOptions {
                query: query.as_deref(),
                origin: origin.as_deref(),
                sort: sort.as_deref(),
                state: state.as_deref(),
                limit: limit.unwrap_or(30).clamp(1, 100),
                offset,
            },
        )
        .await
}

#[tauri::command]
pub async fn api_search_users_by_query(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    query: String,
    limit: Option<i64>,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client
        .search_users_by_query(&host, &token, &query, limit.unwrap_or(10).clamp(1, 100))
        .await
}

#[tauri::command]
pub async fn api_search_hashtags(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<String>> {
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client
        .search_hashtags(&host, &token, &query, limit.unwrap_or(10).clamp(1, 100))
        .await
}

// --- ActivityPub resolve ---

#[tauri::command]
pub async fn api_ap_show(
    db: State<'_, Arc<Database>>,
    client: State<'_, Arc<MisskeyClient>>,
    account_id: String,
    uri: String,
) -> Result<serde_json::Value> {
    let (host, token) = get_credentials(&db, &account_id)?;
    client.ap_show(&host, &token, &uri).await
}
