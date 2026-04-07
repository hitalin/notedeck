use base64::Engine;
use tauri::State;

use notecli::error::NoteDeckError;

use super::{get_credentials, AppState, Result};

// --- OGP Preview ---

#[tauri::command]
#[specta::specta]
pub async fn fetch_ogp(
    ogp_cache: State<'_, crate::ogp::OgpCache>,
    app_state: State<'_, AppState>,
    url: String,
    account_id: Option<String>,
) -> Result<crate::ogp::OgpData> {
    let db = app_state.db().await;
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

// --- Server Discovery (unauthenticated, CORS-free) ---

#[tauri::command]
#[specta::specta]
pub async fn fetch_nodeinfo(
    app_state: State<'_, AppState>,
    host: String,
) -> Result<serde_json::Value> {
    let client = app_state.client().await;
    client.fetch_nodeinfo(&host).await
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_server_meta(
    app_state: State<'_, AppState>,
    host: String,
) -> Result<serde_json::Value> {
    let client = app_state.client().await;
    client.fetch_server_meta(&host).await
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_image_base64(
    http: State<'_, reqwest::Client>,
    url: String,
) -> Result<Option<String>> {
    if !url.starts_with("https://") {
        return Err(NoteDeckError::InvalidInput(
            "Only HTTPS URLs allowed".into(),
        ));
    }
    let resp = http.get(&url).send().await.map_err(NoteDeckError::from)?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = resp.bytes().await.map_err(NoteDeckError::from)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:{content_type};base64,{b64}")))
}

// --- Generic HTTP health check ---

#[derive(serde::Serialize, specta::Type)]
pub struct HealthCheckResult {
    pub ok: bool,
    pub status: u16,
    pub message: String,
}

#[tauri::command]
#[specta::specta]
pub async fn check_endpoint_health(
    http: State<'_, reqwest::Client>,
    url: String,
    bearer_token: Option<String>,
) -> Result<HealthCheckResult> {
    if url.len() > 2048 {
        return Err(NoteDeckError::InvalidInput("URL too long".to_string()));
    }
    let mut req = http.get(&url).timeout(std::time::Duration::from_secs(5));
    if let Some(token) = bearer_token {
        req = req.bearer_auth(token);
    }
    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            Ok(HealthCheckResult {
                ok: resp.status().is_success(),
                status,
                message: if resp.status().is_success() {
                    "接続成功".to_string()
                } else {
                    format!("HTTP {status}")
                },
            })
        }
        Err(e) => Ok(HealthCheckResult {
            ok: false,
            status: 0,
            message: e.to_string(),
        }),
    }
}
