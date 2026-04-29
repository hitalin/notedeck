//! Apply Windows 11 DWM chrome to decoration-less windows so the OS draws
//! rounded corners and the focus-aware border (matches VSCode / native Win11
//! apps that also use custom titlebars).
//!
//! `decorations: false` in tauri.conf.json removes the native frame entirely,
//! which on Windows 11 also disables the rounded-corner clipping and the
//! accent-colored focus border that DWM normally applies. Re-enabling them via
//! these DWM attributes keeps the custom titlebar UX while restoring native
//! window chrome cues.
//!
//! No-op on Linux/macOS — DWM is Windows-only.

#[cfg(target_os = "windows")]
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};

/// Sentinel COLORREF that tells DWM to fall back to the system-default border
/// color, which animates to the accent on focus and dims when blurred.
#[cfg(target_os = "windows")]
const DWMWA_COLOR_DEFAULT: u32 = 0xFFFF_FFFF;

#[cfg(target_os = "windows")]
pub fn apply<R: Runtime>(window: &WebviewWindow<R>) {
    let hwnd_isize = match window.hwnd() {
        Ok(h) => h.0 as isize,
        Err(e) => {
            tracing::warn!("win_chrome: failed to get HWND: {e}");
            return;
        }
    };
    let hwnd = HWND(hwnd_isize as *mut _);

    unsafe {
        let pref = DWMWCP_ROUND;
        if let Err(e) = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            std::ptr::from_ref(&pref).cast(),
            std::mem::size_of_val(&pref) as u32,
        ) {
            tracing::warn!("win_chrome: corner preference failed: {e}");
        }

        let color = DWMWA_COLOR_DEFAULT;
        if let Err(e) = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            std::ptr::from_ref(&color).cast(),
            std::mem::size_of_val(&color) as u32,
        ) {
            tracing::warn!("win_chrome: border color failed: {e}");
        }
    }
}

#[cfg(target_os = "windows")]
pub fn apply_to_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        apply(&w);
    }
}

#[cfg(not(target_os = "windows"))]
pub fn apply_to_main(_: &tauri::AppHandle) {}
