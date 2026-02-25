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

impl serde::Serialize for NoteDeckError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
