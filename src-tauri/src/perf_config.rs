use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Performance configuration shared across the application.
/// All fields are dynamically updatable at runtime via Tauri commands.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    pub memory_cache_max_total: usize,
    pub memory_cache_max_item: usize,
    pub max_concurrent_fetches: usize,
    pub rust_ogp_cache_max: usize,
    pub max_requests_per_window: usize,
    pub circuit_breaker_threshold: u32,
}

impl Default for PerformanceConfig {
    fn default() -> Self {
        Self {
            memory_cache_max_total: 4 * 1024 * 1024, // 4MB
            memory_cache_max_item: 64 * 1024,         // 64KB
            max_concurrent_fetches: 30,
            rust_ogp_cache_max: 64,
            max_requests_per_window: 200,
            circuit_breaker_threshold: 5,
        }
    }
}

pub type SharedPerfConfig = Arc<RwLock<PerformanceConfig>>;

/// Tauri command: update performance config at runtime.
#[tauri::command]
pub async fn update_performance_config(
    config: PerformanceConfig,
    state: tauri::State<'_, SharedPerfConfig>,
) -> Result<(), String> {
    let mut current = state.write().await;
    *current = config;
    Ok(())
}

/// Tauri command: get current performance config.
#[tauri::command]
pub async fn get_performance_config(
    state: tauri::State<'_, SharedPerfConfig>,
) -> Result<PerformanceConfig, String> {
    Ok(state.read().await.clone())
}
