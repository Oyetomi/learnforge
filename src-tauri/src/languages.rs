//! Language profiles shared with the frontend (src/services/languages/profiles.json)
//! and discovery of the learner's installed toolchains.
//!
//! A profile is data: commands are argv templates with placeholders, never
//! shell strings. Custom profiles can be added by the learner in
//! `<app config dir>/languages.json`; the webview cannot write that file.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const BUILT_IN: &str = include_str!("../../src/services/languages/profiles.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaffoldFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileTool {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    pub commands: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub monaco: String,
    pub binaries: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    pub read_paths: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub scaffold: Vec<ScaffoldFile>,
    pub source_pattern: String,
    pub test_pattern: String,
    pub test_file: String,
    #[serde(default)]
    pub test_name_prefix: bool,
    pub entry: String,
    pub run: Vec<Vec<String>>,
    #[serde(default)]
    pub test: Vec<Vec<String>>,
    /// Single-invocation structured test suite (e.g. `go test -json ./...`), optional.
    #[serde(default)]
    pub test_batch: Vec<Vec<String>>,
    /// Explicit user-confirmed dependency fetch commands (e.g. `go mod tidy` / `go mod download`).
    #[serde(default)]
    pub fetch_deps: Vec<Vec<String>>,
    /// Compile-only check of one step's tests against the current files
    /// (nothing runs). Used before a prepared step is shown to the learner.
    #[serde(default)]
    pub check: Vec<Vec<String>>,
    #[serde(default)]
    pub tools: Vec<ProfileTool>,
    #[serde(default)]
    pub lsp: Vec<Vec<String>>,
    #[serde(default)]
    pub lsp_install: String,
    /// Arguments that make the language server print its version and exit 0.
    #[serde(default = "default_probe")]
    pub lsp_probe: Vec<String>,
    #[serde(default)]
    pub source_guide: String,
    #[serde(default)]
    pub test_guide: String,
    #[serde(default)]
    pub custom: bool,
}

fn default_probe() -> Vec<String> {
    vec!["--version".into()]
}

/// True when `program args` exits 0 within a few seconds. Catches stubs such
/// as a rustup proxy for a component that is not installed. Cached.
pub fn responds(program: &Path, args: &[String]) -> bool {
    static CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
    let key = format!("{} {}", program.display(), args.join(" "));
    let cache = CACHE.get_or_init(Default::default);
    if let Some(hit) = cache.lock().ok().and_then(|m| m.get(&key).copied()) {
        return hit;
    }
    let ok = (|| {
        let mut child = std::process::Command::new(program)
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .ok()?;
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            match child.try_wait() {
                Ok(Some(status)) => return Some(status.success()),
                Ok(None) if std::time::Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Some(false);
                }
            }
        }
    })()
    .unwrap_or(false);
    if ok {
        if let Ok(mut m) = cache.lock() {
            m.insert(key, true);
        }
    }
    ok
}

/// The first language-server command whose program is installed and works.
pub fn lsp_command(profile: &Profile) -> Option<(Vec<String>, PathBuf)> {
    profile.lsp.iter().find_map(|argv| {
        let name = argv[0].trim_start_matches('{').trim_end_matches('}');
        let path = profile.binaries.get(name).and_then(|c| resolve_binary(c))?;
        responds(&path, &profile.lsp_probe).then(|| (argv.clone(), path))
    })
}

impl Profile {
    fn validate(&self) -> Result<(), String> {
        let id_ok = !self.id.is_empty()
            && self.id.len() <= 32
            && self.id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-');
        if !id_ok {
            return Err(format!("Invalid language id {:?}.", self.id));
        }
        Regex::new(&self.source_pattern).map_err(|e| format!("{}: sourcePattern: {e}", self.id))?;
        Regex::new(&self.test_pattern).map_err(|e| format!("{}: testPattern: {e}", self.id))?;
        if self.run.is_empty()
            || self
                .run
                .iter()
                .chain(&self.test)
                .chain(&self.test_batch)
                .chain(&self.fetch_deps)
                .chain(&self.check)
                .chain(&self.lsp)
                .any(|argv| argv.is_empty())
        {
            return Err(format!("{}: every command needs a program.", self.id));
        }
        for s in &self.scaffold {
            if !safe_relative_path(&s.path) {
                return Err(format!("{}: unsafe scaffold path {:?}.", self.id, s.path));
            }
        }
        for tool in &self.tools {
            let tool_id_ok = !tool.id.is_empty()
                && tool.id.len() <= 32
                && tool.id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_' || c == b'-');
            if !tool_id_ok {
                return Err(format!("{}: invalid tool id {:?}.", self.id, tool.id));
            }
            if tool.label.trim().is_empty() {
                return Err(format!("{}: tool {:?} needs a label.", self.id, tool.id));
            }
            if tool.commands.is_empty() || tool.commands.iter().any(|argv| argv.is_empty()) {
                return Err(format!("{}: tool {:?} needs at least one non-empty command.", self.id, tool.id));
            }
        }
        Ok(())
    }

