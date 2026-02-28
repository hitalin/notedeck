use thiserror::Error;

#[derive(Debug, Error)]
pub enum NoteDeckError {
    #[error("Database error")]
    Database(#[from] rusqlite::Error),

    #[error("Network error")]
    Network(#[from] reqwest::Error),

    #[error("JSON parse error")]
    Json(#[from] serde_json::Error),

    #[error("Account not found: {0}")]
    AccountNotFound(String),

    #[error("{message}")]
    Api {
        endpoint: String,
        status: u16,
        message: String,
    },

    #[error("{0}")]
    Auth(String),

    #[error("WebSocket: {0}")]
    WebSocket(String),

    #[error("No connection for account: {0}")]
    NoConnection(String),

    #[error("Connection closed")]
    ConnectionClosed,

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Keychain error: {0}")]
    Keychain(String),
}

impl NoteDeckError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Database(_) => "DATABASE",
            Self::Network(_) => "NETWORK",
            Self::Json(_) => "JSON",
            Self::AccountNotFound(_) => "ACCOUNT_NOT_FOUND",
            Self::Api { .. } => "API",
            Self::Auth(_) => "AUTH",
            Self::WebSocket(_) => "WEBSOCKET",
            Self::NoConnection(_) => "NO_CONNECTION",
            Self::ConnectionClosed => "CONNECTION_CLOSED",
            Self::InvalidInput(_) => "INVALID_INPUT",
            Self::Keychain(_) => "KEYCHAIN",
        }
    }
}

impl NoteDeckError {
    /// Returns a sanitized message safe for the frontend.
    /// Internal details (DB queries, network traces, keychain internals) are
    /// logged to stderr and replaced with generic messages.
    fn safe_message(&self) -> String {
        match self {
            Self::Database(e) => {
                eprintln!("[error] Database: {e}");
                "Database operation failed".to_string()
            }
            Self::Network(e) => {
                eprintln!("[error] Network: {e}");
                "Network request failed".to_string()
            }
            Self::Json(e) => {
                eprintln!("[error] JSON: {e}");
                "Invalid response format".to_string()
            }
            Self::WebSocket(e) => {
                eprintln!("[error] WebSocket: {e}");
                "Connection error".to_string()
            }
            Self::Keychain(e) => {
                eprintln!("[error] Keychain: {e}");
                "Credential storage error".to_string()
            }
            // These contain messages we control — safe to expose
            Self::Api { message, .. } => message.clone(),
            Self::Auth(msg) => msg.clone(),
            Self::AccountNotFound(id) => format!("Account not found: {id}"),
            Self::NoConnection(id) => format!("No connection for account: {id}"),
            Self::ConnectionClosed => "Connection closed".to_string(),
            Self::InvalidInput(msg) => format!("Invalid input: {msg}"),
        }
    }
}

impl serde::Serialize for NoteDeckError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("NoteDeckError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.safe_message())?;
        s.end()
    }
}
