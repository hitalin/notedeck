use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use tauri::{AppHandle, Manager};
use tower_http::cors::CorsLayer;

use crate::api::MisskeyClient;
use crate::commands;
use crate::db::Database;
use crate::models::{AccountPublic, CreateNoteParams, TimelineType};

const PORT: u16 = 19820;

#[derive(Clone)]
struct AppState {
    app_handle: AppHandle,
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

}

impl From<crate::error::NoteDeckError> for ApiError {
    fn from(e: crate::error::NoteDeckError) -> Self {
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

pub async fn start(app_handle: AppHandle) {
    let state = AppState { app_handle };

    let app = Router::new()
        .route("/api", get(index))
        .route("/api/accounts", get(list_accounts))
        .route("/api/{host}/timeline/{tl_type}", get(get_timeline))
        .route("/api/{host}/notifications", get(get_notifications))
        .route("/api/{host}/note", post(create_note))
        .route("/api/{host}/search", get(search_notes))
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

// --- Handlers ---

async fn index() -> Json<Value> {
    Json(json!({
        "name": "notedeck",
        "version": env!("CARGO_PKG_VERSION"),
        "endpoints": [
            { "method": "GET",  "path": "/api",                          "description": "This endpoint list" },
            { "method": "GET",  "path": "/api/accounts",                 "description": "List accounts (no tokens)" },
            { "method": "GET",  "path": "/api/{host}/timeline/{type}",   "description": "Get timeline notes" },
            { "method": "GET",  "path": "/api/{host}/notifications",     "description": "Get notifications" },
            { "method": "POST", "path": "/api/{host}/note",              "description": "Create a note" },
            { "method": "GET",  "path": "/api/{host}/search?q=...",      "description": "Search notes" },
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

// --- Query / Body types ---

#[derive(Debug, Deserialize)]
struct TimelineQueryParams {
    limit: Option<i64>,
    since_id: Option<String>,
    until_id: Option<String>,
}

impl TimelineQueryParams {
    fn into_timeline_options(self) -> crate::models::TimelineOptions {
        crate::models::TimelineOptions::new(
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
struct CreateNoteBody {
    text: String,
    cw: Option<String>,
    visibility: Option<String>,
    local_only: Option<bool>,
    reply_id: Option<String>,
    renote_id: Option<String>,
    file_ids: Option<Vec<String>>,
}
