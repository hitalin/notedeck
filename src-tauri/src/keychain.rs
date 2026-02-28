use crate::error::NoteDeckError;

const SERVICE: &str = "notedeck";

#[cfg(feature = "desktop")]
pub fn store_token(account_id: &str, token: &str) -> Result<(), NoteDeckError> {
    let entry = keyring::Entry::new(SERVICE, account_id)
        .map_err(|e| NoteDeckError::Keychain(e.to_string()))?;
    entry
        .set_password(token)
        .map_err(|e| NoteDeckError::Keychain(e.to_string()))
}

#[cfg(feature = "desktop")]
pub fn get_token(account_id: &str) -> Result<Option<String>, NoteDeckError> {
    let entry = keyring::Entry::new(SERVICE, account_id)
        .map_err(|e| NoteDeckError::Keychain(e.to_string()))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(NoteDeckError::Keychain(e.to_string())),
    }
}

#[cfg(feature = "desktop")]
pub fn delete_token(account_id: &str) -> Result<(), NoteDeckError> {
    let entry = keyring::Entry::new(SERVICE, account_id)
        .map_err(|e| NoteDeckError::Keychain(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(NoteDeckError::Keychain(e.to_string())),
    }
}

// Mobile fallback: no-ops (token stays in SQLite)
#[cfg(not(feature = "desktop"))]
pub fn store_token(_account_id: &str, _token: &str) -> Result<(), NoteDeckError> {
    Ok(())
}

#[cfg(not(feature = "desktop"))]
pub fn get_token(_account_id: &str) -> Result<Option<String>, NoteDeckError> {
    Ok(None)
}

#[cfg(not(feature = "desktop"))]
pub fn delete_token(_account_id: &str) -> Result<(), NoteDeckError> {
    Ok(())
}
