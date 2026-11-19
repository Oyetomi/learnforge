//! Provider credentials (AI connection key, Exa key) in macOS Keychain.
//!
//! Unlike the ElevenLabs key, these values are returned to the webview: the
//! frontend calls these providers directly and needs the key for its request
//! headers. Keychain protects them at rest instead of plain local storage.

const NAMES: [&str; 2] = ["ai-connection", "exa"];
const MAX_LEN: usize = 4096;

fn check_name(name: &str) -> Result<(), String> {
    if NAMES.contains(&name) {
        Ok(())
    } else {
        Err("Unknown credential name.".into())
    }
}

fn check_value(value: &str) -> Result<(), String> {
    if value.len() > MAX_LEN || value.contains('\0') {
        Err("That credential is too long or contains invalid characters.".into())
    } else {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod keychain {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_int, c_void};
    extern "C" {
        fn lf_secret_save(account: *const c_char, value: *const c_char) -> c_int;
        fn lf_secret_delete(account: *const c_char) -> c_int;
        fn lf_secret_load(account: *const c_char, status: *mut c_int) -> *mut c_char;
        fn free(ptr: *mut c_void);
    }
    fn c(value: &str) -> Result<CString, String> {
        CString::new(value).map_err(|_| "Invalid credential.".to_string())
    }
    pub const AVAILABLE: bool = true;
    pub fn load(name: &str) -> Result<Option<String>, String> {
        let account = c(name)?;
        let mut status: c_int = -1;
        let ptr = unsafe { lf_secret_load(account.as_ptr(), &mut status) };
        if ptr.is_null() {
            return if status == 1 {
                Ok(None)
            } else {
                Err("Could not read the credential from macOS Keychain.".into())
            };
        }
        let value = unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() };
        unsafe { free(ptr.cast()) };
        Ok(Some(value))
    }
    pub fn save(name: &str, value: &str) -> Result<(), String> {
        let (account, value) = (c(name)?, c(value)?);
        if unsafe { lf_secret_save(account.as_ptr(), value.as_ptr()) } == 0 {
            Ok(())
        } else {
            Err("Could not save the credential in macOS Keychain.".into())
        }
    }
    pub fn delete(name: &str) -> Result<(), String> {
        let account = c(name)?;
        if unsafe { lf_secret_delete(account.as_ptr()) } == 0 {
            Ok(())
        } else {
            Err("Could not remove the credential from macOS Keychain.".into())
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod keychain {
    const UNAVAILABLE: &str = "Keychain credential storage is available in the Mac app.";
    pub const AVAILABLE: bool = false;
    pub fn load(_: &str) -> Result<Option<String>, String> {
        Err(UNAVAILABLE.into())
    }
    pub fn save(_: &str, _: &str) -> Result<(), String> {
        Err(UNAVAILABLE.into())
    }
    pub fn delete(_: &str) -> Result<(), String> {
        Err(UNAVAILABLE.into())
    }
}

#[tauri::command]
pub fn secret_store_available() -> bool {
    keychain::AVAILABLE
}

#[tauri::command]
pub async fn secret_get(name: String) -> Result<Option<String>, String> {
    check_name(&name)?;
    tauri::async_runtime::spawn_blocking(move || keychain::load(&name))
        .await
        .map_err(|_| "Could not read Keychain.".to_string())?
}

/// Stores `value`, or removes the item when `value` is empty.
#[tauri::command]
pub async fn secret_set(name: String, value: String) -> Result<(), String> {
    check_name(&name)?;
    let value = value.trim().to_owned();
    check_value(&value)?;
    tauri::async_runtime::spawn_blocking(move || {
        if value.is_empty() {
            keychain::delete(&name)
        } else {
            keychain::save(&name, &value)
        }
    })
    .await
    .map_err(|_| "Could not write Keychain.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_credentials_are_accepted() {
        assert!(check_name("ai-connection").is_ok());
        assert!(check_name("exa").is_ok());
        assert!(check_name("elevenlabs").is_err());
        assert!(check_name("../other").is_err());
    }

    #[test]
    fn oversized_or_nul_values_are_rejected() {
        assert!(check_value("sk-valid").is_ok());
        assert!(check_value(&"x".repeat(MAX_LEN + 1)).is_err());
        assert!(check_value("bad\0value").is_err());
    }
}
