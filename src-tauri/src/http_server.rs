use axum::{
    body::Body,
    extract::{Path, Query, Request, State},
    http::{header::AUTHORIZATION, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::AppHandle;
use tower_http::cors::CorsLayer;
use utoipa::{IntoParams, OpenApi, ToSchema};

use crate::image_cache::ImageCache;
use crate::query_bridge;
use notecli::api::MisskeyClient;
use notecli::db::Database;
use notecli::event_bus::EventBus;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "NoteDeck API",
        description = "NoteDeck localhost API — Misskey desktop client control interface",
        license(name = "MIT"),
    ),
    paths(
        get_deck_columns, add_deck_column, remove_deck_column,
        get_deck_active, list_commands, execute_command, proxy_image,
    ),
    components(schemas(ApiErrorResponse)),
    tags(
        (name = "deck", description = "Deck state"),
        (name = "commands", description = "Command execution"),
        (name = "proxy", description = "Image proxy / CDN cache"),
    ),
    modifiers(&SecurityAddon),
)]
struct ApiDoc;

struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "bearer_auth",
            utoipa::openapi::security::SecurityScheme::Http(utoipa::openapi::security::Http::new(
                utoipa::openapi::security::HttpAuthScheme::Bearer,
            )),
        );
    }
}

/// Error response body
#[derive(serde::Serialize, ToSchema)]
struct ApiErrorResponse {
    /// Error code (e.g. "NOT_FOUND", "UNAUTHORIZED")
    error: String,
    /// Human-readable error message
    message: String,
}

const PORT: u16 = 19820;

// --- NoteDeck-specific state (for deck, commands, proxy routes) ---

#[derive(Clone)]
struct DeckState {
    app_handle: AppHandle,
    api_token: String,
    image_cache: Arc<ImageCache>,
}

// --- Error type ---

struct ApiError {
    status: StatusCode,
    code: String,
    message: String,
}

impl ApiError {
    fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHORIZED".to_string(),
            message: "Missing or invalid Bearer token".to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let body = json!({ "error": self.code, "message": self.message });
        (self.status, Json(body)).into_response()
    }
}

// --- Routes ---

pub async fn start(
    app_handle: AppHandle,
    db: Arc<Database>,
    client: Arc<MisskeyClient>,
    event_bus: Arc<EventBus>,
    api_token: String,
    token_path: String,
    image_cache: Arc<ImageCache>,
) {
    // Build core Misskey API routes from notecli
    let notecli_state = notecli::http_server::AppState::new(
        db,
        client,
        event_bus,
        api_token.clone(),
        token_path.clone(),
    );
    let core_routes = notecli::http_server::build_core_routes(notecli_state);

    // NoteDeck-specific state
    let deck_state = DeckState {
        app_handle,
        api_token: api_token.clone(),
        image_cache,
    };

    // NoteDeck index (public, includes all endpoints)
    let index_route = {
        let token_path = token_path.clone();
        Router::new()
            .route(
                "/api",
                get(move || async move {
                    Json(json!({
                        "name": "notedeck",
                        "version": env!("CARGO_PKG_VERSION"),
                        "auth": "Bearer token required. Read token from the file at tokenPath.",
                        "tokenPath": token_path,
                        "docs": "/api/docs",
                        "openapi": "/api/openapi.json",
                        "endpoints": [
                            { "method": "GET",    "path": "/api",                                  "description": "This endpoint list" },
                            { "method": "GET",    "path": "/api/accounts",                         "description": "List accounts (no tokens)" },
                            { "method": "GET",    "path": "/api/{host}/timeline/{type}",           "description": "Get timeline notes" },
                            { "method": "GET",    "path": "/api/{host}/notifications",             "description": "Get notifications" },
                            { "method": "POST",   "path": "/api/{host}/note",                      "description": "Create a note" },
                            { "method": "GET",    "path": "/api/{host}/search?q=...",              "description": "Search notes" },
                            { "method": "GET",    "path": "/api/{host}/notes/{id}",                "description": "Get a note" },
                            { "method": "DELETE", "path": "/api/{host}/notes/{id}",                "description": "Delete a note" },
                            { "method": "GET",    "path": "/api/{host}/notes/{id}/children",       "description": "Get note replies" },
                            { "method": "GET",    "path": "/api/{host}/notes/{id}/conversation",   "description": "Get note conversation" },
                            { "method": "GET",    "path": "/api/{host}/notes/{id}/reactions",      "description": "Get note reactions" },
                            { "method": "POST",   "path": "/api/{host}/notes/{id}/reactions",      "description": "Add reaction" },
                            { "method": "DELETE", "path": "/api/{host}/notes/{id}/reactions",      "description": "Remove reaction" },
                            { "method": "GET",    "path": "/api/{host}/users/{id}",                "description": "Get user detail" },
                            { "method": "GET",    "path": "/api/{host}/users/{id}/notes",          "description": "Get user notes" },
                            { "method": "GET",    "path": "/api/events",                           "description": "SSE event stream" },
                            { "method": "GET",    "path": "/api/deck/columns",                     "description": "List deck columns" },
                            { "method": "POST",   "path": "/api/deck/columns",                     "description": "Add deck column" },
                            { "method": "DELETE", "path": "/api/deck/columns/{id}",                "description": "Remove deck column" },
                            { "method": "GET",    "path": "/api/deck/active",                      "description": "Get active column" },
                            { "method": "GET",    "path": "/api/commands",                         "description": "List commands" },
                            { "method": "POST",   "path": "/api/commands/{id}/execute",            "description": "Execute command" },
                        ]
                    }))
                }),
            )
            .layer(CorsLayer::permissive())
    };

    // Authenticated NoteDeck-specific routes (deck, commands)
    let deck_routes = Router::new()
        .route("/api/deck/columns", get(get_deck_columns))
        .route("/api/deck/columns", post(add_deck_column))
        .route("/api/deck/columns/{column_id}", delete(remove_deck_column))
        .route("/api/deck/active", get(get_deck_active))
        .route("/api/commands", get(list_commands))
        .route("/api/commands/{command_id}/execute", post(execute_command))
        .layer(middleware::from_fn_with_state(
            deck_state.clone(),
            deck_auth_middleware,
        ))
        .layer(CorsLayer::permissive())
        .with_state(deck_state.clone());

    // Public routes (no auth)
    let public_routes = Router::new()
        .route("/proxy/image", get(proxy_image))
        .route("/api/openapi.json", get(openapi_json))
        .route("/api/docs", get(openapi_docs))
        .layer(CorsLayer::permissive())
        .with_state(deck_state);

    let app = Router::new()
        .merge(index_route)
        .merge(core_routes)
        .merge(deck_routes)
        .merge(public_routes);

    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    eprintln!("[http] listening on http://{addr}");

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[http] failed to bind {addr}: {e}");
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[http] server error: {e}");
    }
}

