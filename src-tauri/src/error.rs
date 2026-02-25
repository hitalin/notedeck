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
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}
