use notecli::error::NoteDeckError;
use tauri::Manager;

use super::Result;

#[tauri::command]
pub fn get_cli_commands() -> Vec<notecli::cli::CliCommandInfo> {
    notecli::cli::command_metadata()
}

#[tauri::command]
pub fn get_notecli_version() -> String {
    option_env!("NOTECLI_GIT_HASH")
        .unwrap_or("unknown")
        .to_string()
}

#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

/// Export notecli.db to a user-chosen location via save dialog.
#[tauri::command]
pub async fn export_db(app: tauri::AppHandle) -> Result<bool> {
    use tauri_plugin_dialog::DialogExt;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    let db_path = app_dir.join("notecli.db");
    if !db_path.exists() {
        return Err(NoteDeckError::InvalidInput(
            "notecli.db not found".to_string(),
        ));
    }

    let dest = app
        .dialog()
        .file()
        .set_file_name("notecli.db")
        .add_filter("SQLite Database", &["db"])
        .blocking_save_file();

    let Some(dest) = dest else {
        return Ok(false); // user cancelled
    };

    let dest_path = dest
        .as_path()
        .ok_or_else(|| NoteDeckError::InvalidInput("Invalid destination path".to_string()))?;
    std::fs::copy(&db_path, dest_path)
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    Ok(true)
}

/// Import notecli.db from a user-chosen file via open dialog.
/// Replaces the current database file. Caller should relaunch the app afterwards
/// so that Rust re-opens the new DB with a fresh connection.
#[tauri::command]
pub async fn import_db(app: tauri::AppHandle) -> Result<bool> {
    use tauri_plugin_dialog::DialogExt;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    let db_path = app_dir.join("notecli.db");

    let src = app
        .dialog()
        .file()
        .add_filter("SQLite Database", &["db"])
        .blocking_pick_file();

    let Some(src) = src else {
        return Ok(false); // user cancelled
    };

    let src_path = src
        .as_path()
        .ok_or_else(|| NoteDeckError::InvalidInput("Invalid source path".to_string()))?;

    // Basic SQLite validation: check magic bytes
    let header = std::fs::read(src_path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to read file: {e}")))?;
    if header.len() < 16 || &header[..16] != b"SQLite format 3\0" {
        return Err(NoteDeckError::InvalidInput(
            "Not a valid SQLite database file".to_string(),
        ));
    }

    std::fs::copy(src_path, &db_path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to import database: {e}")))?;

    // Remove WAL/SHM files so the new DB starts clean after relaunch
    let _ = std::fs::remove_file(app_dir.join("notecli.db-wal"));
    let _ = std::fs::remove_file(app_dir.join("notecli.db-shm"));

    Ok(true)
}
