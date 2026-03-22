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

/// Directories and root files to include in settings backup.
const BACKUP_SUBDIRS: &[&str] = &["profiles", "themes", "plugins"];

/// Export all settings files to a zip archive via save dialog.
#[tauri::command]
pub async fn export_settings_zip(app: tauri::AppHandle) -> Result<bool> {
    use tauri_plugin_dialog::DialogExt;
    use zip::write::SimpleFileOptions;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;

    let dest = app
        .dialog()
        .file()
        .set_file_name("notedeck-settings.zip")
        .add_filter("Zip Archive", &["zip"])
        .blocking_save_file();

    let Some(dest) = dest else {
        return Ok(false); // user cancelled
    };

    let dest_path = dest
        .as_path()
        .ok_or_else(|| NoteDeckError::InvalidInput("Invalid destination path".to_string()))?;

    let file = fs::File::create(dest_path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to create zip: {e}")))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Add subdirectory files (profiles/, themes/, plugins/)
    for subdir in BACKUP_SUBDIRS {
        let dir = app_dir.join(subdir);
        if !dir.exists() {
            continue;
        }
        let entries = fs::read_dir(&dir)
            .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
        for entry in entries {
            let entry = entry.map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
            if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                continue;
            }
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            let zip_path = format!("{subdir}/{name_str}");
            let content = fs::read(entry.path())
                .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
            zip.start_file(&zip_path, options)
                .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
            std::io::Write::write_all(&mut zip, &content)
                .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
        }
    }

    // Add root-level settings files
    for root_file in ALLOWED_ROOT_FILES {
        let path = app_dir.join(root_file);
        if path.exists() {
            let content = fs::read(&path)
                .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
            zip.start_file(*root_file, options)
                .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
            std::io::Write::write_all(&mut zip, &content)
                .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
        }
    }

    zip.finish()
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to finalize zip: {e}")))?;

    Ok(true)
}

