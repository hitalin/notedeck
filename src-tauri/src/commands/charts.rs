use tauri::State;

use notecli::models::{
    ActiveUsersChart, ApRequestChart, FederationChart, ServerDriveChart, ServerNotesChart,
    ServerUsersChart, UserFollowingChart, UserNotesChart, UserPvChart,
};

use super::{get_credentials_or_anon, AppState, Result};

// チャート系エンドポイントは public (未ログインでも閲覧可)。

#[tauri::command]
#[specta::specta]
pub async fn api_charts_user_notes(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<UserNotesChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/user/notes", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_user_following(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<UserFollowingChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/user/following", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_user_pv(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<UserPvChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/user/pv", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_active_users(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<ActiveUsersChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/active-users", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_notes(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<ServerNotesChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/notes", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_users(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<ServerUsersChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/users", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_federation(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<FederationChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/federation", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_ap_request(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<ApRequestChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/ap-request", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_drive(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<ServerDriveChart> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, &account_id)?;
    let raw = client
        .request(&host, &token, "charts/drive", params)
        .await?;
    Ok(serde_json::from_value(raw)?)
}