// --- Auth middleware for NoteDeck-specific routes ---

async fn deck_auth_middleware(
    State(state): State<DeckState>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    let token = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match token {
        Some(t) if t == state.api_token => Ok(next.run(req).await),
        _ => Err(ApiError::unauthorized().into_response()),
    }
}

// --- QueryBridge handlers (deck state + commands) ---

#[utoipa::path(get, path = "/api/deck/columns", tag = "deck",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "Deck columns list"),
        (status = 401, description = "Unauthorized", body = ApiErrorResponse),
    )
)]
async fn get_deck_columns(State(state): State<DeckState>) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(&state.app_handle, "deck/columns", json!({}))
        .await
        .map_err(|e| ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "QUERY_FAILED".to_string(),
            message: e,
        })?;
    Ok(Json(data))
}

#[utoipa::path(post, path = "/api/deck/columns", tag = "deck",
    security(("bearer_auth" = [])),
    request_body = Value,
    responses(
        (status = 200, description = "Column added"),
        (status = 401, description = "Unauthorized", body = ApiErrorResponse),
    )
)]
async fn add_deck_column(
    State(state): State<DeckState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(&state.app_handle, "deck/add-column", body)
        .await
        .map_err(|e| ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "QUERY_FAILED".to_string(),
            message: e,
        })?;
    Ok(Json(data))
}

#[utoipa::path(delete, path = "/api/deck/columns/{column_id}", tag = "deck",
    security(("bearer_auth" = [])),
    params(("column_id" = String, Path, description = "Column ID")),
    responses(
        (status = 204, description = "Column removed"),
        (status = 401, description = "Unauthorized", body = ApiErrorResponse),
    )
)]
async fn remove_deck_column(
    State(state): State<DeckState>,
    Path(column_id): Path<String>,
) -> Result<StatusCode, ApiError> {
    query_bridge::query_frontend(
        &state.app_handle,
        "deck/remove-column",
        json!({ "columnId": column_id }),
    )
    .await
    .map_err(|e| ApiError {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        code: "QUERY_FAILED".to_string(),
        message: e,
    })?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(get, path = "/api/deck/active", tag = "deck",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "Active column info"),
        (status = 401, description = "Unauthorized", body = ApiErrorResponse),
    )
)]
async fn get_deck_active(State(state): State<DeckState>) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(&state.app_handle, "deck/active", json!({}))
        .await
        .map_err(|e| ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "QUERY_FAILED".to_string(),
            message: e,
        })?;
    Ok(Json(data))
}

