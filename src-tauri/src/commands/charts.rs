use tauri::State;

use super::{get_credentials_or_anon, AppState, Result};

// チャート系エンドポイントは public（未ログインでも閲覧可）。
// 薄い専用コマンドラッパー。params は TS 側で組み立てたものをそのまま transit。

async fn call_chart(
    app_state: &State<'_, AppState>,
    account_id: &str,
    endpoint: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    let (db, client) = app_state.ready().await;
    let (host, token) = get_credentials_or_anon(&db, account_id)?;
    client.request(&host, &token, endpoint, params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_user_notes(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/user/notes", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_user_following(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/user/following", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_user_pv(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/user/pv", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_active_users(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/active-users", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_notes(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/notes", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_users(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/users", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_federation(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/federation", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_ap_request(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/ap-request", params).await
}

#[tauri::command]
#[specta::specta]
pub async fn api_charts_drive(
    app_state: State<'_, AppState>,
    account_id: String,
    params: serde_json::Value,
) -> Result<serde_json::Value> {
    call_chart(&app_state, &account_id, "charts/drive", params).await
}
