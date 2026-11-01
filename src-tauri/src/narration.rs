use serde::Serialize;
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri_plugin_http::reqwest;

#[cfg(target_os = "macos")]
mod keychain {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_int, c_void};
    extern "C" {
        fn lf_narration_key_status() -> c_int;
        fn lf_narration_key_save(key: *const c_char) -> c_int;
        fn lf_narration_key_load() -> *mut c_char;
        fn free(ptr: *mut c_void);
    }
    pub fn configured() -> Result<bool, String> {
        match unsafe { lf_narration_key_status() } {
            1 => Ok(true), 0 => Ok(false), _ => Err("Could not check the narration key in Keychain.".into()),
        }
    }
    pub fn save(key: &str) -> Result<(), String> {
        let value = CString::new(key).map_err(|_| "Invalid narration key.")?;
        if unsafe { lf_narration_key_save(value.as_ptr()) } == 0 { Ok(()) }
        else { Err("Could not save the narration key in macOS Keychain.".into()) }
    }
    pub fn load() -> Result<String, String> {
        let ptr = unsafe { lf_narration_key_load() };
        if ptr.is_null() { return Err("Connect ElevenLabs in Settings → Plugins → ElevenLabs. If Keychain asks, allow LearnForge to read its narration key.".into()); }
        let key = unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() };
        unsafe { free(ptr.cast()); }
        Ok(key)
    }
}
#[cfg(not(target_os = "macos"))]
mod keychain {
    pub fn configured() -> Result<bool, String> { Ok(false) }
    pub fn save(_: &str) -> Result<(), String> { Err("ElevenLabs Keychain storage is available in the Mac app.".into()) }
    pub fn load() -> Result<String, String> { Err("Use the Mac app for ElevenLabs narration.".into()) }
}

#[derive(Default)]
pub struct NarrationRequests(Mutex<HashMap<u64, tokio::sync::watch::Sender<bool>>>);

fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 100 && value.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(30)).redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "Could not prepare the narration connection.".into())
}
fn status_error(status: reqwest::StatusCode) -> String {
    match status.as_u16() {
        401 | 403 => "ElevenLabs rejected the key or its permissions. Check Text to Speech access in ElevenLabs.",
        402 | 429 => "ElevenLabs could not generate audio because of credits or rate limits. Try later or choose device voice in Settings.",
        404 | 422 => "The selected ElevenLabs voice or model is unavailable. Load voices in Settings or select another model.",
        _ => "ElevenLabs could not complete the audio. Try again or choose device voice in Settings.",
    }.into()
}

#[tauri::command]
pub async fn narration_key_status() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(keychain::configured).await.map_err(|_| "Could not check Keychain.")?
}
#[tauri::command]
pub async fn narration_store_key(key: String) -> Result<(), String> {
    let key = key.trim().to_owned();
    if !key.starts_with("sk_") || key.len() < 20 || key.len() > 256 || key.chars().any(char::is_whitespace) {
        return Err("Enter a valid ElevenLabs API key.".into());
    }
    tauri::async_runtime::spawn_blocking(move || keychain::save(&key)).await.map_err(|_| "Could not save Keychain entry.")?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationVoice { id: String, name: String }

#[tauri::command]
pub async fn narration_voices(api_key: Option<String>) -> Result<Vec<NarrationVoice>, String> {
    let key = match api_key.filter(|key| !key.trim().is_empty()) {
        Some(key) => key.trim().to_string(),
        None => tauri::async_runtime::spawn_blocking(keychain::load).await.map_err(|_| "Could not read Keychain.")??,
    };
    let response = client()?.get("https://api.elevenlabs.io/v2/voices?page_size=100")
        .header("xi-api-key", key).send().await.map_err(|_| "Could not load ElevenLabs voices.")?;
    if !response.status().is_success() {
        return Err(if matches!(response.status().as_u16(), 401 | 403) {
            "This key cannot list voices. Enable Voices Read in ElevenLabs, or keep using a known voice ID; speech generation may still work.".into()
        } else { status_error(response.status()) });
    }
    let value: serde_json::Value = response.json().await.map_err(|_| "ElevenLabs returned an unreadable voice list.")?;
    let voices: Vec<_> = value["voices"].as_array().into_iter().flatten().filter_map(|v| {
        let id = v["voice_id"].as_str()?;
        if !valid_id(id) { return None; }
        Some(NarrationVoice { id: id.into(), name: v["name"].as_str().unwrap_or("Voice").chars().take(100).collect() })
    }).collect();
    if voices.is_empty() { Err("No voices are available. Check Voices Read permission for this key.".into()) } else { Ok(voices) }
}

#[tauri::command]
pub fn narration_cancel(request_id: u64, state: tauri::State<'_, NarrationRequests>) {
    if let Ok(requests) = state.0.lock() {
        if let Some(cancel) = requests.get(&request_id) { let _ = cancel.send(true); }
    }
}

#[tauri::command]
pub async fn narration_generate(text: String, voice_id: String, model_id: String, request_id: u64,
    state: tauri::State<'_, NarrationRequests>) -> Result<Vec<u8>, String> {
    if text.trim().is_empty() || text.chars().count() > 2500 || !valid_id(&voice_id) ||
        !["eleven_flash_v2_5", "eleven_multilingual_v2"].contains(&model_id.as_str()) {
        return Err("The narration text, voice or model is invalid.".into());
    }
    let (tx, mut cancel) = tokio::sync::watch::channel(false);
    {
        let mut requests = state.0.lock().map_err(|_| "Could not start narration.")?;
        if requests.len() >= 2 || requests.contains_key(&request_id) { return Err("Another narration request is finishing. Try again shortly.".into()); }
        requests.insert(request_id, tx);
    }
    let generate = async {
        let key = tauri::async_runtime::spawn_blocking(keychain::load).await.map_err(|_| "Could not read Keychain.")??;
        let mut response = client()?.post(format!("https://api.elevenlabs.io/v1/text-to-speech/{}?output_format=mp3_44100_128", voice_id))
            .header("xi-api-key", key).header("Accept", "audio/mpeg")
            .json(&serde_json::json!({"text":text,"model_id":model_id})).send().await
            .map_err(|_| "The audio request could not finish. Try again or choose device voice in Settings.")?;
        if !response.status().is_success() { return Err(status_error(response.status())); }
        if !response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").starts_with("audio/") {
            return Err("ElevenLabs returned no playable audio.".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "The audio download stopped early.")? {
            if bytes.len() + chunk.len() > 10_000_000 { return Err("The narration audio was too large.".into()); }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.is_empty() { Err("ElevenLabs returned empty audio.".into()) } else { Ok(bytes) }
    };
    let result = tokio::select! { value = generate => value, _ = cancel.changed() => Err("Narration stopped.".into()) };
    if let Ok(mut requests) = state.0.lock() { requests.remove(&request_id); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn voice_identifiers_cannot_change_the_destination() {
        assert!(valid_id("JBFqnCBsd6RMkjVDRZzb"));
        for id in ["", "../user", "voice?key=x", "https://example.com", "voice/name"] { assert!(!valid_id(id)); }
    }
    #[test] fn provider_errors_do_not_include_response_bodies_or_keys() {
        assert!(status_error(reqwest::StatusCode::UNAUTHORIZED).contains("permissions"));
        assert!(status_error(reqwest::StatusCode::TOO_MANY_REQUESTS).contains("credits"));
    }
}
