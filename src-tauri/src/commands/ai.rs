use notecli::error::NoteDeckError;
use notecli::keychain;

use super::Result;

pub(crate) const VALID_AI_PROVIDERS: &[&str] = &["anthropic", "openai", "custom"];

pub(crate) fn validate_ai_provider(provider: &str) -> Result<()> {
    if VALID_AI_PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(NoteDeckError::InvalidInput(format!(
            "Unknown AI provider: {provider}"
        )))
    }
}

pub(crate) fn ai_keychain_id(provider: &str) -> String {
    format!("ai.{provider}")
}

/// Read an AI API key directly from the keychain (Rust-internal use).
/// Returns `None` if the entry is missing.
pub(crate) fn read_ai_api_key(provider: &str) -> Result<Option<String>> {
    validate_ai_provider(provider)?;
    notecli::keychain::get_token(&ai_keychain_id(provider)).map_err(Into::into)
}

/// Store an AI API key in the OS keychain.
/// Empty `api_key` removes the entry instead.
#[tauri::command]
#[specta::specta]
pub async fn ai_set_api_key(provider: String, api_key: String) -> Result<()> {
    validate_ai_provider(&provider)?;
    let id = ai_keychain_id(&provider);
    if api_key.is_empty() {
        keychain::delete_token(&id)
    } else {
        keychain::store_token(&id, &api_key)
    }
}

/// Returns true if an AI API key is stored for the given provider.
/// The key itself is never returned to the frontend.
#[tauri::command]
#[specta::specta]
pub async fn ai_get_api_key_status(provider: String) -> Result<bool> {
    validate_ai_provider(&provider)?;
    let id = ai_keychain_id(&provider);
    Ok(keychain::get_token(&id).ok().flatten().is_some())
}

/// Delete an AI API key from the OS keychain. No-op if missing.
#[tauri::command]
#[specta::specta]
pub async fn ai_delete_api_key(provider: String) -> Result<()> {
    validate_ai_provider(&provider)?;
    let id = ai_keychain_id(&provider);
    keychain::delete_token(&id)
}
