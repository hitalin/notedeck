use tauri::Manager;
#[cfg(not(mobile))]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
};
#[cfg(not(mobile))]
use tauri_plugin_autostart::MacosLauncher;
#[cfg(not(mobile))]
use tauri_plugin_global_shortcut::GlobalShortcutExt;

mod commands;
#[cfg(target_os = "windows")]
mod hwheel_hook;
mod http_server;
mod image_cache;
mod ogp;
mod query_bridge;
mod streaming;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = run_inner() {
        eprintln!("Application error: {e}");
        std::process::exit(1);
    }
}

fn run_inner() -> Result<(), Box<dyn std::error::Error>> {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_haptics::init());

    #[cfg(not(mobile))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                Some(vec!["--minimized"]),
            ));
    }

    builder = builder.invoke_handler(tauri::generate_handler![
        commands::load_accounts,
        commands::delete_account,
        commands::load_servers,
        commands::get_server,
        commands::upsert_server,
        commands::api_get_endpoints,
        commands::api_get_endpoint_params,
        commands::api_get_user_policies,
        commands::api_update_user_setting,
        commands::api_get_timeline,
        commands::api_get_timeline_enriched,
        commands::api_get_user_lists,
        commands::api_get_antennas,
        commands::api_get_antenna_notes,
        commands::api_get_favorites,
        commands::api_get_featured_notes,
        commands::api_get_mentions,
        commands::api_get_clips,
        commands::api_get_clip_notes,
        commands::api_get_channels,
        commands::api_get_channel_notes,
        commands::api_get_note,
        commands::api_create_note,
        commands::api_create_reaction,
        commands::api_delete_reaction,
        commands::api_get_note_reactions,
        commands::api_update_note,
        commands::api_upload_file,
        commands::api_upload_file_from_path,
        commands::api_create_favorite,
        commands::api_delete_favorite,
        commands::api_delete_note,
        commands::api_follow_user,
        commands::api_unfollow_user,
        commands::api_accept_follow_request,
        commands::api_reject_follow_request,
        commands::api_get_user,
        commands::api_get_user_detail,
        commands::api_get_user_notes,
        commands::api_get_server_emojis,
        commands::api_get_pinned_reactions,
        commands::api_get_notifications,
        commands::api_search_notes,
        commands::api_get_note_children,
        commands::api_get_note_renotes,
        commands::api_get_note_conversation,
        commands::api_lookup_user,
        commands::api_get_cached_timeline,
        commands::api_delete_cached_note,
        commands::api_get_cached_timeline_before,
        commands::api_get_cache_date_range,
        commands::api_search_notes_local,
        commands::api_pin_note,
        commands::api_unpin_note,
        commands::api_get_user_pinned_note_ids,
        commands::api_mute_user,
        commands::api_unmute_user,
        commands::api_block_user,
        commands::api_unblock_user,
        commands::api_report_user,
        commands::api_add_note_to_clip,
        commands::api_add_user_to_list,
        commands::api_remove_user_from_list,
        commands::api_get_following,
        commands::api_get_followers,
        commands::api_get_user_relations,
        commands::api_get_unread_notification_count,
        commands::api_mark_all_notifications_as_read,
        commands::api_get_unread_chat,
        commands::api_get_self,
        commands::api_get_drive_folders,
        commands::api_get_drive_files,
        commands::api_delete_drive_file,
        commands::api_get_follow_requests,
        commands::api_search_users,
        commands::api_get_roles,
        commands::api_get_role_users,
        commands::api_get_announcements,
        commands::api_read_announcement,
        commands::api_react_chat_message,
        commands::api_unreact_chat_message,
        commands::api_create_messaging_message,
        commands::api_search_users_by_query,
        commands::api_search_hashtags,
        commands::api_ap_show,
        commands::api_get_server_stats,
        commands::api_get_meta_detail,
        commands::api_get_user_achievements,
        commands::api_get_user_notes_filtered,
        commands::api_get_user_featured_notes,
        commands::api_get_pages,
        commands::api_get_page,
        commands::api_like_page,
        commands::api_unlike_page,
        commands::api_get_gallery_posts,
        commands::api_like_gallery_post,
        commands::api_unlike_gallery_post,
        commands::api_get_flashes,
        commands::api_get_flash,
        commands::api_like_flash,
        commands::api_unlike_flash,
        commands::api_request,
        commands::api_fetch_account_theme,
        commands::api_get_chat_history,
        commands::api_get_chat_user_messages,
        commands::api_get_chat_room_messages,
        commands::api_create_chat_message,
        commands::auth_start,
        commands::auth_complete_and_save,
        commands::stream_connect,
        commands::stream_disconnect,
        commands::stream_connect_and_subscribe_timeline,
        commands::stream_connect_and_subscribe_antenna,
        commands::stream_connect_and_subscribe_channel,
        commands::stream_subscribe_timeline,
        commands::stream_subscribe_antenna,
        commands::stream_subscribe_channel,
        commands::stream_subscribe_chat_user,
        commands::stream_subscribe_chat_room,
        commands::stream_subscribe_main,
        commands::stream_unsubscribe,
        commands::stream_sub_note,
        commands::stream_unsub_note,
        commands::fetch_ogp,
        commands::fetch_nodeinfo,
        commands::fetch_server_meta,
        commands::get_cli_commands,
        commands::open_devtools,
    ]);

    builder = builder.setup(|app| {
        // Initialize platform keychain
        if let Err(e) = notecli::keychain::init_store() {
            eprintln!("Warning: keychain unavailable ({e})");
        }

        // Initialize SQLite database
        let app_dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&app_dir)?;
        let db_path = app_dir.join("notedeck.db");
        let db = std::sync::Arc::new(notecli::db::Database::open(&db_path)?);
        app.manage(db.clone());

        // Initialize Misskey HTTP client
        let client = std::sync::Arc::new(notecli::api::MisskeyClient::new()?);
        app.manage(client.clone());

        // Initialize event bus (SSE broadcasting)
        let event_bus = std::sync::Arc::new(notecli::event_bus::EventBus::new());
        app.manage(event_bus.clone());

        // Initialize streaming manager (delegates to notecli)
        let emitter = std::sync::Arc::new(streaming::TauriEmitter::new(app.app_handle().clone()));
        app.manage(notecli::streaming::StreamingManager::new(
            emitter,
            event_bus.clone(),
            db.clone(),
        ));

        // Initialize auth session tracker (replay prevention)
        app.manage(commands::AuthSessionTracker::new());

        // Migrate tokens from SQLite to keychain if any remain unmigrated.
        // Only runs when SQLite still holds plaintext tokens (pre-keyring-core upgrade).
        if let Ok(accounts) = db.load_accounts() {
            if accounts.iter().any(|a| !a.token.is_empty()) {
                for account in &accounts {
                    if let Err(e) = commands::get_credentials(&db, &account.id) {
                        eprintln!(
                            "[keychain] failed to migrate token for account {}: {e}",
                            account.id
                        );
                    }
                }
            }
        }

        // Export account list for background workers (non-secret metadata only)
        commands::export_account_list(app.app_handle(), &db);

        // Initialize OGP cache (backed by shared Database)
        app.manage(ogp::OgpCache::new(db.clone()));

        // Generate API token and write to file
        let api_token = uuid::Uuid::new_v4().to_string();
        let token_path = app_dir.join("api-token");
        std::fs::write(&token_path, &api_token)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&token_path, std::fs::Permissions::from_mode(0o600))?;
        }
        let token_path_str = token_path.to_string_lossy().to_string();

        // Initialize image cache
        let image_cache = std::sync::Arc::new(image_cache::ImageCache::new(&app_dir));

        // Start HTTP API server
        let app_handle = app.app_handle().clone();
        tauri::async_runtime::spawn(async move {
            http_server::start(
                app_handle,
                db.clone(),
                client,
                event_bus,
                api_token,
                token_path_str,
                image_cache,
            )
            .await;
        });

        // Global shortcuts (desktop only)
        #[cfg(not(mobile))]
        {
            use tauri_plugin_global_shortcut::{
                Code, Modifiers, Shortcut as GShortcut, ShortcutState,
            };

            // Boss Key: Ctrl+Shift+B — toggle window visibility
            let boss_key = GShortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyB);
            app.global_shortcut()
                .on_shortcut(boss_key, |app: &tauri::AppHandle, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(w) = app.get_webview_window("main") {
                        if w.is_visible().unwrap_or(false) {
                            let _ = w.hide();
                        } else {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })?;

            // Quick Note: Ctrl+Alt+N — show window + emit event for post mode
            let quick_note = GShortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN);
            app.global_shortcut()
                .on_shortcut(quick_note, |app: &tauri::AppHandle, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                        let _ = w.emit("nd:quick-note", ());
                    }
                })?;
        }

        // System tray (desktop only)
        #[cfg(not(mobile))]
        {
            let show_i = MenuItem::with_id(app, "show", "Show NoteDeck", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon = app
                .default_window_icon()
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
        }

        // Forward WM_MOUSEHWHEEL to WebView (Windows WebView2 workaround)
        #[cfg(target_os = "windows")]
        if let Some(w) = app.get_webview_window("main") {
            hwheel_hook::install(&w);
        }

        // Fit window to monitor if larger than available screen (e.g. low-res VMs)
        #[cfg(not(mobile))]
        if let Some(w) = app.get_webview_window("main") {
            if let Ok(Some(monitor)) = w.current_monitor() {
                let screen = monitor.size();
                let scale = monitor.scale_factor();
                let screen_w = (screen.width as f64 / scale) as u32;
                let screen_h = (screen.height as f64 / scale) as u32;

                if let Ok(outer) = w.outer_size() {
                    let win_w = (outer.width as f64 / scale) as u32;
                    let win_h = (outer.height as f64 / scale) as u32;

                    if win_w > screen_w || win_h > screen_h {
                        let new_w = win_w.min(screen_w);
                        let new_h = win_h.min(screen_h);
                        let _ = w.set_size(tauri::LogicalSize::new(new_w, new_h));
                        let _ = w.center();
                    }
                }
            }
        }

        Ok(())
    });

    // Hide to tray on close (desktop only)
    #[cfg(not(mobile))]
    {
        builder = builder.on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        });
    }

    builder.run(tauri::generate_context!())?;

    Ok(())
}
