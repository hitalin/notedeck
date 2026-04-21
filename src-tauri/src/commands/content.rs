use std::collections::HashMap;

use tauri::State;

use notecli::error::NoteDeckError;
use notecli::models::ServerEmoji;

use super::{get_credentials, get_credentials_or_anon, validate_host, AppState, Result};

// --- Server metadata ---

#[tauri::command]
#[specta::specta]
pub async fn api_get_endpoints(
    app_state: State<'_, AppState>,
    host: String,
) -> Result<Vec<String>> {
    let client = app_state.client().await;
    let host = validate_host(&host)?;
    client.get_endpoints(&host).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_endpoint_params(
    app_state: State<'_, AppState>,
    host: String,
    endpoint: String,
) -> Result<Vec<String>> {
    let client = app_state.client().await;
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
#[specta::specta]
pub async fn api_get_user_policies(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<HashMap<String, bool>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_user_policies(&host, &token).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_update_user_setting(
    app_state: State<'_, AppState>,
    account_id: String,
    key: String,
    value: bool,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
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
#[specta::specta]
pub async fn api_get_server_emojis(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<ServerEmoji>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client.get_server_emojis(&host, &token).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_pinned_reactions(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<String>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.get_pinned_reactions(&host, &token).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_server_stats(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client.get_server_stats(&host, &token).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_meta_detail(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client.get_meta_detail(&host, &token).await
}

// --- Roles ---

#[tauri::command]
#[specta::specta]
pub async fn api_get_roles(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client.get_roles(&host, &token).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_role_users(
    app_state: State<'_, AppState>,
    account_id: String,
    role_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
#[specta::specta]
pub async fn api_get_announcements(
    app_state: State<'_, AppState>,
    account_id: String,
    limit: Option<i64>,
    is_active: Option<bool>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
#[specta::specta]
pub async fn api_read_announcement(
    app_state: State<'_, AppState>,
    account_id: String,
    announcement_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .read_announcement(&host, &token, &announcement_id)
        .await
}

// --- Pages ---

#[tauri::command]
#[specta::specta]
pub async fn api_get_pages(
    app_state: State<'_, AppState>,
    account_id: String,
    endpoint: String,
    limit: Option<i64>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    // Validate endpoint to only allow page-related endpoints
    let allowed = ["pages/featured", "i/pages", "i/page-likes"];
    if !allowed.contains(&endpoint.as_str()) {
        return Err(NoteDeckError::InvalidInput(
            "Invalid page endpoint".to_string(),
        ));
    }
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client
        .get_pages(&host, &token, &endpoint, limit.unwrap_or(30).clamp(1, 100))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_page(
    app_state: State<'_, AppState>,
    account_id: String,
    page_id: String,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client.get_page(&host, &token, &page_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_like_page(
    app_state: State<'_, AppState>,
    account_id: String,
    page_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.like_page(&host, &token, &page_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_unlike_page(
    app_state: State<'_, AppState>,
    account_id: String,
    page_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unlike_page(&host, &token, &page_id).await
}

// --- Gallery ---

#[tauri::command]
#[specta::specta]
pub async fn api_get_gallery_posts(
    app_state: State<'_, AppState>,
    account_id: String,
    limit: Option<i64>,
    until_id: Option<String>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client
        .get_gallery_posts(
            &host,
            &token,
            limit.unwrap_or(20).clamp(1, 100),
            until_id.as_deref(),
        )
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn api_like_gallery_post(
    app_state: State<'_, AppState>,
    account_id: String,
    post_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.like_gallery_post(&host, &token, &post_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_unlike_gallery_post(
    app_state: State<'_, AppState>,
    account_id: String,
    post_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unlike_gallery_post(&host, &token, &post_id).await
}

// --- Flash (Play) ---

#[tauri::command]
#[specta::specta]
pub async fn api_get_flashes(
    app_state: State<'_, AppState>,
    account_id: String,
    endpoint: String,
    limit: Option<i64>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let allowed = ["flash/featured", "flash/my", "flash/my-likes"];
    if !allowed.contains(&endpoint.as_str()) {
        return Err(NoteDeckError::InvalidInput(
            "Invalid flash endpoint".to_string(),
        ));
    }
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client
        .get_flashes(&host, &token, &endpoint, limit.unwrap_or(30).clamp(1, 100))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_flash(
    app_state: State<'_, AppState>,
    account_id: String,
    flash_id: String,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    client.get_flash(&host, &token, &flash_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_like_flash(
    app_state: State<'_, AppState>,
    account_id: String,
    flash_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.like_flash(&host, &token, &flash_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_unlike_flash(
    app_state: State<'_, AppState>,
    account_id: String,
    flash_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.unlike_flash(&host, &token, &flash_id).await
}

// --- Drive ---

#[tauri::command]
#[specta::specta]
pub async fn api_get_drive_folders(
    app_state: State<'_, AppState>,
    account_id: String,
    folder_id: Option<String>,
    limit: Option<i64>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
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
#[specta::specta]
pub async fn api_get_drive_files(
    app_state: State<'_, AppState>,
    account_id: String,
    folder_id: Option<String>,
    limit: Option<i64>,
    file_type: Option<String>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
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
#[specta::specta]
pub async fn api_delete_drive_file(
    app_state: State<'_, AppState>,
    account_id: String,
    file_id: String,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client.delete_drive_file(&host, &token, &file_id).await
}

// --- Generic API proxy ---

#[tauri::command]
#[specta::specta]
pub async fn api_request(
    app_state: State<'_, AppState>,
    account_id: String,
    endpoint: String,
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
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
    // 匿名フォールバック: ゲストアカウントでも public エンドポイント
    // (charts/*, meta, users/show 等) を呼び出せるようにする。
    // 認証必須エンドポイントはサーバーが 401 を返し上位でハンドリングされる。
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
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
#[specta::specta]
pub async fn api_fetch_account_theme(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
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
