//! Forward WM_MOUSEHWHEEL to WebView as a synthetic JS wheel event.
//!
//! WebView2 on Windows does not convert horizontal mouse wheel messages
//! (WM_MOUSEHWHEEL) into JavaScript wheel events. This module subclasses
//! the main window to intercept these messages and dispatches synthetic
//! wheel events via eval().

use std::ffi::c_void;
use std::sync::OnceLock;
use tauri::WebviewWindow;
use windows::Win32::Foundation::*;
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};

const WM_MOUSEHWHEEL: u32 = 0x020E;

static WEBVIEW: OnceLock<WebviewWindow> = OnceLock::new();

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _uid_subclass: usize,
    _ref_data: usize,
) -> LRESULT {
    if msg == WM_MOUSEHWHEEL {
        // High word of WPARAM = wheel delta (signed); positive = tilt right
        let delta = ((wparam.0 as u32 >> 16) & 0xFFFF) as i16 as i32;
        if let Some(w) = WEBVIEW.get() {
            let _ = w.eval(&format!("window.__ndHWheel&&window.__ndHWheel({})", delta));
        }
        return LRESULT(0);
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

/// Inject the JS helper and subclass the window to forward WM_MOUSEHWHEEL.
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

    // Get HWND via raw-window-handle
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let Ok(handle) = window.window_handle() else {
        return;
    };
    let RawWindowHandle::Win32(h) = handle.as_raw() else {
        return;
    };
    let hwnd = HWND(h.hwnd.get() as *mut c_void);

    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 1, 0);
    }
}
