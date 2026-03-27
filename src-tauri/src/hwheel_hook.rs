//! Forward WM_MOUSEHWHEEL to the frontend via Tauri event.
//!
//! WebView2 on Windows does not convert horizontal mouse wheel messages
//! (WM_MOUSEHWHEEL) into JavaScript wheel events. A window subclass on the
//! top-level HWND cannot intercept these messages because they are delivered
//! directly to WebView2's child HWND. This module uses a thread-level mouse
//! hook (`WH_MOUSE`) to capture the message regardless of which child window
//! receives it, then forwards the delta as a Tauri event (`nd:hwheel`).

use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::*;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::*;

const WM_MOUSEHWHEEL: u32 = 0x020E;

static APP: OnceLock<AppHandle> = OnceLock::new();

unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam.0 as u32 == WM_MOUSEHWHEEL {
        // mouseData is in the MOUSEHOOKSTRUCTEX extension (right after MOUSEHOOKSTRUCT)
        let mhsx = unsafe { &*(lparam.0 as *const MouseHookStructEx) };
        let delta = mhsx.mouse_data as i16 as i32;
        if delta != 0 {
            if let Some(app) = APP.get() {
                let _ = app.emit("nd:hwheel", delta);
            }
        }
        // Return non-zero to prevent further processing (avoid double handling)
        return LRESULT(1);
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// MOUSEHOOKSTRUCTEX — extends MOUSEHOOKSTRUCT with mouseData field.
#[repr(C)]
struct MouseHookStructEx {
    _base: MOUSEHOOKSTRUCT,
    mouse_data: u32,
}

/// Install a thread-level mouse hook to forward WM_MOUSEHWHEEL as a Tauri event.
pub fn install(app: &AppHandle) {
    APP.set(app.clone()).ok();

    // Install a thread-level mouse hook (WH_MOUSE) to intercept
    // WM_MOUSEHWHEEL on any child window including WebView2.
    unsafe {
        let _ = SetWindowsHookExW(WH_MOUSE, Some(mouse_hook_proc), None, GetCurrentThreadId());
    }
}
