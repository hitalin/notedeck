use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{Emitter, State};

use notecli::error::NoteDeckError;

use super::ai::{read_ai_api_key, validate_ai_provider};
use super::Result;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AiChatRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AiChatMessage {
    pub role: AiChatRole,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
pub struct AiChatRequest {
    pub stream_id: String,
    pub provider: String,
    pub endpoint: String,
    pub model: String,
    pub messages: Vec<AiChatMessage>,
    pub system: Option<String>,
    pub max_tokens: Option<u32>,
}

/// Wire-format event sent over the `nd:ai-chat-event` channel.
/// Flat shape (rather than tagged enum) for stable specta TS bindings.
#[derive(Debug, Clone, Serialize, Type)]
pub struct AiChatEvent {
    pub stream_id: String,
    /// `"delta" | "done" | "error"`
    pub kind: String,
    /// Present when `kind == "delta"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Present when `kind == "error"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

const EVENT_NAME: &str = "nd:ai-chat-event";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(180);
const DEFAULT_MAX_TOKENS: u32 = 4096;

/// Start a streaming chat completion request. Returns immediately;
/// the actual request runs in a background task that emits events
/// to `nd:ai-chat-event` keyed by `stream_id`.
#[tauri::command]
#[specta::specta]
pub async fn ai_chat_send(
    app: tauri::AppHandle,
    http: State<'_, reqwest::Client>,
    req: AiChatRequest,
) -> Result<()> {
    validate_ai_provider(&req.provider)?;
    if req.endpoint.trim().is_empty() {
        return Err(NoteDeckError::InvalidInput("endpoint is empty".into()));
    }
    if req.model.trim().is_empty() {
        return Err(NoteDeckError::InvalidInput("model is empty".into()));
    }

    let api_key = read_ai_api_key(&req.provider)?.unwrap_or_default();
    if req.provider != "custom" && api_key.is_empty() {
        return Err(NoteDeckError::Auth(format!(
            "API key for {} is not set",
            req.provider
        )));
    }

    let client = http.inner().clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let stream_id = req.stream_id.clone();
        let result = match req.provider.as_str() {
            "anthropic" => run_anthropic(&client, &req, &api_key, &app_handle).await,
            "openai" | "custom" => run_openai_compat(&client, &req, &api_key, &app_handle).await,
            other => Err(format!("Unknown provider: {other}")),
        };
        match result {
            Ok(()) => emit_done(&app_handle, &stream_id),
            Err(message) => emit_error(&app_handle, &stream_id, message),
        }
    });

    Ok(())
}

fn emit_delta(app: &tauri::AppHandle, stream_id: &str, text: String) {
    let _ = app.emit(
        EVENT_NAME,
        AiChatEvent {
            stream_id: stream_id.to_string(),
            kind: "delta".into(),
            text: Some(text),
            error: None,
        },
    );
}

fn emit_done(app: &tauri::AppHandle, stream_id: &str) {
    let _ = app.emit(
        EVENT_NAME,
        AiChatEvent {
            stream_id: stream_id.to_string(),
            kind: "done".into(),
            text: None,
            error: None,
        },
    );
}

fn emit_error(app: &tauri::AppHandle, stream_id: &str, message: String) {
    let _ = app.emit(
        EVENT_NAME,
        AiChatEvent {
            stream_id: stream_id.to_string(),
            kind: "error".into(),
            text: None,
            error: Some(message),
        },
    );
}

fn role_str(r: &AiChatRole) -> &'static str {
    match r {
        AiChatRole::System => "system",
        AiChatRole::User => "user",
        AiChatRole::Assistant => "assistant",
    }
}

fn parse_sse_blocks(buf: &mut String) -> Vec<String> {
    let mut blocks = Vec::new();
    while let Some(pos) = buf.find("\n\n") {
        blocks.push(buf[..pos].to_string());
        buf.drain(..pos + 2);
    }
    blocks
}

// --- Anthropic Messages API ---

