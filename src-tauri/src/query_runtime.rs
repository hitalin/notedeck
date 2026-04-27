use std::collections::HashMap;
use std::sync::Mutex;

use notecli::error::NoteDeckError;
use notecli::models::TimelineType;
use notecli::streaming::StreamingManager;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use tauri::State;
use tauri_specta::Event;

use crate::commands::{get_credentials, AppState};

const MAX_READ_MODEL_ITEMS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum QueryKey {
    Timeline {
        account_id: String,
        timeline_type: TimelineType,
        list_id: Option<String>,
    },
    Antenna {
        account_id: String,
        antenna_id: String,
    },
    Channel {
        account_id: String,
        channel_id: String,
    },
    Role {
        account_id: String,
        role_id: String,
    },
    Mentions {
        account_id: String,
    },
    Notifications {
        account_id: String,
    },
    ChatUser {
        account_id: String,
        other_id: String,
    },
    ChatRoom {
        account_id: String,
        room_id: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum QueryRuntimeState {
    Live,
    Warm,
    Suspended,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuerySnapshot {
    pub query_id: String,
    pub key: QueryKey,
    pub runtime_state: QueryRuntimeState,
    pub subscriber_count: u32,
    pub revision: u64,
    pub source_subscription_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QueryReadModelSnapshot {
    pub query_id: String,
    pub revision: u64,
    pub items: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct QueryDelta {
    pub query_id: String,
    pub revision: u64,
    pub inserts: Vec<Value>,
    pub deletes: Vec<String>,
    /// Partial note updates (reaction add/remove, poll vote, etc.) routed
    /// from `stream-note-updated`. Items in the read model are not rewritten —
    /// consumers apply these to their own per-note state.
    pub updates: Vec<NoteUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteUpdate {
    pub note_id: String,
    pub update_type: String,
    pub body: Value,
}

#[derive(Debug)]
struct QueryEntry {
    query_id: String,
    key: QueryKey,
    canonical_key: String,
    runtime_state: QueryRuntimeState,
    subscriber_count: u32,
    revision: u64,
    source_subscription_id: Option<String>,
    items: Vec<Value>,
}

#[derive(Default)]
struct QueryRuntimeInner {
    entries: HashMap<String, QueryEntry>,
    ids_by_key: HashMap<String, String>,
    query_ids_by_subscription: HashMap<String, String>,
}

#[derive(Default)]
pub struct QueryRuntime {
    inner: Mutex<QueryRuntimeInner>,
}

impl QueryRuntime {
    pub fn open(&self, key: QueryKey) -> Result<QuerySnapshot, NoteDeckError> {
        let canonical_key = canonicalize_key(&key)?;
        let mut inner = self.lock()?;

        if let Some(query_id) = inner.ids_by_key.get(&canonical_key).cloned() {
            let entry = inner
                .entries
                .get_mut(&query_id)
                .ok_or_else(|| runtime_error("query index is inconsistent"))?;
            entry.subscriber_count = entry.subscriber_count.saturating_add(1);
            entry.runtime_state = QueryRuntimeState::Live;
            entry.revision = entry.revision.saturating_add(1);
            return Ok(snapshot(entry));
        }

        let query_id = format!("q:{}", uuid::Uuid::new_v4());
        let entry = QueryEntry {
            query_id: query_id.clone(),
            key,
            canonical_key: canonical_key.clone(),
            runtime_state: QueryRuntimeState::Live,
            subscriber_count: 1,
            revision: 1,
            source_subscription_id: None,
            items: Vec::new(),
        };
        let result = snapshot(&entry);
        inner.ids_by_key.insert(canonical_key, query_id.clone());
        inner.entries.insert(query_id, entry);
        Ok(result)
    }

    pub fn attach_stream_subscription(
        &self,
        query_id: &str,
        subscription_id: String,
    ) -> Result<QuerySnapshot, NoteDeckError> {
        let mut inner = self.lock()?;
        let old_subscription_id = {
            let entry = inner
                .entries
                .get_mut(query_id)
                .ok_or_else(|| runtime_error(format!("unknown query id: {query_id}")))?;

            if entry.source_subscription_id.as_ref() == Some(&subscription_id) {
                return Ok(snapshot(entry));
            }

            let old = entry
                .source_subscription_id
                .replace(subscription_id.clone());
            entry.revision = entry.revision.saturating_add(1);
            old
        };

        if let Some(old) = old_subscription_id {
            inner.query_ids_by_subscription.remove(&old);
        }
        inner
            .query_ids_by_subscription
            .insert(subscription_id, query_id.to_string());
        let entry = inner
            .entries
            .get(query_id)
            .ok_or_else(|| runtime_error(format!("unknown query id: {query_id}")))?;
        Ok(snapshot(entry))
    }

    pub fn stream_subscription_for(
        &self,
        query_id: &str,
    ) -> Result<Option<(String, String)>, NoteDeckError> {
        let inner = self.lock()?;
        let Some(entry) = inner.entries.get(query_id) else {
            return Ok(None);
        };
        let Some(subscription_id) = entry.source_subscription_id.clone() else {
            return Ok(None);
        };
        Ok(Some((account_id(&entry.key).to_string(), subscription_id)))
    }

    pub fn set_runtime_state(
        &self,
        query_id: &str,
        state: QueryRuntimeState,
    ) -> Result<QuerySnapshot, NoteDeckError> {
        let mut inner = self.lock()?;
        let entry = inner
            .entries
            .get_mut(query_id)
            .ok_or_else(|| runtime_error(format!("unknown query id: {query_id}")))?;
        if entry.runtime_state != state {
            entry.runtime_state = state;
            entry.revision = entry.revision.saturating_add(1);
        }
        Ok(snapshot(entry))
    }

    pub fn close(&self, query_id: &str) -> Result<Option<(String, String)>, NoteDeckError> {
        let mut inner = self.lock()?;
        let Some(entry) = inner.entries.get_mut(query_id) else {
            return Ok(None);
        };

        entry.subscriber_count = entry.subscriber_count.saturating_sub(1);
        entry.revision = entry.revision.saturating_add(1);
        if entry.subscriber_count > 0 {
            return Ok(None);
        }

        let canonical_key = entry.canonical_key.clone();
        let source = entry
            .source_subscription_id
            .clone()
            .map(|subscription_id| (account_id(&entry.key).to_string(), subscription_id));
        if let Some((_, subscription_id)) = source.as_ref() {
            inner.query_ids_by_subscription.remove(subscription_id);
        }
        inner.ids_by_key.remove(&canonical_key);
        inner.entries.remove(query_id);
        Ok(source)
    }

    pub fn snapshot(&self, query_id: &str) -> Result<Option<QuerySnapshot>, NoteDeckError> {
        let inner = self.lock()?;
        Ok(inner.entries.get(query_id).map(snapshot))
    }

    pub fn read_model_snapshot(
        &self,
        query_id: &str,
        limit: Option<u32>,
    ) -> Result<Option<QueryReadModelSnapshot>, NoteDeckError> {
        let inner = self.lock()?;
        let Some(entry) = inner.entries.get(query_id) else {
            return Ok(None);
        };
        let limit = limit.unwrap_or(MAX_READ_MODEL_ITEMS as u32) as usize;
        Ok(Some(QueryReadModelSnapshot {
            query_id: entry.query_id.clone(),
            revision: entry.revision,
            items: entry.items.iter().take(limit).cloned().collect(),
        }))
    }

    pub fn ingest_stream_event(&self, event: &str, payload: &Value) -> Option<QueryDelta> {
        let change = StreamChange::from_event(event, payload)?;
        let mut inner = self.inner.lock().ok()?;
        let query_id = inner
            .query_ids_by_subscription
            .get(change.subscription_id)
            .cloned()?;
        let entry = inner.entries.get_mut(&query_id)?;
        change.apply(entry)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, QueryRuntimeInner>, NoteDeckError> {
        self.inner
            .lock()
            .map_err(|_| runtime_error("query runtime lock poisoned"))
    }
}

/// Decoded change extracted from a stream-* event before it is applied to a query entry.
struct StreamChange<'a> {
    subscription_id: &'a str,
    kind: StreamChangeKind,
}

enum StreamChangeKind {
    Insert(Value),
    Delete(String),
    Update(NoteUpdate),
}

impl<'a> StreamChange<'a> {
    fn from_event(event: &str, payload: &'a Value) -> Option<Self> {
        let subscription_id = payload.get("subscriptionId").and_then(Value::as_str)?;
        let kind = match event {
            "stream-note" | "stream-mention" => {
                StreamChangeKind::Insert(payload.get("note").cloned()?)
            }
            "stream-notification" => {
                StreamChangeKind::Insert(payload.get("notification").cloned()?)
            }
            "stream-chat-message" => StreamChangeKind::Insert(payload.get("message").cloned()?),
            "stream-note-updated" => {
                let update_type = payload.get("updateType").and_then(Value::as_str)?.to_string();
                let note_id = payload.get("noteId").and_then(Value::as_str)?.to_string();
                if update_type == "deleted" {
                    StreamChangeKind::Delete(note_id)
                } else {
                    let body = payload.get("body").cloned().unwrap_or(Value::Null);
                    StreamChangeKind::Update(NoteUpdate {
                        note_id,
                        update_type,
                        body,
                    })
                }
            }
            "stream-chat-message-deleted" => {
                let id = payload.get("messageId").and_then(Value::as_str)?.to_string();
                StreamChangeKind::Delete(id)
            }
            _ => return None,
        };
        Some(Self {
            subscription_id,
            kind,
        })
    }

    fn apply(self, entry: &mut QueryEntry) -> Option<QueryDelta> {
        match self.kind {
            StreamChangeKind::Insert(item) => {
                let id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)?;
                entry
                    .items
                    .retain(|i| i.get("id").and_then(Value::as_str) != Some(&id));
                entry.items.insert(0, item.clone());
                if entry.items.len() > MAX_READ_MODEL_ITEMS {
                    entry.items.truncate(MAX_READ_MODEL_ITEMS);
                }
                entry.revision = entry.revision.saturating_add(1);
                Some(QueryDelta {
                    query_id: entry.query_id.clone(),
                    revision: entry.revision,
                    inserts: vec![item],
                    deletes: Vec::new(),
                    updates: Vec::new(),
                })
            }
            StreamChangeKind::Delete(id) => {
                let before = entry.items.len();
                entry
                    .items
                    .retain(|i| i.get("id").and_then(Value::as_str) != Some(id.as_str()));
                if entry.items.len() == before {
                    return None;
                }
                entry.revision = entry.revision.saturating_add(1);
                Some(QueryDelta {
                    query_id: entry.query_id.clone(),
                    revision: entry.revision,
                    inserts: Vec::new(),
                    deletes: vec![id],
                    updates: Vec::new(),
                })
            }
            StreamChangeKind::Update(update) => {
                entry.revision = entry.revision.saturating_add(1);
                Some(QueryDelta {
                    query_id: entry.query_id.clone(),
                    revision: entry.revision,
                    inserts: Vec::new(),
                    deletes: Vec::new(),
                    updates: vec![update],
                })
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_timeline(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
    timeline_type: TimelineType,
    list_id: Option<String>,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let key = QueryKey::Timeline {
        account_id: account_id.clone(),
        timeline_type: timeline_type.clone(),
        list_id: list_id.clone(),
    };
    let opened = runtime.open(key)?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming
        .subscribe_timeline(&account_id, timeline_type, list_id)
        .await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_antenna(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
    antenna_id: String,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let opened = runtime.open(QueryKey::Antenna {
        account_id: account_id.clone(),
        antenna_id: antenna_id.clone(),
    })?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming
        .subscribe_antenna(&account_id, &antenna_id)
        .await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_channel(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
    channel_id: String,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let opened = runtime.open(QueryKey::Channel {
        account_id: account_id.clone(),
        channel_id: channel_id.clone(),
    })?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming
        .subscribe_channel(&account_id, &channel_id)
        .await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_role(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
    role_id: String,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let opened = runtime.open(QueryKey::Role {
        account_id: account_id.clone(),
        role_id: role_id.clone(),
    })?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming.subscribe_role(&account_id, &role_id).await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_mentions(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let opened = runtime.open(QueryKey::Mentions {
        account_id: account_id.clone(),
    })?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming.subscribe_main(&account_id).await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_notifications(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let opened = runtime.open(QueryKey::Notifications {
        account_id: account_id.clone(),
    })?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming.subscribe_main(&account_id).await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_chat_user(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
    other_id: String,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let opened = runtime.open(QueryKey::ChatUser {
        account_id: account_id.clone(),
        other_id: other_id.clone(),
    })?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming.subscribe_chat_user(&account_id, &other_id).await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_subscribe_chat_room(
    app_state: State<'_, AppState>,
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    account_id: String,
    room_id: String,
) -> Result<QuerySnapshot, NoteDeckError> {
    let db = app_state.db().await;
    let (host, token) = get_credentials(&db, &account_id)?;
    streaming.connect(&account_id, &host, &token).await?;

    let opened = runtime.open(QueryKey::ChatRoom {
        account_id: account_id.clone(),
        room_id: room_id.clone(),
    })?;
    if opened.source_subscription_id.is_some() {
        return Ok(opened);
    }

    let subscription_id = streaming.subscribe_chat_room(&account_id, &room_id).await?;
    runtime.attach_stream_subscription(&opened.query_id, subscription_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_open(
    runtime: State<'_, QueryRuntime>,
    key: QueryKey,
) -> Result<QuerySnapshot, NoteDeckError> {
    runtime.open(key)
}

#[tauri::command]
#[specta::specta]
pub async fn query_set_runtime_state(
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    query_id: String,
    state: QueryRuntimeState,
) -> Result<QuerySnapshot, NoteDeckError> {
    let result = runtime.set_runtime_state(&query_id, state)?;
    if let Some((account_id, subscription_id)) = runtime.stream_subscription_for(&query_id)? {
        match state {
            QueryRuntimeState::Live => {
                streaming
                    .resume_subscription(&account_id, &subscription_id)
                    .await?;
            }
            QueryRuntimeState::Suspended => {
                streaming
                    .suspend_subscription(&account_id, &subscription_id)
                    .await?;
            }
            QueryRuntimeState::Warm => {}
        }
    }
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn query_close(
    streaming: State<'_, StreamingManager>,
    runtime: State<'_, QueryRuntime>,
    query_id: String,
) -> Result<(), NoteDeckError> {
    if let Some((account_id, subscription_id)) = runtime.close(&query_id)? {
        streaming.unsubscribe(&account_id, &subscription_id).await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn query_get_snapshot(
    runtime: State<'_, QueryRuntime>,
    query_id: String,
) -> Result<Option<QuerySnapshot>, NoteDeckError> {
    runtime.snapshot(&query_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_get_read_model_snapshot(
    runtime: State<'_, QueryRuntime>,
    query_id: String,
    limit: Option<u32>,
) -> Result<Option<QueryReadModelSnapshot>, NoteDeckError> {
    runtime.read_model_snapshot(&query_id, limit)
}

fn snapshot(entry: &QueryEntry) -> QuerySnapshot {
    QuerySnapshot {
        query_id: entry.query_id.clone(),
        key: entry.key.clone(),
        runtime_state: entry.runtime_state,
        subscriber_count: entry.subscriber_count,
        revision: entry.revision,
        source_subscription_id: entry.source_subscription_id.clone(),
    }
}

fn canonicalize_key(key: &QueryKey) -> Result<String, NoteDeckError> {
    serde_json::to_string(key).map_err(|e| runtime_error(format!("invalid query key: {e}")))
}

fn runtime_error(message: impl Into<String>) -> NoteDeckError {
    NoteDeckError::InvalidInput(message.into())
}

fn account_id(key: &QueryKey) -> &str {
    match key {
        QueryKey::Timeline { account_id, .. }
        | QueryKey::Antenna { account_id, .. }
        | QueryKey::Channel { account_id, .. }
        | QueryKey::Role { account_id, .. }
        | QueryKey::Mentions { account_id }
        | QueryKey::Notifications { account_id }
        | QueryKey::ChatUser { account_id, .. }
        | QueryKey::ChatRoom { account_id, .. } => account_id,
    }
}
