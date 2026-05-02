//! HEARTBEAT (#411) — AI が定期的に自律起動するためのスケジューラ。
//!
//! AI カラム単位で interval を持つ tokio::time::interval task を spawn し、
//! tick が来るたびにフロントへ `nd:ai-heartbeat-tick` event を emit する。
//!
//! - JS 側はカラム mount 時に `heartbeat_configure(column_id, interval_minutes)`
//!   を呼んで自分の column を登録する
//! - 設定が変わったら `heartbeat_configure` を再呼び出し (= replace)
//! - column unmount / heartbeat 無効化で `heartbeat_unconfigure(column_id)`
//! - Manual trigger は `heartbeat_trigger_now(column_id)`
//!
//! 実際のチェック内容 (cheap check / AI 呼び出し / 結果表示) は **すべて
//! フロント側** で行う。Rust はただの time-keeper。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{async_runtime::JoinHandle, Emitter, State};

use notecli::error::NoteDeckError;

use super::Result;

/// フロント (`useHeartbeatRunner`) が listen する event 名。
pub const HEARTBEAT_EVENT_NAME: &str = "nd:ai-heartbeat-tick";

/// 上限/下限。`useAiConfig.ts` の HEARTBEAT_INTERVAL_*_MINUTES と揃える。
const MIN_INTERVAL_MINUTES: u32 = 5;
const MAX_INTERVAL_MINUTES: u32 = 24 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HeartbeatTickPayload {
    pub column_id: String,
    /// Unix epoch ms。フロントの logging やデバッグ用。
    pub triggered_at_ms: i64,
    /// "scheduled" (interval 経由) or "manual" (trigger_now 経由)。
    pub source: String,
}

struct ScheduledTask {
    interval_minutes: u32,
    handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct HeartbeatScheduler {
    inner: Mutex<HashMap<String, ScheduledTask>>,
}

impl HeartbeatScheduler {
    pub fn new() -> Self {
        Self::default()
    }

    /// 既に登録済みでも (interval 変更時に) replace できるよう、いったん
    /// abort してから新規 spawn する。
    fn replace(
        &self,
        column_id: String,
        interval_minutes: u32,
        app: tauri::AppHandle,
    ) {
        let mut map = match self.inner.lock() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("[heartbeat] scheduler mutex poisoned: {e}");
                return;
            }
        };

        if let Some(prev) = map.remove(&column_id) {
            prev.handle.abort();
        }

        let column_id_for_task = column_id.clone();
        let app_for_task = app.clone();
        let handle = tauri::async_runtime::spawn(async move {
            let dur = Duration::from_secs(u64::from(interval_minutes) * 60);
            let mut ticker = tokio::time::interval(dur);
            // 初回 tick は drop (起動直後の意図しない発火を避ける)
            ticker.tick().await;
            loop {
                ticker.tick().await;
                emit_tick(&app_for_task, &column_id_for_task, "scheduled");
            }
        });

        map.insert(
            column_id,
            ScheduledTask {
                interval_minutes,
                handle,
            },
        );
    }

    fn unregister(&self, column_id: &str) {
        let mut map = match self.inner.lock() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("[heartbeat] scheduler mutex poisoned: {e}");
                return;
            }
        };
        if let Some(prev) = map.remove(column_id) {
            prev.handle.abort();
        }
    }

    fn current_interval(&self, column_id: &str) -> Option<u32> {
        self.inner
            .lock()
            .ok()
            .and_then(|map| map.get(column_id).map(|t| t.interval_minutes))
    }
}

fn current_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn emit_tick(app: &tauri::AppHandle, column_id: &str, source: &str) {
    let payload = HeartbeatTickPayload {
        column_id: column_id.to_string(),
        triggered_at_ms: current_unix_ms(),
        source: source.to_string(),
    };
    if let Err(e) = app.emit(HEARTBEAT_EVENT_NAME, payload) {
        eprintln!("[heartbeat] failed to emit tick for {column_id}: {e}");
    }
}

fn validate_column_id(column_id: &str) -> Result<()> {
    let trimmed = column_id.trim();
    if trimmed.is_empty() {
        return Err(NoteDeckError::InvalidInput(
            "column_id is empty".into(),
        ));
    }
    Ok(())
}

fn clamp_interval(minutes: u32) -> u32 {
    minutes.clamp(MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES)
}

/// 指定 column の heartbeat を登録 / 更新する。既存があれば interval を
/// 上書きする。同じ interval が既に動いていたとしても abort + 再 spawn
/// するので、JS 側の reactive watch から idempotent に呼んで OK。
#[tauri::command]
#[specta::specta]
pub async fn heartbeat_configure(
    app: tauri::AppHandle,
    scheduler: State<'_, Arc<HeartbeatScheduler>>,
    column_id: String,
    interval_minutes: u32,
) -> Result<()> {
    validate_column_id(&column_id)?;
    let interval = clamp_interval(interval_minutes);
    scheduler.replace(column_id, interval, app);
    Ok(())
}

/// 指定 column の heartbeat を停止する。未登録なら no-op。
#[tauri::command]
#[specta::specta]
pub async fn heartbeat_unconfigure(
    scheduler: State<'_, Arc<HeartbeatScheduler>>,
    column_id: String,
) -> Result<()> {
    validate_column_id(&column_id)?;
    scheduler.unregister(&column_id);
    Ok(())
}

/// 即座に 1 回だけ tick を emit する。デバッグ用 + ヘッダの「💓 今すぐ実行」
/// ボタンから呼ばれる。scheduler の interval state は変更しない。
#[tauri::command]
#[specta::specta]
pub async fn heartbeat_trigger_now(
    app: tauri::AppHandle,
    column_id: String,
) -> Result<()> {
    validate_column_id(&column_id)?;
    emit_tick(&app, &column_id, "manual");
    Ok(())
}

/// 現在 scheduler に登録されているかどうかを返す (デバッグ / UI ヘルパ)。
#[tauri::command]
#[specta::specta]
pub async fn heartbeat_status(
    scheduler: State<'_, Arc<HeartbeatScheduler>>,
    column_id: String,
) -> Result<Option<u32>> {
    Ok(scheduler.current_interval(&column_id))
}