#[utoipa::path(get, path = "/api/commands", tag = "commands",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "Available commands"),
        (status = 401, description = "Unauthorized", body = ApiErrorResponse),
    )
)]
async fn list_commands(State(state): State<DeckState>) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(&state.app_handle, "commands/list", json!({}))
        .await
        .map_err(|e| ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "QUERY_FAILED".to_string(),
            message: e,
        })?;
    Ok(Json(data))
}

#[utoipa::path(post, path = "/api/commands/{command_id}/execute", tag = "commands",
    security(("bearer_auth" = [])),
    params(("command_id" = String, Path, description = "Command ID")),
    responses(
        (status = 200, description = "Command result"),
        (status = 401, description = "Unauthorized", body = ApiErrorResponse),
    )
)]
async fn execute_command(
    State(state): State<DeckState>,
    Path(command_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(
        &state.app_handle,
        "commands/execute",
        json!({ "commandId": command_id }),
    )
    .await
    .map_err(|e| ApiError {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        code: "QUERY_FAILED".to_string(),
        message: e,
    })?;
    Ok(Json(data))
}

// --- OpenAPI docs ---

async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

async fn openapi_docs() -> axum::response::Html<&'static str> {
    axum::response::Html(
        r#"<!DOCTYPE html>
<html><head>
<title>NoteDeck API</title>
<meta charset="utf-8">
<script>
(function() {
  var dark = location.hash !== '#light';
  var el = document.createElement('script');
  el.id = 'api-reference';
  el.dataset.url = '/api/openapi.json';
  el.dataset.configuration = JSON.stringify({ darkMode: dark });
  document.currentScript.after(el);
})();
</script>
</head><body>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>"#,
    )
}

// --- Image proxy ---

#[derive(Debug, Deserialize, IntoParams)]
struct ProxyImageParams {
    url: String,
}

#[utoipa::path(get, path = "/proxy/image", tag = "proxy",
    params(ProxyImageParams),
    responses(
        (status = 200, description = "Proxied image (with 3-layer cache)"),
        (status = 304, description = "Not Modified (ETag match)"),
        (status = 502, description = "Upstream fetch failed"),
    )
)]
async fn proxy_image(
    State(state): State<DeckState>,
    headers: axum::http::HeaderMap,
    Query(params): Query<ProxyImageParams>,
) -> Response {
    use crate::image_cache::{hex_hash, StreamingFetchResult};

    let etag = format!("\"{}\"", hex_hash(&params.url));

    // ETag conditional: return 304 if client already has this image
    if let Some(if_none_match) = headers.get("if-none-match").and_then(|v| v.to_str().ok()) {
        if if_none_match == etag {
            return Response::builder()
                .status(StatusCode::NOT_MODIFIED)
                .header("ETag", &etag)
                .header("Cache-Control", "public, max-age=86400, immutable")
                .body(Body::empty())
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    }

    // Phase 1: Check cache (instant response)
    if let Some(entry) = state.image_cache.check_cache_only(&params.url).await {
        let body_bytes = if let Some(ref mem) = entry.mem_bytes {
            (**mem).clone()
        } else {
            match tokio::fs::read(&entry.path).await {
                Ok(b) => b,
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        };
        return Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", &entry.content_type)
            .header("Cache-Control", "public, max-age=86400, immutable")
            .header("ETag", &etag)
            .body(Body::from(body_bytes))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }

    // Phase 2: Stream from upstream (low TTFB)
    match state.image_cache.fetch_streaming(&params.url).await {
        Ok(StreamingFetchResult::Cached(entry)) => {
            // Inflight dedup resolved to a cached entry
            let body_bytes = if let Some(ref mem) = entry.mem_bytes {
                (**mem).clone()
            } else {
                match tokio::fs::read(&entry.path).await {
                    Ok(b) => b,
                    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
                }
            };
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", &entry.content_type)
                .header("Cache-Control", "public, max-age=86400, immutable")
                .header("ETag", &etag)
                .body(Body::from(body_bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Ok(StreamingFetchResult::Streaming {
            byte_stream,
            content_type,
        }) => {
            let body = Body::from_stream(byte_stream);
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", &content_type)
                .header("Cache-Control", "public, max-age=86400, immutable")
                .header("ETag", &etag)
                .body(body)
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(msg) => (StatusCode::BAD_GATEWAY, msg).into_response(),
    }
}
