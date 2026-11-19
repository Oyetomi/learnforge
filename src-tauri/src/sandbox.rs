//! Run toolchain commands inside a macOS `sandbox-exec` profile.
//!
//! The child gets no internet (localhost only), may write only to the
//! project folder (which holds its TMPDIR) and the shared toolchain cache, and may
//! not read file contents under the home folder except the project, the
//! cache and the toolchains' own folders. Its environment is rebuilt from
//! scratch, so no secrets in the app's environment are inherited.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";
const OUTPUT_CAP: usize = 256 * 1024;

pub struct Policy {
    pub writable: Vec<PathBuf>,
    pub readable: Vec<PathBuf>,
}

fn quote(path: &Path) -> String {
    let s = path.display().to_string();
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Paths must be canonical: the sandbox matches real paths (/private/var…).
fn canonical(paths: &[PathBuf]) -> Vec<PathBuf> {
    paths.iter().filter_map(|p| std::fs::canonicalize(p).ok()).collect()
}

pub fn profile(policy: &Policy, home: &Path) -> String {
    let mut sb = String::from(
        "(version 1)\n(allow default)\n(deny network*)\n\
         (allow network* (remote ip \"localhost:*\"))\n(allow network* (local ip \"localhost:*\"))\n\
         (deny file-write*)\n\
         (allow file-write* (subpath \"/dev\")",
    );
    for p in canonical(&policy.writable) {
        sb.push_str(&format!(" (subpath {})", quote(&p)));
    }
    sb.push_str(")\n");
    if let Ok(home) = std::fs::canonicalize(home) {
        sb.push_str(&format!("(deny file-read-data (subpath {}))\n(allow file-read-data", quote(&home)));
        for p in canonical(&policy.writable).into_iter().chain(canonical(&policy.readable)) {
            sb.push_str(&format!(" (subpath {})", quote(&p)));
        }
        sb.push_str(")\n");
    }
    sb
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepOutput {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub duration_ms: u64,
}

pub struct Spec<'a> {
    pub argv: &'a [String],
    pub cwd: &'a Path,
    pub env: &'a BTreeMap<String, String>,
    pub sandbox: &'a str,
    pub timeout: Duration,
    pub cancel: Arc<AtomicBool>,
}

fn reader(mut source: impl Read + Send + 'static) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut buf = [0u8; 8192];
        let mut truncated = false;
        while let Ok(n) = source.read(&mut buf) {
            if n == 0 {
                break;
            }
            if out.len() < OUTPUT_CAP {
                out.extend_from_slice(&buf[..n.min(OUTPUT_CAP - out.len())]);
            } else {
                truncated = true;
            }
        }
        let mut text = String::from_utf8_lossy(&out).into_owned();
        if truncated {
            text.push_str("\n… output truncated");
        }
        text
    })
}

fn kill_group(child: &Child) {
    // The child leads its own process group; kill everything it started.
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
}

pub fn command(spec: &Spec) -> Command {
    let mut cmd = Command::new(SANDBOX_EXEC);
    cmd.arg("-p").arg(spec.sandbox).arg("--").args(spec.argv);
    cmd.current_dir(spec.cwd).env_clear().envs(spec.env).stdin(Stdio::null());
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
    cmd
}

pub fn run(spec: Spec) -> Result<StepOutput, String> {
    let start = Instant::now();
    let display = spec.argv.iter().map(|a| a.rsplit('/').next().unwrap_or(a)).collect::<Vec<_>>().join(" ");
    let mut child = command(&spec)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start {}: {e}", spec.argv[0]))?;
    let out = reader(child.stdout.take().ok_or("no stdout")?);
    let err = reader(child.stderr.take().ok_or("no stderr")?);
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break Some(status);
        }
        if spec.cancel.load(Ordering::Relaxed) || start.elapsed() > spec.timeout {
            timed_out = !spec.cancel.load(Ordering::Relaxed);
            kill_group(&child);
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(15));
    };
    let stdout = out.join().unwrap_or_default();
    let mut stderr = err.join().unwrap_or_default();
    if timed_out {
        stderr.push_str(&format!("\nStopped after {} s (time limit).", spec.timeout.as_secs()));
    } else if status.is_none() {
        stderr.push_str("\nStopped.");
    }
    Ok(StepOutput {
        command: display,
        stdout,
        stderr,
        exit_code: status.and_then(|s| s.code()).unwrap_or(-1),
        timed_out,
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lf-sbx-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sh(script: &str, project: &Path, home: &Path, timeout: u64) -> StepOutput {
        let policy = Policy { writable: vec![project.to_path_buf()], readable: vec![] };
        let sandbox = profile(&policy, home);
        let argv = vec!["/bin/sh".to_string(), "-c".to_string(), script.to_string()];
        let env = BTreeMap::from([("PATH".to_string(), "/usr/bin:/bin".to_string())]);
        run(Spec { argv: &argv, cwd: project, env: &env, sandbox: &sandbox, timeout: Duration::from_secs(timeout), cancel: Arc::default() }).unwrap()
    }

    #[test]
    fn writes_only_inside_the_project_and_reads_no_home_files() {
        let project = temp("project");
        let fake_home = temp("home");
        std::fs::write(fake_home.join("secret"), "token").unwrap();
        let outside = fake_home.join("written");
        let ok = sh("echo hi > inside.txt && cat inside.txt", &project, &fake_home, 10);
        assert_eq!(ok.exit_code, 0, "{ok:?}");
        let read = sh(&format!("cat {}", fake_home.join("secret").display()), &project, &fake_home, 10);
        assert_ne!(read.exit_code, 0);
        let write = sh(&format!("echo x > {}", outside.display()), &project, &fake_home, 10);
        assert_ne!(write.exit_code, 0);
        assert!(!outside.exists());
        let _ = std::fs::remove_dir_all(project);
        let _ = std::fs::remove_dir_all(fake_home);
    }

    #[test]
    fn has_no_internet_and_no_inherited_environment() {
        let project = temp("net");
        let home = temp("nethome");
        std::env::set_var("LF_SECRET_TEST", "leak");
        let env = sh("echo \"[$LF_SECRET_TEST]\"", &project, &home, 10);
        assert!(env.stdout.contains("[]"), "{env:?}");
        let net = sh("/usr/bin/curl -sS -m 5 https://example.com", &project, &home, 15);
        assert_ne!(net.exit_code, 0);
        let _ = std::fs::remove_dir_all(project);
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn stops_runaway_processes_and_their_children() {
        let project = temp("timeout");
        let home = temp("timeouthome");
        let started = Instant::now();
        let out = sh("sleep 30 & sleep 30", &project, &home, 1);
        assert!(out.timed_out && started.elapsed() < Duration::from_secs(5), "{out:?}");
        let _ = std::fs::remove_dir_all(project);
        let _ = std::fs::remove_dir_all(home);
    }
}