/// Import settings from a zip archive via open dialog.
#[tauri::command]
pub async fn import_settings_zip(app: tauri::AppHandle) -> Result<bool> {
    use tauri_plugin_dialog::DialogExt;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;

    let src = app
        .dialog()
        .file()
        .add_filter("Zip Archive", &["zip"])
        .blocking_pick_file();

    let Some(src) = src else {
        return Ok(false); // user cancelled
    };

    let src_path = src
        .as_path()
        .ok_or_else(|| NoteDeckError::InvalidInput("Invalid source path".to_string()))?;

    let file = fs::File::open(src_path)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to open zip: {e}")))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| NoteDeckError::InvalidInput(format!("Invalid zip file: {e}")))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;

        if entry.is_dir() {
            continue;
        }

        let entry_name = entry.name().to_string();

        // Path traversal prevention
        if entry_name.contains("..") || entry_name.starts_with('/') || entry_name.starts_with('\\') {
            tracing::warn!("Skipping suspicious zip entry: {entry_name}");
            continue;
        }

        // Validate: must be in allowed subdirs or allowed root files
        let allowed = BACKUP_SUBDIRS.iter().any(|d| entry_name.starts_with(&format!("{d}/")))
            || ALLOWED_ROOT_FILES.contains(&entry_name.as_str());
        if !allowed {
            tracing::warn!("Skipping unknown zip entry: {entry_name}");
            continue;
        }

        let dest_path = app_dir.join(&entry_name);

        // Ensure parent directory exists
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
        }

        let mut content = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut content)
            .map_err(|e| NoteDeckError::InvalidInput(e.to_string()))?;
        fs::write(&dest_path, &content)
            .map_err(|e| NoteDeckError::InvalidInput(format!("Failed to write {entry_name}: {e}")))?;
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn validate_subdir_allowed() {
        assert!(validate_subdir("profiles").is_ok());
        assert!(validate_subdir("themes").is_ok());
        assert!(validate_subdir("plugins").is_ok());
    }

    #[test]
    fn validate_subdir_rejected() {
        assert!(validate_subdir("").is_err());
        assert!(validate_subdir("secrets").is_err());
        assert!(validate_subdir("../etc").is_err());
    }

    #[test]
    fn validate_filename_ok() {
        assert!(validate_filename("test.json5").is_ok());
        assert!(validate_filename("my-theme.ndtheme.json5").is_ok());
        assert!(validate_filename("plugin.is").is_ok());
    }

    #[test]
    fn validate_filename_path_traversal() {
        assert!(validate_filename("..").is_err());
        assert!(validate_filename("../secret").is_err());
        assert!(validate_filename("foo/bar").is_err());
        assert!(validate_filename("foo\\bar").is_err());
    }

    #[test]
    fn validate_filename_reserved_chars() {
        assert!(validate_filename("file<name").is_err());
        assert!(validate_filename("file>name").is_err());
        assert!(validate_filename("file:name").is_err());
        assert!(validate_filename("file\"name").is_err());
        assert!(validate_filename("file|name").is_err());
        assert!(validate_filename("file?name").is_err());
        assert!(validate_filename("file*name").is_err());
    }

    #[test]
    fn validate_filename_empty() {
        assert!(validate_filename("").is_err());
    }

    #[test]
    fn validate_filename_too_long() {
        let long = "a".repeat(129);
        assert!(validate_filename(&long).is_err());
        let ok = "a".repeat(128);
        assert!(validate_filename(&ok).is_ok());
    }

    #[test]
    fn zip_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path();

        // Create test settings structure
        let profiles_dir = base.join("profiles");
        fs::create_dir_all(&profiles_dir).unwrap();
        fs::write(profiles_dir.join("test.ndprofile.json5"), r#"{ name: "test" }"#).unwrap();

        let themes_dir = base.join("themes");
        fs::create_dir_all(&themes_dir).unwrap();
        fs::write(themes_dir.join("dark.ndtheme.json5"), r#"{ name: "dark" }"#).unwrap();

        fs::write(base.join("custom.css"), "body { color: red; }").unwrap();
        fs::write(base.join("keybinds.json5"), r#"{ "search": [] }"#).unwrap();

        // Export to zip
        let zip_path = base.join("backup.zip");
        {
            let file = fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();

            for subdir in BACKUP_SUBDIRS {
                let d = base.join(subdir);
                if !d.exists() {
                    continue;
                }
                for entry in fs::read_dir(&d).unwrap() {
                    let entry = entry.unwrap();
                    if entry.file_type().unwrap().is_file() {
                        let name = entry.file_name();
                        let zip_path_str = format!("{subdir}/{}", name.to_string_lossy());
                        let content = fs::read(entry.path()).unwrap();
                        zip.start_file(&zip_path_str, options).unwrap();
                        zip.write_all(&content).unwrap();
                    }
                }
            }
            for root_file in ALLOWED_ROOT_FILES {
                let p = base.join(root_file);
                if p.exists() {
                    let content = fs::read(&p).unwrap();
                    zip.start_file(*root_file, options).unwrap();
                    zip.write_all(&content).unwrap();
                }
            }
            zip.finish().unwrap();
        }

        // Clear original files
        fs::remove_dir_all(&profiles_dir).unwrap();
        fs::remove_dir_all(&themes_dir).unwrap();
        fs::remove_file(base.join("custom.css")).unwrap();
        fs::remove_file(base.join("keybinds.json5")).unwrap();

        // Import from zip (same logic as import_settings_zip)
        {
            let file = fs::File::open(&zip_path).unwrap();
            let mut archive = zip::ZipArchive::new(file).unwrap();
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).unwrap();
                if entry.is_dir() {
                    continue;
                }
                let entry_name = entry.name().to_string();
                if entry_name.contains("..")
                    || entry_name.starts_with('/')
                    || entry_name.starts_with('\\')
                {
                    continue;
                }
                let allowed = BACKUP_SUBDIRS
                    .iter()
                    .any(|d| entry_name.starts_with(&format!("{d}/")))
                    || ALLOWED_ROOT_FILES.contains(&entry_name.as_str());
                if !allowed {
                    continue;
                }
                let dest = base.join(&entry_name);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).unwrap();
                }
                let mut content = Vec::new();
                std::io::Read::read_to_end(&mut entry, &mut content).unwrap();
                fs::write(&dest, &content).unwrap();
            }
        }

        // Verify restored files
        assert_eq!(
            fs::read_to_string(profiles_dir.join("test.ndprofile.json5")).unwrap(),
            r#"{ name: "test" }"#
        );
        assert_eq!(
            fs::read_to_string(themes_dir.join("dark.ndtheme.json5")).unwrap(),
            r#"{ name: "dark" }"#
        );
        assert_eq!(
            fs::read_to_string(base.join("custom.css")).unwrap(),
            "body { color: red; }"
        );
        assert_eq!(
            fs::read_to_string(base.join("keybinds.json5")).unwrap(),
            r#"{ "search": [] }"#
        );
    }

    #[test]
    fn zip_import_rejects_path_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("evil.zip");

        {
            let file = fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("../../../etc/passwd", options).unwrap();
            zip.write_all(b"evil").unwrap();
            zip.start_file("profiles/good.json5", options).unwrap();
            zip.write_all(b"ok").unwrap();
            zip.finish().unwrap();
        }

        let base = dir.path().join("app");
        fs::create_dir_all(&base).unwrap();
        {
            let file = fs::File::open(&zip_path).unwrap();
            let mut archive = zip::ZipArchive::new(file).unwrap();
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).unwrap();
                if entry.is_dir() {
                    continue;
                }
                let entry_name = entry.name().to_string();
                if entry_name.contains("..")
                    || entry_name.starts_with('/')
                    || entry_name.starts_with('\\')
                {
                    continue;
                }
                let allowed = BACKUP_SUBDIRS
                    .iter()
                    .any(|d| entry_name.starts_with(&format!("{d}/")))
                    || ALLOWED_ROOT_FILES.contains(&entry_name.as_str());
                if !allowed {
                    continue;
                }
                let dest = base.join(&entry_name);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).unwrap();
                }
                let mut content = Vec::new();
                std::io::Read::read_to_end(&mut entry, &mut content).unwrap();
                fs::write(&dest, &content).unwrap();
            }
        }

        assert!(!dir.path().join("etc/passwd").exists());
        assert_eq!(
            fs::read_to_string(base.join("profiles/good.json5")).unwrap(),
            "ok"
        );
    }

    #[test]
    fn zip_import_rejects_unknown_entries() {
        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("mixed.zip");

        {
            let file = fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("custom.css", options).unwrap();
            zip.write_all(b"body{}").unwrap();
            zip.start_file("secret.txt", options).unwrap();
            zip.write_all(b"secret").unwrap();
            zip.start_file("config/bad.json", options).unwrap();
            zip.write_all(b"bad").unwrap();
            zip.finish().unwrap();
        }

        let base = dir.path().join("app");
        fs::create_dir_all(&base).unwrap();
        {
            let file = fs::File::open(&zip_path).unwrap();
            let mut archive = zip::ZipArchive::new(file).unwrap();
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).unwrap();
                if entry.is_dir() {
                    continue;
                }
                let entry_name = entry.name().to_string();
                if entry_name.contains("..")
                    || entry_name.starts_with('/')
                    || entry_name.starts_with('\\')
                {
                    continue;
                }
                let allowed = BACKUP_SUBDIRS
                    .iter()
                    .any(|d| entry_name.starts_with(&format!("{d}/")))
                    || ALLOWED_ROOT_FILES.contains(&entry_name.as_str());
                if !allowed {
                    continue;
                }
                let dest = base.join(&entry_name);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).unwrap();
                }
                let mut content = Vec::new();
                std::io::Read::read_to_end(&mut entry, &mut content).unwrap();
                fs::write(&dest, &content).unwrap();
            }
        }

        assert!(base.join("custom.css").exists());
        assert!(!base.join("secret.txt").exists());
        assert!(!base.join("config/bad.json").exists());
    }
}
