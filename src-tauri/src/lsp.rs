//! Language servers for the code workspace (completion, live errors, hover,
//! go-to-definition…). The server named by the language profile runs inside
//! the same sandbox as project runs; messages are relayed between its stdio
//! and the webview as JSON-RPC strings.

use crate::languages;
use crate::project::{self, Context};
use crate::sandbox;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime, State};

const MAX_MESSAGE: usize = 16 * 1024 * 1024;

struct Server {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
}

#[derive(Default)]
pub struct Servers {
    next: AtomicU64,
    running: Arc<Mutex<HashMap<String, Server>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LspEvent {
    server_id: String,
    /// A JSON-RPC message, or null when the server exited.
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    server_id: String,
    root: String,
    program: String,
}

/// Read one `Content-Length`-framed message.
pub fn read_message(reader: &mut impl BufRead) -> Option<String> {
    let mut length: Option<usize> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 {
            return None;
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some(v) = line.strip_prefix("Content-Length:") {
            length = v.trim().parse().ok();
        }
    }
    let length = length.filter(|n| *n <= MAX_MESSAGE)?;
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).ok()?;
    String::from_utf8(body).ok()
}

pub fn frame(message: &str) -> Vec<u8> {
    let mut out = format!("Content-Length: {}\r\n\r\n", message.len()).into_bytes();
    out.extend_from_slice(message.as_bytes());
    out
}

#[tauri::command]
pub async fn lsp_start<R: Runtime>(app: AppHandle<R>, servers: State<'_, Servers>, track_id: String, profile_id: String) -> Result<Started, String> {
    let profile = project::profile(&app, &profile_id)?;
    let argv = tauri::async_runtime::spawn_blocking({
        let profile = profile.clone();
        move || languages::lsp_command(&profile).map(|(argv, _)| argv)
    })
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| {
            if profile.lsp_install.is_empty() {
                format!("No language server is set up for {}.", profile.name)
            } else {
                format!("Install a {} language server for completion and live errors: {}", profile.name, profile.lsp_install)
            }
        })?;
    let dir = project::project_dir(&app, &track_id)?;
    let cache = project::cache_dir(&app)?;
    let (mut child, program) = spawn(&profile, &argv, &dir, &cache)?;
    let server_id = format!("lsp{}", servers.next.fetch_add(1, Ordering::Relaxed) + 1);
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("no stdin")?));
    servers.running.lock().map_err(|_| "busy")?.insert(server_id.clone(), Server { child, stdin });
    {
        let (app, server_id, running) = (app.clone(), server_id.clone(), servers.running.clone());
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            while let Some(message) = read_message(&mut reader) {
                let _ = app.emit("lsp-message", LspEvent { server_id: server_id.clone(), message: Some(message) });
            }
            // Reap exited server so crashed processes never leak map entries or zombies.
            if let Some(mut server) = running.lock().ok().and_then(|mut m| m.remove(&server_id)) {
                let _ = server.child.wait();
            }
            let _ = app.emit("lsp-message", LspEvent { server_id, message: None });
        });
    }
    // Drain diagnostics output so a chatty server never blocks on a full pipe.
    std::thread::spawn(move || {
        let mut sink = [0u8; 8192];
        while matches!(stderr.read(&mut sink), Ok(n) if n > 0) {}
    });
    Ok(Started { server_id, root: dir.display().to_string(), program })
}

/// Start a language server for a project folder inside the sandbox.
pub fn spawn(profile: &languages::Profile, argv: &[String], dir: &std::path::Path, cache: &std::path::Path) -> Result<(Child, String), String> {
    let ctx = Context { dir, cache, profile, stage: None };
    let expanded = project::expand(argv, &ctx)?;
    let mut env = project::environment(&ctx);
    env.insert("XDG_CACHE_HOME".into(), cache.join("xdg").display().to_string());
    std::fs::create_dir_all(dir.join(".lf-tmp")).map_err(|e| e.to_string())?;
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    let sandbox_profile = sandbox::profile(&project::policy(&ctx), &home);
    let spec = sandbox::Spec {
        argv: &expanded,
        cwd: dir,
        env: &env,
        sandbox: &sandbox_profile,
        timeout: std::time::Duration::MAX,
        cancel: Arc::default(),
    };
    let child = sandbox::command(&spec)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start the language server: {e}"))?;
    Ok((child, expanded[0].clone()))
}

