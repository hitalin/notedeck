use tauri::State;

use crate::db::Database;
use crate::models::{Account, StoredServer};

type Result<T> = std::result::Result<T, String>;

fn map_err(e: rusqlite::Error) -> String {
    e.to_string()
}

// --- Accounts ---

#[tauri::command]
pub fn load_accounts(db: State<'_, Database>) -> Result<Vec<Account>> {
    db.load_accounts().map_err(map_err)
}

#[tauri::command]
pub fn upsert_account(db: State<'_, Database>, account: Account) -> Result<()> {
    db.upsert_account(&account).map_err(map_err)
}

#[tauri::command]
pub fn delete_account(db: State<'_, Database>, id: String) -> Result<()> {
    db.delete_account(&id).map_err(map_err)
}

// --- Servers ---

#[tauri::command]
pub fn load_servers(db: State<'_, Database>) -> Result<Vec<StoredServer>> {
    db.load_servers().map_err(map_err)
}

#[tauri::command]
pub fn get_server(db: State<'_, Database>, host: String) -> Result<Option<StoredServer>> {
    db.get_server(&host).map_err(map_err)
}

#[tauri::command]
pub fn upsert_server(db: State<'_, Database>, server: StoredServer) -> Result<()> {
    db.upsert_server(&server).map_err(map_err)
}
