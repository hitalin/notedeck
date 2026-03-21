use std::sync::Arc;

use tauri::State;

use notecli::api::MisskeyClient;
use notecli::db::Database;
use notecli::error::NoteDeckError;

use super::{get_credentials, Result};

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