#[tauri::command]
pub async fn lsp_send(servers: State<'_, Servers>, server_id: String, message: String) -> Result<(), String> {
    if message.len() > MAX_MESSAGE {
        return Err("Message too large.".into());
    }
    let stdin = servers
        .running
        .lock()
        .map_err(|_| "busy")?
        .get(&server_id)
        .map(|s| s.stdin.clone())
        .ok_or("The language server has stopped.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut pipe = stdin.lock().map_err(|_| "busy".to_string())?;
        pipe.write_all(&frame(&message))
            .and_then(|_| pipe.flush())
            .map_err(|e| format!("The language server has stopped: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn lsp_stop(servers: State<'_, Servers>, server_id: String) {
    if let Some(mut server) = servers.running.lock().ok().and_then(|mut m| m.remove(&server_id)) {
        unsafe {
            libc::kill(-(server.child.id() as i32), libc::SIGKILL);
        }
        let _ = server.child.wait();
    }
}

/// Stop every server (app exit).
pub fn stop_all(servers: &Servers) {
    if let Ok(mut map) = servers.running.lock() {
        for (_, mut server) in map.drain() {
            unsafe {
                libc::kill(-(server.child.id() as i32), libc::SIGKILL);
            }
            let _ = server.child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_round_trip() {
        let a = r#"{"jsonrpc":"2.0","id":1,"result":"héllo"}"#;
        let b = r#"{"jsonrpc":"2.0","method":"x"}"#;
        let mut bytes = frame(a);
        bytes.extend(b"Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n");
        bytes.extend(frame(b));
        let mut reader = BufReader::new(&bytes[..]);
        assert_eq!(read_message(&mut reader).as_deref(), Some(a));
        assert_eq!(read_message(&mut reader).as_deref(), Some(b));
        assert_eq!(read_message(&mut reader), None);
    }

    /// Runs where clangd is installed: a sandboxed server answers completion
    /// with a struct's fields and reports a type error.
    #[cfg(target_os = "macos")]
    #[test]
    fn sandboxed_clangd_completes_and_reports_errors() {
        let profile = languages::load_profiles(None).0.into_iter().find(|p| p.id == "c").unwrap();
        let Some((argv, _)) = languages::lsp_command(&profile) else { return };
        let base = std::env::temp_dir().join(format!("lf-lsp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (dir, cache) = (base.join("project"), base.join("cache"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::create_dir_all(&cache).unwrap();
        let text = "struct store { int count; char *name; };\nvoid put(struct store *s) {\n    s->\n    int x = \"no\";\n}\n";
        std::fs::write(dir.join("store.c"), text).unwrap();
        let dir = std::fs::canonicalize(dir).unwrap();
        let (mut child, _) = spawn(&profile, &argv, &dir, &cache).unwrap();
        let mut stdin = child.stdin.take().unwrap();
        let mut reader = BufReader::new(child.stdout.take().unwrap());
        let uri = format!("file://{}/store.c", dir.display());
        let mut send = |v: serde_json::Value| stdin.write_all(&frame(&v.to_string())).unwrap();
        send(serde_json::json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"rootUri":format!("file://{}", dir.display()),"capabilities":{}}}));
        send(serde_json::json!({"jsonrpc":"2.0","method":"initialized","params":{}}));
        send(serde_json::json!({"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":uri,"languageId":"c","version":1,"text":text}}}));
        send(serde_json::json!({"jsonrpc":"2.0","id":2,"method":"textDocument/completion","params":{"textDocument":{"uri":uri},"position":{"line":2,"character":7}}}));
        let (mut labels, mut diagnostics) = (Vec::<String>::new(), 0usize);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        while std::time::Instant::now() < deadline && (labels.is_empty() || diagnostics == 0) {
            let Some(raw) = read_message(&mut reader) else { break };
            let msg: serde_json::Value = serde_json::from_str(&raw).unwrap();
            if msg["id"] == 2 {
                let items = msg["result"]["items"].as_array().or(msg["result"].as_array()).cloned().unwrap_or_default();
                labels = items.iter().filter_map(|i| i["label"].as_str().map(|l| l.trim().to_string())).collect();
            }
            if msg["method"] == "textDocument/publishDiagnostics" {
                diagnostics = msg["params"]["diagnostics"].as_array().map(|d| d.len()).unwrap_or(0);
            }
        }
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
        let _ = child.wait();
        let _ = std::fs::remove_dir_all(&base);
        assert!(labels.iter().any(|l| l == "count") && labels.iter().any(|l| l == "name"), "{labels:?}");
        assert!(diagnostics > 0);
    }

    #[test]
    fn oversized_frames_are_refused() {
        let bytes = format!("Content-Length: {}\r\n\r\n", MAX_MESSAGE + 1).into_bytes();
        assert_eq!(read_message(&mut BufReader::new(&bytes[..])), None);
    }
}
