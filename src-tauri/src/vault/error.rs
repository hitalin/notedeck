use notecli::error::NoteDeckError;
use serde::Serialize;

/// Vault 操作のエラー。
///
/// フロントエンドにはこの enum がそのまま渡る (`specta::Type` で型生成)。
/// secret 値は variant に含めない — メッセージ生成時に leak しないこと。
#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum VaultError {
    /// connection_id が `connections.json` に存在しない。
    ConnectionNotFound,
    /// secret が当該 slot に設定されていない。Phase B (`vault_fetch`) で使う。
    #[allow(dead_code)]
    SecretNotSet,
    /// secret が短すぎる (最小 16 文字)。redaction の誤マッチ防止のため拒否する。
    SecretTooShort,
    /// slot 名が `^[a-z][a-z0-9_]{0,31}$` に一致しない。
    InvalidSlot,
    /// connection_id が ULID 形式でない。
    InvalidConnectionId,
    /// 入力値が不正 (baseUrl パース失敗 / authType 不整合など)。
    InvalidInput { message: String },
    /// メタデータファイルの読み書きに失敗した。
    StoreIo { message: String },
    /// OS キーチェーン操作に失敗した。
    Keychain { message: String },
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VaultError::ConnectionNotFound => write!(f, "connection not found"),
            VaultError::SecretNotSet => write!(f, "secret not set"),
            VaultError::SecretTooShort => write!(f, "secret too short (min 16 chars)"),
            VaultError::InvalidSlot => write!(f, "invalid slot name"),
            VaultError::InvalidConnectionId => write!(f, "invalid connection id"),
            VaultError::InvalidInput { message } => write!(f, "invalid input: {message}"),
            VaultError::StoreIo { message } => write!(f, "store io error: {message}"),
            VaultError::Keychain { message } => write!(f, "keychain error: {message}"),
        }
    }
}

impl std::error::Error for VaultError {}

impl From<NoteDeckError> for VaultError {
    fn from(e: NoteDeckError) -> Self {
        match e {
            NoteDeckError::Keychain(message) => VaultError::Keychain { message },
            other => VaultError::StoreIo {
                message: other.to_string(),
            },
        }
    }
}

pub type VaultResult<T> = std::result::Result<T, VaultError>;
