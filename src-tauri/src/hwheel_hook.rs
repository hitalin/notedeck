//! Forward WM_MOUSEHWHEEL to WebView as a synthetic JS wheel event.
//!
//! WebView2 on Windows does not convert horizontal mouse wheel messages
//! (WM_MOUSEHWHEEL) into JavaScript wheel events. A window subclass on the
//! top-level HWND cannot intercept these messages because they are delivered
//! directly to WebView2's child HWND. This module uses a thread-level mouse
//! hook (`WH_MOUSE`) to capture the message regardless of which child window
//! receives it.

use std::sync::OnceLock;
use tauri::WebviewWindow;
use windows::Win32::Foundation::*;
use windows::Win32::UI::WindowsAndMessaging::*;

const WM_MOUSEHWHEEL: u32 = 0x020E;

static WEBVIEW: OnceLock<WebviewWindow> = OnceLock::new();

unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam.0 as u32 == WM_MOUSEHWHEEL {
        // mouseData is in the MOUSEHOOKSTRUCTEX extension (right after MOUSEHOOKSTRUCT)
        let mhsx = unsafe { &*(lparam.0 as *const MouseHookStructEx) };
        let delta = mhsx.mouse_data as i16 as i32;
        if delta != 0 {
            if let Some(w) = WEBVIEW.get() {
                let _ = w.eval(&format!("window.__ndHWheel&&window.__ndHWheel({})", delta));
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

/// Inject the JS helper and install a thread-level mouse hook to forward
/// WM_MOUSEHWHEEL.
pub fn install(window: &WebviewWindow) {
    // Inject JS helper that tracks mouse position and dispatches synthetic
    // wheel events on the element under the cursor.
    let _ = window.eval(
        r#"(function(){
            var mx=0,my=0;
            document.addEventListener('mousemove',function(e){mx=e.clientX;my=e.clientY},{passive:true});
            window.__ndHWheel=function(d){
                var el=document.elementFromPoint(mx,my);
                if(el){el.dispatchEvent(new WheelEvent('wheel',{deltaX:d,deltaY:0,clientX:mx,clientY:my,bubbles:true,cancelable:true}))}
            };
        })()"#,
    );

    WEBVIEW.set(window.clone()).ok();

    // Install a thread-level mouse hook (WH_MOUSE) to intercept
    // WM_MOUSEHWHEEL on any child window including WebView2.
    unsafe {
        let _ = SetWindowsHookExW(WH_MOUSE, Some(mouse_hook_proc), None, GetCurrentThreadId());
    }
}
