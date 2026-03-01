use axum::{
    body::Body,
    extract::{Path, Query, Request, State},
    http::{header::AUTHORIZATION, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{delete, get, post},
    Json, Router,
};
use futures_util::stream::Stream;
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;

use notecli::api::MisskeyClient;
use crate::commands;
use crate::image_cache::ImageCache;
use notecli::db::Database;
use notecli::event_bus::EventBus;
use notecli::models::{AccountPublic, CreateNoteParams, TimelineType};
use crate::query_bridge;

const PORT: u16 = 19820;

#[derive(Clone)]
struct AppState {
    app_handle: AppHandle,
    api_token: String,
    token_path: String,
    image_cache: Arc<ImageCache>,
}

impl AppState {
    fn db(&self) -> tauri::State<'_, Database> {
        self.app_handle.state::<Database>()
    }

    fn client(&self) -> tauri::State<'_, MisskeyClient> {
        self.app_handle.state::<MisskeyClient>()
    }

    /// Find the first account matching the given host.
    fn account_id_for_host(&self, host: &str) -> Result<String, ApiError> {
        let accounts = self.db().load_accounts()?;
        accounts
            .iter()
            .find(|a| a.host == host)
            .map(|a| a.id.clone())
            .ok_or_else(|| ApiError::not_found(&format!("No account for host: {host}")))
    }
}

// --- Error type ---

struct ApiError {
    status: StatusCode,
    code: String,
    message: String,
}

impl ApiError {
    fn not_found(msg: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "NOT_FOUND".to_string(),
            message: msg.to_string(),
        }
    }

    fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHORIZED".to_string(),
            message: "Missing or invalid Bearer token".to_string(),
        }
    }
}

