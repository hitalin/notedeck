use tauri::State;

use notecli::models::Clip;

use super::{get_credentials, get_credentials_or_anon, AppState, Result};

// 既存 `api_get_clips` (timeline.rs, clips/list 自分用) は notecli が直接
// 型化メソッド `client.get_clips()` を提供している。ここでは clips/show・
// clips/create・clips/my-favorites・users/clips 等を補完する。

#[tauri::command]
#[specta::specta]
pub async fn api_get_clip(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<Clip> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client.request(&host, &token, "clips/show", params).await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_my_favorite_clips(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<Vec<Clip>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "clips/my-favorites", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_create_clip(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<Clip> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    let raw = client.request(&host, &token, "clips/create", params).await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_favorite_clip(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .request(&host, &token, "clips/favorite", params)
        .await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn api_unfavorite_clip(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .request(&host, &token, "clips/unfavorite", params)
        .await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_user_clips(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<Vec<Clip>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client.request(&host, &token, "users/clips", params).await?;
    Ok(serde_json::from_value(raw)?)
}
