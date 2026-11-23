use serde::{Deserialize, Serialize};
mod languages;
mod lsp;
mod narration;
mod project;
mod sandbox;
mod secrets;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRecordingStatus {
    pub active: bool,
    #[serde(default)]
    pub phase: String,
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
            phase: "idle".to_string(),
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
            phase: "idle".to_string(),
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

/// Add the app's plugins, state and commands to a builder (tests pass Tauri's mock builder).
pub fn configure<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_http::init())
        .manage(narration::NarrationRequests::default())
        .manage(project::Runs::default())
        .manage(lsp::Servers::default())
        .invoke_handler(tauri::generate_handler![
            voice_start_recording,
            voice_poll_recording,
            voice_stop_recording,
            speech_speak,
            speech_stop,
            speech_is_speaking,
            narration::narration_key_status,
            narration::narration_store_key,
            narration::narration_voices,
            narration::narration_generate,
            narration::narration_cancel,
            secrets::secret_store_available,
            secrets::secret_get,
            secrets::secret_set,
            project::language_profiles,
            project::project_sync,
            project::project_delete,
            project::project_exec,
            project::project_fetch_deps,
            project::project_export,
            project::project_cancel,
            lsp::lsp_start,
            lsp::lsp_send,
            lsp::lsp_stop,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure(tauri::Builder::default())
        .build(tauri::generate_context!())
        .expect("error while building learnforge tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                lsp::stop_all(&tauri::Manager::state::<lsp::Servers>(app));
            }
        });
}

/// End-to-end through Tauri's IPC layer: command names, camelCase arguments
/// and response shapes exactly as the webview sends and receives them.
#[cfg(test)]
mod ipc_tests {
    use serde_json::{json, Value};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
    use tauri::webview::InvokeRequest;
    use tauri::Manager;

    fn invoke(webview: &tauri::WebviewWindow<MockRuntime>, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    #[test]
    fn project_commands_round_trip_through_ipc() {
        let mut context = mock_context(noop_assets());
        context.config_mut().identifier = format!("com.oyetomi.learnforge.ipctest{}", std::process::id());
        let app = super::configure(tauri::test::mock_builder()).build(context).unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let data_dir = app.path().app_data_dir().unwrap();
        assert!(data_dir.ends_with(format!("com.oyetomi.learnforge.ipctest{}", std::process::id())));

        assert_eq!(invoke(&webview, "secret_store_available", json!({})), Ok(json!(cfg!(target_os = "macos"))));
        let profiles = invoke(&webview, "language_profiles", json!({})).unwrap();
        let go = profiles.as_array().unwrap().iter().find(|p| p["id"] == "go").cloned().unwrap();
        assert!(go["runnable"].is_boolean() && go["testFile"].is_string());

        let files = json!([
            { "path": "go.mod", "content": "module learnforge\n\ngo 1.21\n" },
            { "path": "main.go", "content": "package main\n\nimport (\n\t\"fmt\"\n\t\"learnforge/wordcount\"\n)\n\nfunc main() { fmt.Println(wordcount.Count(\"a b c\")) }\n" },
            { "path": "wordcount/count.go", "content": "package wordcount\n\nimport \"strings\"\n\nfunc Count(s string) int { return len(strings.Fields(s)) }\n" },
            { "path": "stage01_count_test.go", "content": "package main\n\nimport (\n\t\"testing\"\n\t\"learnforge/wordcount\"\n)\n\nfunc TestStage01Count(t *testing.T) {\n\tif wordcount.Count(\"a b\") != 2 {\n\t\tt.Fatal(\"want 2\")\n\t}\n}\n" }
        ]);
        let dir = invoke(&webview, "project_sync", json!({ "trackId": "ipc-test", "profileId": "go", "files": files })).unwrap();
        assert!(dir.as_str().unwrap().ends_with("projects/ipc-test"));
        let refused = invoke(&webview, "project_sync", json!({ "trackId": "ipc-test", "profileId": "go", "files": [{ "path": "../x.go", "content": "" }] }));
        assert!(refused.is_err());

        if go["runnable"] == true {
            let test = invoke(&webview, "project_exec", json!({
                "trackId": "ipc-test", "profileId": "go", "action": "test",
                "stage": { "number": 1, "testFile": "stage01_count_test.go" }, "requestId": "r1"
            }))
            .unwrap();
            assert_eq!(test["exitCode"], 0, "{test}");
            let run = invoke(&webview, "project_exec", json!({
                "trackId": "ipc-test", "profileId": "go", "action": "run", "stage": null, "requestId": "r2"
            }))
            .unwrap();
            assert_eq!(run["steps"][0]["stdout"].as_str().unwrap().trim(), "3", "{run}");
        }
        let _ = std::fs::remove_dir_all(&data_dir);
        let _ = std::fs::remove_dir_all(app.path().app_cache_dir().unwrap());
    }
}