    pub fn is_source(&self, path: &str) -> bool {
        safe_relative_path(path) && matches(&self.source_pattern, path) && !matches(&self.test_pattern, path)
    }

    pub fn is_test(&self, path: &str) -> bool {
        safe_relative_path(path) && matches(&self.test_pattern, path)
    }
}

fn matches(pattern: &str, value: &str) -> bool {
    Regex::new(pattern).map(|r| r.is_match(value)).unwrap_or(false)
}

/// Relative, at most five segments of [A-Za-z0-9_.-], no dot segments.
pub fn safe_relative_path(path: &str) -> bool {
    let parts: Vec<&str> = path.split('/').collect();
    !path.is_empty()
        && path.len() <= 180
        && parts.len() <= 5
        && parts.iter().all(|p| {
            !p.is_empty()
                && *p != "."
                && *p != ".."
                && !p.starts_with('.')
                && p.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-' || c == b'.')
        })
}

/// Built-in profiles plus valid custom ones (a custom id may not replace a built-in).
pub fn load_profiles(config_dir: Option<&Path>) -> (Vec<Profile>, Vec<String>) {
    let mut problems = Vec::new();
    let mut profiles: Vec<Profile> = serde_json::from_str(BUILT_IN).expect("built-in language profiles are valid JSON");
    if let Some(path) = config_dir.map(|d| d.join("languages.json")) {
        if let Ok(text) = std::fs::read_to_string(&path) {
            match serde_json::from_str::<Vec<Profile>>(&text) {
                Ok(custom) => {
                    for mut p in custom {
                        if profiles.iter().any(|b| b.id == p.id) {
                            problems.push(format!("Custom language {:?} uses a built-in id; it was ignored.", p.id));
                            continue;
                        }
                        p.custom = true;
                        profiles.push(p);
                    }
                }
                Err(e) => problems.push(format!("languages.json could not be read: {e}")),
            }
        }
    }
    profiles.retain(|p| match p.validate() {
        Ok(()) => true,
        Err(e) => {
            problems.push(e);
            false
        }
    });
    (profiles, problems)
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

pub fn expand_home(path: &str) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => home().join(rest),
        None => PathBuf::from(path),
    }
}

/// Directories searched for toolchains. Apps launched from Finder get a
/// minimal PATH, so the login shell's PATH is read once, plus common
/// install locations.
pub fn search_dirs() -> &'static Vec<PathBuf> {
    static DIRS: OnceLock<Vec<PathBuf>> = OnceLock::new();
    DIRS.get_or_init(|| {
        let mut dirs: Vec<PathBuf> = Vec::new();
        let mut push = |p: PathBuf| {
            if p.is_absolute() && !dirs.contains(&p) {
                dirs.push(p);
            }
        };
        if let Some(path) = login_shell_path() {
            for p in path.split(':').filter(|p| !p.is_empty()) {
                push(PathBuf::from(p));
            }
        }
        for p in [
            "/opt/homebrew/bin", "/usr/local/bin", "/usr/local/go/bin", "~/.cargo/bin", "~/go/bin",
            "~/.local/bin", "/usr/bin", "/bin",
        ] {
            push(expand_home(p));
        }
        if let Some(path) = std::env::var_os("PATH") {
            for p in std::env::split_paths(&path) {
                push(p);
            }
        }
        dirs
    })
}

fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").ok().filter(|s| s.starts_with('/')).unwrap_or_else(|| "/bin/zsh".into());
    let mut child = std::process::Command::new(shell)
        .args(["-l", "-c", "printf %s \"$PATH\""])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let deadline = std::time::Instant::now() + Duration::from_secs(4);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let mut out = String::new();
    use std::io::Read;
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    Some(out.trim().to_string()).filter(|s| !s.is_empty())
}

