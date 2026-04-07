use tauri::State;

use notecli::keychain;
use notecli::models::{Account, AccountPublic, StoredServer};

use super::{export_account_list, invalidate_credentials, validate_host, AppState, Result};

// --- DB: Accounts ---

#[tauri::command]
#[specta::specta]
pub async fn load_accounts(app_state: State<'_, AppState>) -> Result<Vec<AccountPublic>> {
    let db = app_state.db().await;
    let accounts = db.load_accounts()?;
    Ok(accounts
        .iter()
        .map(|a| {
            let has_token =
                !a.token.is_empty() || keychain::get_token(&a.id).ok().flatten().is_some();
            AccountPublic::new(a, has_token)
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_account(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let db = app_state.db().await;
    invalidate_credentials(&id);
    let _ = keychain::delete_token(&id);
    db.delete_account(&id)?;
    export_account_list(&app, &db);
    Ok(())
}

/// Logout: delete token only, keep account record and columns
#[tauri::command]
#[specta::specta]
pub async fn logout_account(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let db = app_state.db().await;
    invalidate_credentials(&id);
    let _ = keychain::delete_token(&id);
    db.clear_token(&id)?;
    export_account_list(&app, &db);
    Ok(())
}

// --- Cache management ---

#[derive(serde::Serialize, specta::Type)]
pub struct CacheStats {
    pub note_count: i64,
    pub db_size_bytes: i64,
}

#[tauri::command]
#[specta::specta]
pub async fn cache_stats(app_state: State<'_, AppState>) -> Result<CacheStats> {
    let db = app_state.db().await;
    let (note_count, db_size_bytes) = db.cache_stats()?;
    Ok(CacheStats {
        note_count,
        db_size_bytes,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn account_cache_count(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<i64> {
    let db = app_state.db().await;
    db.account_cache_count(&account_id)
}

#[tauri::command]
#[specta::specta]
pub async fn clear_account_cache(
    app_state: State<'_, AppState>,
    account_id: String,
) -> Result<u64> {
    let db = app_state.db().await;
    db.clear_account_cache(&account_id)
}

#[tauri::command]
#[specta::specta]
pub async fn clear_all_cache(app_state: State<'_, AppState>) -> Result<u64> {
    let db = app_state.db().await;
    let notes = db.clear_all_notes_cache()?;
    let _ogp = db.clear_ogp_cache()?;
    Ok(notes)
}

// --- Guest / Anonymous API ---

/// Create a guest (unauthenticated) account for browsing public timelines.
#[tauri::command]
#[specta::specta]
pub async fn create_guest_account(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    host: String,
    software: String,
) -> Result<AccountPublic> {
    let db = app_state.db().await;
    let host = validate_host(&host)?;
    let id = uuid::Uuid::new_v4().to_string();
    let username = format!("guest_{}", &id[..8]);
    // Count existing guest accounts to assign a sequential display name
    let guest_count = db
        .load_accounts()
        .unwrap_or_default()
        .iter()
        .filter(|a| a.user_id == "__guest__")
        .count();
    let display_name = Some(format!("ゲスト{}", guest_count + 1));
    let account = Account {
        id,
        host,
        token: String::new(),
        user_id: "__guest__".to_string(),
        username,
        display_name,
        avatar_url: None,
        software,
    };
    db.upsert_account(&account)?;
    export_account_list(&app, &db);
    Ok(AccountPublic::new(&account, false))
}

// --- DB: Servers ---

#[tauri::command]
#[specta::specta]
pub async fn load_servers(app_state: State<'_, AppState>) -> Result<Vec<StoredServer>> {
    let db = app_state.db().await;
    db.load_servers()
}

#[tauri::command]
#[specta::specta]
pub async fn get_server(app_state: State<'_, AppState>, host: String) -> Result<Option<StoredServer>> {
    let db = app_state.db().await;
    db.get_server(&host)
}

#[tauri::command]
#[specta::specta]
pub async fn upsert_server(app_state: State<'_, AppState>, server: StoredServer) -> Result<()> {
    let db = app_state.db().await;
    db.upsert_server(&server)
}
