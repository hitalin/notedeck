use std::sync::Arc;

use tauri::State;

use notecli::db::Database;
use notecli::keychain;
use notecli::models::{Account, AccountPublic, StoredServer};

use super::{export_account_list, invalidate_credentials, validate_host, Result};

// --- DB: Accounts ---

#[tauri::command]
pub fn load_accounts(db: State<'_, Arc<Database>>) -> Result<Vec<AccountPublic>> {
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
pub fn delete_account(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<()> {
    invalidate_credentials(&id);
    let _ = keychain::delete_token(&id);
    db.delete_account(&id)?;
    export_account_list(&app, &db);
    Ok(())
}

/// Logout: delete token only, keep account record and columns
#[tauri::command]
pub fn logout_account(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<()> {
    invalidate_credentials(&id);
    let _ = keychain::delete_token(&id);
    db.clear_token(&id)?;
    export_account_list(&app, &db);
    Ok(())
}

// --- Guest / Anonymous API ---

/// Create a guest (unauthenticated) account for browsing public timelines.
#[tauri::command]
pub async fn create_guest_account(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    host: String,
    software: String,
) -> Result<AccountPublic> {
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
pub fn load_servers(db: State<'_, Arc<Database>>) -> Result<Vec<StoredServer>> {
    db.load_servers()
}

#[tauri::command]
pub fn get_server(db: State<'_, Arc<Database>>, host: String) -> Result<Option<StoredServer>> {
    db.get_server(&host)
}

#[tauri::command]
pub fn upsert_server(db: State<'_, Arc<Database>>, server: StoredServer) -> Result<()> {
    db.upsert_server(&server)
}
