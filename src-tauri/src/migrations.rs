//! Data migrations for breaking changes.
//!
//! Each migration checks its precondition and is idempotent — safe to re-run.
//! Add new migrations at the bottom of `run_all()`.

use std::fs;
use std::path::Path;

/// Run all migrations in order. Called once during app setup.
pub fn run_all(app_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    rename_db(app_dir)?;
    move_settings_to_subdir(app_dir)?;
    Ok(())
}

/// v0.5 → v0.6: Rename `notedeck.db` → `notecli.db`.
fn rename_db(app_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let old = app_dir.join("notedeck.db");
    let new = app_dir.join("notecli.db");
    if old.exists() && !new.exists() {
        fs::rename(&old, &new)?;
    }
    Ok(())
}

/// v0.7 → v0.8: Move settings files into `notedeck/` subdirectory.
fn move_settings_to_subdir(app_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let settings_dir = app_dir.join("notedeck");
    if settings_dir.exists() {
        return Ok(());
    }
    // Check if there are any legacy files to migrate
    let dirs = ["profiles", "themes", "plugins"];
    let files = ["custom.css", "keybinds.json5"];
    let has_legacy = dirs.iter().any(|d| app_dir.join(d).exists())
        || files.iter().any(|f| app_dir.join(f).exists());
    if !has_legacy {
        return Ok(());
    }

    fs::create_dir_all(&settings_dir)?;
    for name in &dirs {
        let old = app_dir.join(name);
        if old.exists() {
            fs::rename(&old, settings_dir.join(name))?;
        }
    }
    for name in &files {
        let old = app_dir.join(name);
        if old.exists() {
            fs::rename(&old, settings_dir.join(name))?;
        }
    }
    Ok(())
}
