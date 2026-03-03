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
        // Consolidate all stream-* events into a single "stream-event" with kind discriminator
        let wrapped = serde_json::json!({
            "kind": event,
            "payload": payload,
        });
        if let Err(e) = self.app.emit("stream-event", wrapped) {
            eprintln!("[stream] emit {event} failed: {e}");
        }
    }
}
