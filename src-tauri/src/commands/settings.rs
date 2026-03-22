use std::fs;
use std::path::PathBuf;

use notecli::error::NoteDeckError;
use tauri::Manager;

use super::Result;

/// Allowed subdirectory names for settings files.
const ALLOWED_SUBDIRS: &[&str] = &["profiles", "themes", "plugins"];

/// Validate a subdirectory name against the whitelist.
fn validate_subdir(subdir: &str) -> Result<()> {
    if !ALLOWED_SUBDIRS.contains(&subdir) {
        return Err(NoteDeckError::InvalidInput(format!(
            "Invalid subdirectory: {subdir}. Allowed: {}",
            ALLOWED_SUBDIRS.join(", ")
        )));
    }
    Ok(())
}

/// Validate a filename to prevent path traversal.
fn validate_filename(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(NoteDeckError::InvalidInput(
            "Filename must not be empty".to_string(),
        ));
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(NoteDeckError::InvalidInput(format!(
            "Invalid filename: {name}"
        )));
    }
    // Reject Windows reserved characters
    if name.chars().any(|c| "<>:\"|?*".contains(c)) {
        return Err(NoteDeckError::InvalidInput(format!(
            "Filename contains reserved characters: {name}"
        )));
    }
    if name.len() > 128 {
        return Err(NoteDeckError::InvalidInput(
            "Filename too long (max 128 chars)".to_string(),
        ));
    }
    Ok(())
}

/// Resolve the full path for a settings file.
fn resolve_path(app: &tauri::AppHandle, subdir: &str, name: &str) -> Result<PathBuf> {
    validate_subdir(subdir)?;
    validate_filename(name)?;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    Ok(app_dir.join(subdir).join(name))
}

/// List files in a settings subdirectory.
#[tauri::command]
pub fn list_settings_files(app: tauri::AppHandle, subdir: &str) -> Result<Vec<String>> {
    validate_subdir(subdir)?;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    let dir = app_dir.join(subdir);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut names = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    for entry in entries {
        let entry = entry.map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
        if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Read a settings file as a UTF-8 string.
#[tauri::command]
pub fn read_settings_file(app: tauri::AppHandle, subdir: &str, name: &str) -> Result<String> {
    let path = resolve_path(&app, subdir, name)?;
    fs::read_to_string(&path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to read {}: {e}", path.display())))
}

/// Write a settings file (creates parent directories if needed).
#[tauri::command]
pub fn write_settings_file(
    app: tauri::AppHandle,
    subdir: &str,
    name: &str,
    content: &str,
) -> Result<()> {
    let path = resolve_path(&app, subdir, name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            NoteDeckError::InvalidInput(format!(
                "Failed to create directory {}: {e}",
                parent.display()
            ))
        })?;
    }
    fs::write(&path, content).map_err(|e| {
        NoteDeckError::InvalidInput(format!("Failed to write {}: {e}", path.display()))
    })
}

/// Delete a settings file.
#[tauri::command]
pub fn delete_settings_file(app: tauri::AppHandle, subdir: &str, name: &str) -> Result<()> {
    let path = resolve_path(&app, subdir, name)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| {
            NoteDeckError::InvalidInput(format!("Failed to delete {}: {e}", path.display()))
        })?;
    }
    Ok(())
}

/// Rename a settings file within the same subdirectory.
#[tauri::command]
pub fn rename_settings_file(
    app: tauri::AppHandle,
    subdir: &str,
    old_name: &str,
    new_name: &str,
) -> Result<()> {
    let old_path = resolve_path(&app, subdir, old_name)?;
    let new_path = resolve_path(&app, subdir, new_name)?;
    if !old_path.exists() {
        return Err(NoteDeckError::InvalidInput(format!(
            "File not found: {}",
            old_path.display()
        )));
    }
    if new_path.exists() {
        return Err(NoteDeckError::InvalidInput(format!(
            "File already exists: {}",
            new_path.display()
        )));
    }
    fs::rename(&old_path, &new_path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to rename: {e}")))
}

/// Allowed root-level filenames (no subdirectory).
const ALLOWED_ROOT_FILES: &[&str] = &["custom.css", "keybinds.json5"];

/// Resolve the full path for a root-level settings file (no subdirectory).
fn resolve_root_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf> {
    if !ALLOWED_ROOT_FILES.contains(&name) {
        return Err(NoteDeckError::InvalidInput(format!(
            "Invalid root file: {name}. Allowed: {}",
            ALLOWED_ROOT_FILES.join(", ")
        )));
    }
    validate_filename(name)?;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    Ok(app_dir.join(name))
}

/// Read a root-level settings file as a UTF-8 string.
#[tauri::command]
pub fn read_root_settings_file(app: tauri::AppHandle, name: &str) -> Result<String> {
    let path = resolve_root_path(&app, name)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to read {}: {e}", path.display())))
}

/// Write a root-level settings file.
#[tauri::command]
pub fn write_root_settings_file(app: tauri::AppHandle, name: &str, content: &str) -> Result<()> {
    let path = resolve_root_path(&app, name)?;
    fs::write(&path, content).map_err(|e| {
        NoteDeckError::InvalidInput(format!("Failed to write {}: {e}", path.display()))
    })
}

/// Get the app data directory path (so users can open it in file manager).
#[tauri::command]
pub fn get_settings_dir(app: tauri::AppHandle) -> Result<String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
    Ok(app_dir.to_string_lossy().to_string())
}