async fn run_anthropic(
    client: &reqwest::Client,
    req: &AiChatRequest,
    api_key: &str,
    app: &tauri::AppHandle,
) -> std::result::Result<(), String> {
    use serde_json::json;

    let url = format!("{}/v1/messages", req.endpoint.trim_end_matches('/'));
    let messages: Vec<serde_json::Value> = req
        .messages
        .iter()
        .filter(|m| !matches!(m.role, AiChatRole::System))
        .map(|m| {
            json!({
                "role": role_str(&m.role),
                "content": m.content,
            })
        })
        .collect();

    let mut body = json!({
        "model": req.model,
        "max_tokens": req.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS),
        "messages": messages,
        "stream": true,
    });
    if let Some(sys) = req.system.as_deref().filter(|s| !s.is_empty()) {
        body["system"] = json!(sys);
    }

    let resp = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .timeout(REQUEST_TIMEOUT)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        return Err(format_http_error(status, &text));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        for block in parse_sse_blocks(&mut buf) {
            handle_anthropic_block(&block, app, &req.stream_id);
        }
    }
    Ok(())
}

fn handle_anthropic_block(block: &str, app: &tauri::AppHandle, stream_id: &str) {
    let mut data: Option<&str> = None;
    for line in block.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            data = Some(rest.trim());
        }
    }
    let Some(data) = data else { return };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else {
        return;
    };
    let Some(t) = value.get("type").and_then(|v| v.as_str()) else {
        return;
    };
    if t == "content_block_delta" {
        if let Some(text) = value.pointer("/delta/text").and_then(|v| v.as_str()) {
            emit_delta(app, stream_id, text.to_string());
        }
    } else if t == "error" {
        if let Some(msg) = value
            .pointer("/error/message")
            .and_then(|v| v.as_str())
        {
            emit_error(app, stream_id, format!("Anthropic: {msg}"));
        }
    }
}

// --- OpenAI Chat Completions (and OpenAI-compatible) ---

async fn run_openai_compat(
    client: &reqwest::Client,
    req: &AiChatRequest,
    api_key: &str,
    app: &tauri::AppHandle,
) -> std::result::Result<(), String> {
    use serde_json::json;

    let url = format!("{}/chat/completions", req.endpoint.trim_end_matches('/'));
    let mut messages: Vec<serde_json::Value> = Vec::new();
    if let Some(sys) = req.system.as_deref().filter(|s| !s.is_empty()) {
        messages.push(json!({"role": "system", "content": sys}));
    }
    for m in &req.messages {
        messages.push(json!({
            "role": role_str(&m.role),
            "content": m.content,
        }));
    }
    let mut body = json!({
        "model": req.model,
        "messages": messages,
        "stream": true,
    });
    if let Some(mt) = req.max_tokens {
        body["max_tokens"] = json!(mt);
    }

    let mut request = client
        .post(&url)
        .header("content-type", "application/json")
        .timeout(REQUEST_TIMEOUT)
        .json(&body);
    if !api_key.is_empty() {
        request = request.header("authorization", format!("Bearer {api_key}"));
    }
    let resp = request
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        return Err(format_http_error(status, &text));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    'outer: while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        for block in parse_sse_blocks(&mut buf) {
            for line in block.lines() {
                let Some(data) = line.strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data == "[DONE]" {
                    break 'outer;
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else {
                    continue;
                };
                if let Some(text) = value
                    .pointer("/choices/0/delta/content")
                    .and_then(|v| v.as_str())
                {
                    emit_delta(app, &req.stream_id, text.to_string());
                }
            }
        }
    }
    Ok(())
}

fn format_http_error(status: u16, body: &str) -> String {
    let snippet: String = body.chars().take(500).collect();
    match status {
        401 | 403 => format!("APIキーが無効です (HTTP {status})"),
        429 => "レート制限に達しました。少し待ってから再試行してください".into(),
        500..=599 => format!("サーバーエラー (HTTP {status}): {snippet}"),
        _ => format!("HTTP {status}: {snippet}"),
    }
}
