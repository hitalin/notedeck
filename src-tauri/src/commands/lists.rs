use tauri::State;

use notecli::models::UserList;

use super::{get_credentials, get_credentials_or_anon, AppState, Result};

// 既存 `api_get_user_lists` (timeline.rs, users/lists/list 自分用) は notecli の
// `client.get_user_lists()` を経由する型化済みコマンド。ここでは
// users/lists/show・他人用 users/lists/list・お気に入り操作を補完する。

#[tauri::command]
#[specta::specta]
pub async fn api_get_list(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<UserList> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "users/lists/show", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_get_user_lists_by(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<Vec<UserList>> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "users/lists/list", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_favorite_list(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .request(&host, &token, "users/lists/favorite", params)
        .await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn api_unfavorite_list(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<()> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    client
        .request(&host, &token, "users/lists/unfavorite", params)
        .await?;
    Ok(())
}
