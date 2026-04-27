use std::collections::HashMap;
use std::sync::Mutex;

use notecli::error::NoteDeckError;
use notecli::models::TimelineType;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

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
}

#[derive(Debug)]
struct QueryEntry {
    query_id: String,
    key: QueryKey,
    canonical_key: String,
    runtime_state: QueryRuntimeState,
    subscriber_count: u32,
    revision: u64,
}

#[derive(Default)]
struct QueryRuntimeInner {
    entries: HashMap<String, QueryEntry>,
    ids_by_key: HashMap<String, String>,
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
        };
        let result = snapshot(&entry);
        inner.ids_by_key.insert(canonical_key, query_id.clone());
        inner.entries.insert(query_id, entry);
        Ok(result)
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

    pub fn close(&self, query_id: &str) -> Result<(), NoteDeckError> {
        let mut inner = self.lock()?;
        let Some(entry) = inner.entries.get_mut(query_id) else {
            return Ok(());
        };

        entry.subscriber_count = entry.subscriber_count.saturating_sub(1);
        entry.revision = entry.revision.saturating_add(1);
        if entry.subscriber_count > 0 {
            return Ok(());
        }

        let canonical_key = entry.canonical_key.clone();
        inner.entries.remove(query_id);
        inner.ids_by_key.remove(&canonical_key);
        Ok(())
    }

    pub fn snapshot(&self, query_id: &str) -> Result<Option<QuerySnapshot>, NoteDeckError> {
        let inner = self.lock()?;
        Ok(inner.entries.get(query_id).map(snapshot))
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, QueryRuntimeInner>, NoteDeckError> {
        self.inner
            .lock()
            .map_err(|_| runtime_error("query runtime lock poisoned"))
    }
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
    runtime: State<'_, QueryRuntime>,
    query_id: String,
    state: QueryRuntimeState,
) -> Result<QuerySnapshot, NoteDeckError> {
    runtime.set_runtime_state(&query_id, state)
}

#[tauri::command]
#[specta::specta]
pub async fn query_close(
    runtime: State<'_, QueryRuntime>,
    query_id: String,
) -> Result<(), NoteDeckError> {
    runtime.close(&query_id)
}

#[tauri::command]
#[specta::specta]
pub async fn query_get_snapshot(
    runtime: State<'_, QueryRuntime>,
    query_id: String,
) -> Result<Option<QuerySnapshot>, NoteDeckError> {
    runtime.snapshot(&query_id)
}

fn snapshot(entry: &QueryEntry) -> QuerySnapshot {
    QuerySnapshot {
        query_id: entry.query_id.clone(),
        key: entry.key.clone(),
        runtime_state: entry.runtime_state,
        subscriber_count: entry.subscriber_count,
        revision: entry.revision,
    }
}

fn canonicalize_key(key: &QueryKey) -> Result<String, NoteDeckError> {
    serde_json::to_string(key).map_err(|e| runtime_error(format!("invalid query key: {e}")))
}

fn runtime_error(message: impl Into<String>) -> NoteDeckError {
    NoteDeckError::InvalidInput(message.into())
}