/// First executable named `candidates` in the search dirs.
pub fn resolve_binary(candidates: &[String]) -> Option<PathBuf> {
    static CACHE: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
    let key = candidates.join("|");
    let cache = CACHE.get_or_init(Default::default);
    if let Some(hit) = cache.lock().ok()?.get(&key).cloned() {
        return Some(hit);
    }
    use std::os::unix::fs::PermissionsExt;
    let found = candidates.iter().filter(|c| !c.contains('/')).find_map(|name| {
        search_dirs().iter().map(|d| d.join(name)).find(|p| {
            std::fs::metadata(p).map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false)
        })
    });
    if let Some(ref path) = found {
        if let Ok(mut m) = cache.lock() {
            m.insert(key, path.clone());
        }
    }
    found
}

/// The install root of a resolved binary, so the sandbox may read it:
/// `<root>/bin/tool` -> `<root>`, otherwise the binary's directory.
/// Never returns `$HOME` or a top-level system root (e.g. for `~/bin/tool`),
/// which would nullify `$HOME` read isolation in `sandbox.rs`.
pub fn toolchain_root(binary: &Path) -> Option<PathBuf> {
    let real = std::fs::canonicalize(binary).ok()?;
    let dir = real.parent()?;
    let candidate = if dir.file_name().is_some_and(|n| n == "bin") {
        dir.parent()?.to_path_buf()
    } else {
        dir.to_path_buf()
    };
    let home_dir = std::fs::canonicalize(home()).unwrap_or_else(|_| home());
    if candidate == home_dir || candidate == Path::new("/") || candidate == Path::new("/Users") {
        return (dir != home_dir).then(|| dir.to_path_buf());
    }
    Some(candidate)
}