impl From<notecli::error::NoteDeckError> for ApiError {
    fn from(e: notecli::error::NoteDeckError) -> Self {
        let code = e.code().to_string();
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code,
            message: e.to_string(),
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

pub async fn start(app_handle: AppHandle, api_token: String, token_path: String, image_cache: Arc<ImageCache>) {
    let state = AppState {
        app_handle,
        api_token,
        token_path,
        image_cache,
    };

    // Authenticated API routes
    let api_routes = Router::new()
        .route("/api", get(index))
        .route("/api/accounts", get(list_accounts))
        .route("/api/{host}/timeline/{tl_type}", get(get_timeline))
        .route("/api/{host}/notifications", get(get_notifications))
        .route("/api/{host}/note", post(create_note))
        .route("/api/{host}/notes/{note_id}", get(get_note))
        .route("/api/{host}/notes/{note_id}", delete(delete_note))
        .route("/api/{host}/notes/{note_id}/children", get(get_note_children))
        .route("/api/{host}/notes/{note_id}/conversation", get(get_note_conversation))
        .route("/api/{host}/notes/{note_id}/reactions", get(get_note_reactions))
        .route("/api/{host}/notes/{note_id}/reactions", post(create_reaction))
        .route("/api/{host}/notes/{note_id}/reactions", delete(delete_reaction))
        .route("/api/{host}/users/{user_id}", get(get_user))
        .route("/api/{host}/users/{user_id}/notes", get(get_user_notes))
        .route("/api/{host}/search", get(search_notes))
        .route("/api/events", get(sse_events))
        .route("/api/deck/columns", get(get_deck_columns))
        .route("/api/deck/columns", post(add_deck_column))
        .route("/api/deck/columns/{column_id}", delete(remove_deck_column))
        .route("/api/deck/active", get(get_deck_active))
        .route("/api/commands", get(list_commands))
        .route("/api/commands/{command_id}/execute", post(execute_command))
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    // Public routes (localhost-only, no auth needed)
    let public_routes = Router::new()
        .route("/proxy/image", get(proxy_image));

    let app = Router::new()
        .merge(api_routes)
        .merge(public_routes)
        .layer(CorsLayer::permissive())
        .with_state(state);

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

// --- Auth middleware ---

async fn auth_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    // GET /api is public (endpoint list + token path info)
    if req.uri().path() == "/api" {
        return Ok(next.run(req).await);
    }

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

// --- Handlers ---

async fn index(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "name": "notedeck",
        "version": env!("CARGO_PKG_VERSION"),
        "auth": "Bearer token required. Read token from the file at tokenPath.",
        "tokenPath": state.token_path,
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
}

async fn list_accounts(
    State(state): State<AppState>,
) -> Result<Json<Vec<AccountPublic>>, ApiError> {
    let accounts = state.db().load_accounts()?;
    Ok(Json(accounts.iter().map(AccountPublic::from).collect()))
}

async fn get_timeline(
    State(state): State<AppState>,
    Path((host, tl_type)): Path<(String, String)>,
    Query(opts): Query<TimelineQueryParams>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let options = opts.into_timeline_options();
    let tl = TimelineType::new(tl_type);
    let notes = state
        .client()
        .get_timeline(&h, &token, &account_id, tl, options)
        .await?;
    Ok(Json(serde_json::to_value(notes).unwrap_or_default()))
}

async fn get_notifications(
    State(state): State<AppState>,
    Path(host): Path<String>,
    Query(opts): Query<TimelineQueryParams>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let options = opts.into_timeline_options();
    let notifications = state
        .client()
        .get_notifications(&h, &token, &account_id, options)
        .await?;
    Ok(Json(serde_json::to_value(notifications).unwrap_or_default()))
}

async fn create_note(
    State(state): State<AppState>,
    Path(host): Path<String>,
    Json(body): Json<CreateNoteBody>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let params = CreateNoteParams {
        text: Some(body.text),
        cw: body.cw,
        visibility: body.visibility,
        local_only: body.local_only,
        mode_flags: None,
        reply_id: body.reply_id,
        renote_id: body.renote_id,
        file_ids: body.file_ids,
    };
    let note = state
        .client()
        .create_note(&h, &token, &account_id, params)
        .await?;
    Ok(Json(serde_json::to_value(note).unwrap_or_default()))
}

async fn search_notes(
    State(state): State<AppState>,
    Path(host): Path<String>,
    Query(params): Query<SearchQueryParams>,
) -> Result<Json<Value>, ApiError> {
    let query = params.q.unwrap_or_default();
    if query.is_empty() {
        return Err(ApiError {
            status: StatusCode::BAD_REQUEST,
            code: "BAD_REQUEST".to_string(),
            message: "Missing query parameter: q".to_string(),
        });
    }
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let notes = state
        .client()
        .search_notes(&h, &token, &account_id, &query, Default::default())
        .await?;
    Ok(Json(serde_json::to_value(notes).unwrap_or_default()))
}

async fn get_note(
    State(state): State<AppState>,
    Path((host, note_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let note = state
        .client()
        .get_note(&h, &token, &account_id, &note_id)
        .await?;
    Ok(Json(serde_json::to_value(note).unwrap_or_default()))
}

async fn delete_note(
    State(state): State<AppState>,
    Path((host, note_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    state.client().delete_note(&h, &token, &note_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_note_children(
    State(state): State<AppState>,
    Path((host, note_id)): Path<(String, String)>,
    Query(opts): Query<LimitQueryParams>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let limit = opts.limit.unwrap_or(20);
    let notes = state
        .client()
        .get_note_children(&h, &token, &account_id, &note_id, limit)
        .await?;
    Ok(Json(serde_json::to_value(notes).unwrap_or_default()))
}

async fn get_note_conversation(
    State(state): State<AppState>,
    Path((host, note_id)): Path<(String, String)>,
    Query(opts): Query<LimitQueryParams>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let limit = opts.limit.unwrap_or(20);
    let notes = state
        .client()
        .get_note_conversation(&h, &token, &account_id, &note_id, limit)
        .await?;
    Ok(Json(serde_json::to_value(notes).unwrap_or_default()))
}

async fn get_note_reactions(
    State(state): State<AppState>,
    Path((host, note_id)): Path<(String, String)>,
    Query(opts): Query<ReactionQueryParams>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let limit = opts.limit.unwrap_or(20);
    let reactions = state
        .client()
        .get_note_reactions(&h, &token, &note_id, opts.r#type.as_deref(), limit)
        .await?;
    Ok(Json(serde_json::to_value(reactions).unwrap_or_default()))
}

async fn create_reaction(
    State(state): State<AppState>,
    Path((host, note_id)): Path<(String, String)>,
    Json(body): Json<ReactionBody>,
) -> Result<StatusCode, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    state
        .client()
        .create_reaction(&h, &token, &note_id, &body.reaction)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_reaction(
    State(state): State<AppState>,
    Path((host, note_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    state
        .client()
        .delete_reaction(&h, &token, &note_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_user(
    State(state): State<AppState>,
    Path((host, user_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let user = state
        .client()
        .get_user_detail(&h, &token, &user_id)
        .await?;
    Ok(Json(serde_json::to_value(user).unwrap_or_default()))
}

async fn get_user_notes(
    State(state): State<AppState>,
    Path((host, user_id)): Path<(String, String)>,
    Query(opts): Query<TimelineQueryParams>,
) -> Result<Json<Value>, ApiError> {
    let account_id = state.account_id_for_host(&host)?;
    let (h, token) = commands::get_credentials(&state.db(), &account_id)?;
    let options = opts.into_timeline_options();
    let notes = state
        .client()
        .get_user_notes(&h, &token, &account_id, &user_id, options)
        .await?;
    Ok(Json(serde_json::to_value(notes).unwrap_or_default()))
}

async fn sse_events(
    State(state): State<AppState>,
    Query(params): Query<SseQueryParams>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let event_bus = state.app_handle.state::<EventBus>();
    let rx = event_bus.subscribe();

    let type_filter: Option<Vec<String>> = params
        .r#type
        .map(|t| t.split(',').map(|s| s.trim().to_string()).collect());

    let stream = BroadcastStream::new(rx).filter_map(move |result| {
        match result {
            Ok(sse_event) => {
                if let Some(ref filter) = type_filter {
                    if !filter.iter().any(|f| sse_event.event_type.starts_with(f)) {
                        return None;
                    }
                }
                let event = Event::default()
                    .event(&sse_event.event_type)
                    .json_data(&sse_event.data)
                    .ok()?;
                Some(Ok(event))
            }
            Err(_) => None,
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

// --- QueryBridge handlers (deck state + commands) ---

async fn get_deck_columns(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(&state.app_handle, "deck/columns", json!({}))
        .await
        .map_err(|e| ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "QUERY_FAILED".to_string(),
            message: e,
        })?;
    Ok(Json(data))
}

async fn add_deck_column(
    State(state): State<AppState>,
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

async fn remove_deck_column(
    State(state): State<AppState>,
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

async fn get_deck_active(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(&state.app_handle, "deck/active", json!({}))
        .await
        .map_err(|e| ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "QUERY_FAILED".to_string(),
            message: e,
        })?;
    Ok(Json(data))
}

async fn list_commands(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let data = query_bridge::query_frontend(&state.app_handle, "commands/list", json!({}))
        .await
        .map_err(|e| ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "QUERY_FAILED".to_string(),
            message: e,
        })?;
    Ok(Json(data))
}

async fn execute_command(
    State(state): State<AppState>,
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

// --- Query / Body types ---

#[derive(Debug, Deserialize)]
struct TimelineQueryParams {
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
}

impl TimelineQueryParams {
    fn into_timeline_options(self) -> notecli::models::TimelineOptions {
        notecli::models::TimelineOptions::new(
            self.limit.unwrap_or(20),
            self.since_id,
            self.until_id,
        )
    }
}

#[derive(Debug, Deserialize)]
struct SearchQueryParams {
    q: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LimitQueryParams {
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ReactionQueryParams {
    r#type: Option<String>,
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ReactionBody {
    reaction: String,
}

#[derive(Debug, Deserialize)]
struct SseQueryParams {
    r#type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateNoteBody {
    text: String,
    cw: Option<String>,
    visibility: Option<String>,
    local_only: Option<bool>,
    reply_id: Option<String>,
    renote_id: Option<String>,
    file_ids: Option<Vec<String>>,
}

// --- Image proxy ---

#[derive(Debug, Deserialize)]
struct ProxyImageParams {
    url: String,
}

async fn proxy_image(
    State(state): State<AppState>,
    Query(params): Query<ProxyImageParams>,
) -> Response {
    match state.image_cache.get_or_fetch(&params.url).await {
        Ok(entry) => {
            match tokio::fs::read(&entry.path).await {
                Ok(bytes) => {
                    Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", &entry.content_type)
                        .header("Cache-Control", "public, max-age=86400, immutable")
                        .body(Body::from(bytes))
                        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
                }
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        }
        Err(msg) => {
            (StatusCode::BAD_GATEWAY, msg).into_response()
        }
    }
}
