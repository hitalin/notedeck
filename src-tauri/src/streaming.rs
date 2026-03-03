use notecli::streaming::FrontendEmitter;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub struct TauriEmitter {
    app: AppHandle,
}

impl TauriEmitter {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl FrontendEmitter for TauriEmitter {
    fn emit(&self, event: &str, payload: Value) {
        if let Err(e) = self.app.emit(event, payload) {
            eprintln!("[stream] emit {event} failed: {e}");
        }
    }
}
