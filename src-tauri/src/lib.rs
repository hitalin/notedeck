use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

mod api;
mod commands;
mod db;
mod error;
mod models;
mod streaming;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            commands::load_accounts,
            commands::upsert_account,
            commands::delete_account,
            commands::load_servers,
            commands::get_server,
            commands::upsert_server,
            commands::api_get_timeline,
            commands::api_get_note,
            commands::api_create_note,
            commands::api_create_reaction,
            commands::api_delete_reaction,
            commands::api_get_user,
            commands::api_get_user_detail,
            commands::api_get_user_notes,
            commands::api_get_server_emojis,
            commands::api_get_notifications,
            commands::api_search_notes,
            commands::api_fetch_account_theme,
            commands::auth_start,
            commands::auth_complete,
            commands::auth_verify_token,
            commands::stream_connect,
            commands::stream_disconnect,
            commands::stream_subscribe_timeline,
            commands::stream_subscribe_main,
            commands::stream_unsubscribe,
        ])
        .setup(|app| {
            // Initialize SQLite database
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("notedeck.db");
            let database = db::Database::open(&db_path)?;
            app.manage(database);

            // Initialize Misskey HTTP client
            app.manage(api::MisskeyClient::new()?);

            // Initialize streaming manager
            app.manage(streaming::StreamingManager::new());

            // System tray
            let show_i = MenuItem::with_id(app, "show", "Show NoteDeck", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon = app.default_window_icon()
                .ok_or("Default window icon not found")?
                .clone();

            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("NoteDeck")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())?;

    Ok(())
}
