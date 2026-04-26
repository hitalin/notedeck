use notecli::error::NoteDeckError;
use notecli::keychain;

use super::Result;

const VALID_AI_PROVIDERS: &[&str] = &["ollama", "openai", "custom"];

fn validate_ai_provider(provider: &str) -> Result<()> {
    if VALID_AI_PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(NoteDeckError::InvalidInput(format!(
            "Unknown AI provider: {provider}"
        )))
    }
}

fn ai_keychain_id(provider: &str) -> String {
    format!("ai.{provider}")
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