/// Binary placeholders ({go}, {cargo}…) used by a set of commands.
pub fn binary_placeholders<'a>(profile: &'a Profile, commands: &'a [Vec<String>]) -> Vec<&'a String> {
    profile
        .binaries
        .keys()
        .filter(|name| {
            let token = format!("{{{name}}}");
            commands.iter().flatten().any(|arg| arg == &token)
        })
        .collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStatus {
    #[serde(flatten)]
    pub profile: Profile,
    /// Every program needed to run and test is installed.
    pub runnable: bool,
    pub missing: Vec<String>,
    /// The language server that would be started, if one is installed.
    pub lsp_program: Option<String>,
}

pub fn status(profile: &Profile) -> ProfileStatus {
    let commands: Vec<Vec<String>> = profile.run.iter().chain(&profile.test).cloned().collect();
    let missing: Vec<String> = binary_placeholders(profile, &commands)
        .into_iter()
        .filter(|name| resolve_binary(&profile.binaries[*name]).is_none())
        .map(|name| profile.binaries[name].join(" or "))
        .collect();
    let lsp_program = lsp_command(profile).map(|(_, path)| path.display().to_string());
    ProfileStatus { runnable: missing.is_empty(), missing, lsp_program, profile: profile.clone() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_profiles_are_valid() {
        let (profiles, problems) = load_profiles(None);
        assert!(problems.is_empty(), "{problems:?}");
        assert!(profiles.len() >= 8);
        for p in &profiles {
            // Scaffold files are either app-owned config (go.mod, Cargo.toml) or
            // starter sources the learner edits (src/lib.rs); never step tests.
            for f in &p.scaffold {
                assert!(!p.is_test(&f.path), "{} scaffold {} must not be a test file", p.id, f.path);
            }
        }
    }

    #[test]
    fn source_and_test_paths_are_distinguished() {
        let (profiles, _) = load_profiles(None);
        let get = |id: &str| profiles.iter().find(|p| p.id == id).unwrap().clone();
        let go = get("go");
        assert!(go.is_source("store.go"));
        assert!(!go.is_source("stage01_x_test.go") && go.is_test("stage01_x_test.go"));
        assert!(!go.is_source("stage105_x_test.go") && go.is_test("stage105_x_test.go"));
        assert!(!go.is_source("api/stage01_x_test.go") && go.is_test("api/stage01_x_test.go"));
        for src in [
            "wordcount/main.go",
            "go.mod",
            "go.sum",
            "go.work",
            "wordcount/go.mod",
            "api/internal/handlers/handlers.go",
            "api/cmd/api/main.go",
            "chapter11/api/cmd/api/main.go",
            "test-config.json",
            "events.jsonl",
            "schemas/order.proto",
            "schemas/order.avsc",
            "migrations/001_events.sql",
            "config/broker.yaml",
            "config/broker.yml",
            "sample.txt",
            "testdata/feed.xml",
            "calculator_test.go",
            "api/internal/handlers/handlers_test.go",
        ] {
            assert!(go.is_source(src), "expected Go source: {src}");
            assert!(!go.is_test(src), "expected non-stage-test: {src}");
        }
        assert!(!go.is_source("a/b/c/d/e/f.go"));
        assert!(!go.is_source("notes.exe"));
        assert!(get("python").is_source("store/__init__.py") && get("rust").is_source("src/raft/log.rs"));
        let rust = get("rust");
        assert!(rust.is_source("src/raft.rs") && rust.is_test("tests/stage02_log.rs") && !rust.is_source("tests/stage02_log.rs"));
        let java = get("java");
        assert!(java.is_source("Store.java") && !java.is_source("Stage01Test.java") && java.is_test("Stage01Test.java"));
        let ts = get("typescript");
        assert!(ts.is_source("store.ts") && !ts.is_source("stage01_a.test.ts") && ts.is_test("stage01_a.test.ts"));
    }

    #[test]
    fn unsafe_paths_are_rejected() {
        let too_long = format!("{}.go", "a".repeat(180));
        for bad in [
            "../x.go",
            "/etc/passwd",
            "a/../b.go",
            ".git/config",
            ".hidden.go",
            "a//b.go",
            "a b.go",
            "a/b/c/d/e/f.go",
            "",
            too_long.as_str(),
        ] {
            assert!(!safe_relative_path(bad), "{bad}");
        }
        assert!(safe_relative_path("src/lib.rs"));
        assert!(safe_relative_path("api/internal/handlers/handlers.go"));
        assert!(safe_relative_path("chapter11/api/cmd/api/main.go"));
    }

    #[test]
    fn profile_tools_are_validated() {
        let (profiles, _) = load_profiles(None);
        let go = profiles.iter().find(|p| p.id == "go").unwrap().clone();
        let ids: Vec<&str> = go.tools.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec!["test_all", "race", "cover", "bench", "vet"]);

        let mut ok_profile = go.clone();
        ok_profile.tools = vec![ProfileTool {
            id: "fmt-check_1".into(),
            label: "Format check".into(),
            env: BTreeMap::new(),
            commands: vec![vec!["{go}".into(), "fmt".into(), "./...".into()]],
        }];
        assert!(ok_profile.validate().is_ok());

        for bad_tool in [
            ProfileTool { id: "".into(), label: "Empty id".into(), env: BTreeMap::new(), commands: vec![vec!["{go}".into()]] },
            ProfileTool { id: "BadId".into(), label: "Uppercase".into(), env: BTreeMap::new(), commands: vec![vec!["{go}".into()]] },
            ProfileTool { id: "has space".into(), label: "Space".into(), env: BTreeMap::new(), commands: vec![vec!["{go}".into()]] },
            ProfileTool { id: "a".repeat(33), label: "Too long".into(), env: BTreeMap::new(), commands: vec![vec!["{go}".into()]] },
            ProfileTool { id: "vet".into(), label: "   ".into(), env: BTreeMap::new(), commands: vec![vec!["{go}".into()]] },
            ProfileTool { id: "vet".into(), label: "No commands".into(), env: BTreeMap::new(), commands: vec![] },
            ProfileTool { id: "vet".into(), label: "Empty argv".into(), env: BTreeMap::new(), commands: vec![vec![]] },
        ] {
            let mut p = go.clone();
            p.tools = vec![bad_tool];
            assert!(p.validate().is_err());
        }
    }

    #[test]
    fn custom_profiles_cannot_replace_built_ins() {
        let dir = std::env::temp_dir().join(format!("lf-lang-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut custom: Vec<Profile> = serde_json::from_str(BUILT_IN).unwrap();
        custom.truncate(1);
        custom[0].lsp.clear();
        let mut zig = custom[0].clone();
        zig.id = "zig".into();
        custom.push(zig);
        std::fs::write(dir.join("languages.json"), serde_json::to_string(&custom).unwrap()).unwrap();
        let (profiles, problems) = load_profiles(Some(&dir));
        assert!(problems.iter().any(|p| p.contains("built-in id")));
        assert!(profiles.iter().any(|p| p.id == "zig" && p.custom));
        assert!(profiles.iter().find(|p| p.id == "go").is_some_and(|p| !p.custom && !p.lsp.is_empty()));
        let _ = std::fs::remove_dir_all(dir);
    }
}
