use notecli::error::NoteDeckError;
use tauri::Manager;

use super::Result;

#[tauri::command]
pub fn get_cli_commands() -> Vec<notecli::cli::CliCommandInfo> {
    notecli::cli::command_metadata()
}

#[tauri::command]
pub fn get_openapi_spec() -> serde_json::Value {
    serde_json::to_value(crate::http_server::openapi_spec()).unwrap_or_default()
}

#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

/// Validate that a file has a valid SQLite header.
fn validate_sqlite_file(path: &std::path::Path) -> Result<()> {
    let header = std::fs::read(path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to read file: {e}")))?;
    if header.len() < 16 || &header[..16] != b"SQLite format 3\0" {
        return Err(NoteDeckError::InvalidInput(
            "Not a valid SQLite database file".to_string(),
        ));
    }
    Ok(())
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

    validate_sqlite_file(src_path)?;

    std::fs::copy(src_path, &db_path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to import database: {e}")))?;

    // Remove WAL/SHM files so the new DB starts clean after relaunch
    let _ = std::fs::remove_file(app_dir.join("notecli.db-wal"));
    let _ = std::fs::remove_file(app_dir.join("notecli.db-shm"));

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_sqlite_valid() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");
        // Write valid SQLite header + padding
        let mut data = b"SQLite format 3\0".to_vec();
        data.resize(100, 0);
        std::fs::write(&path, &data).unwrap();
        assert!(validate_sqlite_file(&path).is_ok());
    }

    #[test]
    fn validate_sqlite_invalid_header() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("not-a-db.txt");
        std::fs::write(&path, "this is not a database").unwrap();
        assert!(validate_sqlite_file(&path).is_err());
    }

    #[test]
    fn validate_sqlite_too_small() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tiny.db");
        std::fs::write(&path, "small").unwrap();
        assert!(validate_sqlite_file(&path).is_err());
    }

    #[test]
    fn validate_sqlite_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty.db");
        std::fs::write(&path, "").unwrap();
        assert!(validate_sqlite_file(&path).is_err());
    }
}
