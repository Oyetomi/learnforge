use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRecordingStatus {
    pub active: bool,
    pub transcript: String,
    pub is_final: bool,
    pub level: f32,
    pub error: String,
}

#[cfg(target_os = "macos")]
mod macos_ffi {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_int};

    extern "C" {
        fn lf_voice_start(lang_cstr: *const c_char) -> *mut c_char;
        fn lf_voice_poll_json() -> *mut c_char;
        fn lf_voice_stop_json() -> *mut c_char;
        fn lf_tts_speak(text_cstr: *const c_char, lang_cstr: *const c_char);
        fn lf_tts_stop();
        fn lf_tts_is_speaking() -> c_int;
        fn lf_free_cstring(ptr: *mut c_char);
    }

    fn take_json(ptr: *mut c_char) -> Result<super::VoiceRecordingStatus, String> {
        if ptr.is_null() {
            return Err("Native speech bridge returned null".to_string());
        }
        let json_str = unsafe {
            let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
            lf_free_cstring(ptr);
            s
        };
        serde_json::from_str(&json_str).map_err(|e| e.to_string())
    }

    pub fn start_recording(lang: &str) -> Result<super::VoiceRecordingStatus, String> {
        let c_lang = CString::new(lang).unwrap_or_else(|_| CString::new("en-US").unwrap());
        let ptr = unsafe { lf_voice_start(c_lang.as_ptr()) };
        take_json(ptr)
    }

    pub fn poll_recording() -> Result<super::VoiceRecordingStatus, String> {
        let ptr = unsafe { lf_voice_poll_json() };
        take_json(ptr)
    }

    pub fn stop_recording() -> Result<super::VoiceRecordingStatus, String> {
        let ptr = unsafe { lf_voice_stop_json() };
        take_json(ptr)
    }

    pub fn speak(text: &str, lang: &str) {
        if let (Ok(c_text), Ok(c_lang)) = (CString::new(text), CString::new(lang)) {
            unsafe {
                lf_tts_speak(c_text.as_ptr(), c_lang.as_ptr());
            }
        }
    }

    pub fn stop_speaking() {
        unsafe {
            lf_tts_stop();
        }
    }

    pub fn is_speaking() -> bool {
        unsafe { lf_tts_is_speaking() != 0 }
    }
}

#[tauri::command]
fn voice_start_recording(lang: Option<String>) -> Result<VoiceRecordingStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let locale = lang.unwrap_or_else(|| "en-US".to_string());
        macos_ffi::start_recording(&locale)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = lang;
        Err("Native desktop speech recognition is only implemented on macOS.".to_string())
    }
}

#[tauri::command]
fn voice_poll_recording() -> Result<VoiceRecordingStatus, String> {
    #[cfg(target_os = "macos")]
    {
        macos_ffi::poll_recording()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(VoiceRecordingStatus {
            active: false,
            transcript: String::new(),
            is_final: true,
            level: 0.0,
            error: String::new(),
        })
    }
}

#[tauri::command]
fn voice_stop_recording() -> Result<VoiceRecordingStatus, String> {
    #[cfg(target_os = "macos")]
    {
        macos_ffi::stop_recording()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(VoiceRecordingStatus {
            active: false,
            transcript: String::new(),
            is_final: true,
            level: 0.0,
            error: String::new(),
        })
    }
}

#[tauri::command]
fn speech_speak(text: String, lang: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let locale = lang.unwrap_or_else(|| "en-US".to_string());
        macos_ffi::speak(&text, &locale);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (text, lang);
        Err("Native desktop speech synthesis is only implemented on macOS.".to_string())
    }
}

#[tauri::command]
fn speech_stop() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_ffi::stop_speaking();
    }
    Ok(())
}

#[tauri::command]
fn speech_is_speaking() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_ffi::is_speaking()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            voice_start_recording,
            voice_poll_recording,
            voice_stop_recording,
            speech_speak,
            speech_stop,
            speech_is_speaking,
        ])
        .run(tauri::generate_context!())
        .expect("error while running learnforge tauri application");
}
