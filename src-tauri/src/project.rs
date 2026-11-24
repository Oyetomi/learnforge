//! Local project folders and sandboxed run/test commands (docs/project-mode.md).
//!
//! The webview names a profile and an action; it never supplies a program
//! or arguments. Files are written only at paths the profile allows.

use crate::languages::{self, Profile, ProfileStatus};
use crate::sandbox;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime, State};

const LEGACY_MANIFEST: &str = ".learnforge-files";
const MANIFEST_DIR: &str = ".learnforge-manifests";
const MAX_FILES: usize = 256;
const MAX_FILE_BYTES: usize = 200 * 1024;
const STEP_TIMEOUT: Duration = Duration::from_secs(60);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Default)]
pub struct Runs {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl Runs {
    fn lock_for(&self, track_id: &str) -> Result<Arc<Mutex<()>>, String> {
        let mut map = self.locks.lock().map_err(|_| "busy".to_string())?;
        Ok(map.entry(track_id.to_string()).or_insert_with(|| Arc::new(Mutex::new(()))).clone())
    }
}

/// Store the file manifest outside the sandbox-writable project folder so
/// untrusted code inside the sandbox cannot tamper with deletion targets.
fn manifest_path(dir: &Path) -> PathBuf {
    let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("project");
    dir.parent().unwrap_or(dir).join(MANIFEST_DIR).join(format!("{name}.files"))
}

/// Verify no path component under `dir` (existing ancestors or target) is a symlink.
fn safe_target(dir: &Path, rel: &str) -> Result<PathBuf, String> {
    if !languages::safe_relative_path(rel) {
        return Err(format!("{rel:?} is not a safe relative path."));
    }
    let mut cur = dir.to_path_buf();
    for part in rel.split('/') {
        cur.push(part);
        if std::fs::symlink_metadata(&cur).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(format!("{rel} crosses a symbolic link; refusing to touch it."));
        }
    }
    Ok(cur)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchDepsResult {
    pub exec: ExecResult,
    pub updated_files: Vec<ProjectFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub file_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRef {
    pub number: u32,
    pub test_file: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub steps: Vec<sandbox::StepOutput>,
    pub exit_code: i32,
    pub timed_out: bool,
    pub duration_ms: u64,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 100 && value.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn profiles<R: Runtime>(app: &AppHandle<R>) -> Vec<Profile> {
    languages::load_profiles(app.path().app_config_dir().ok().as_deref()).0
}

pub fn profile<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Profile, String> {
    profiles(app).into_iter().find(|p| p.id == id).ok_or_else(|| format!("Unknown language {id:?}."))
}

pub fn project_dir<R: Runtime>(app: &AppHandle<R>, track_id: &str) -> Result<PathBuf, String> {
    if !valid_id(track_id) {
        return Err("Invalid topic id.".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("projects").join(track_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create the project folder: {e}"))?;
    Ok(dir)
}

pub fn cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("toolchains");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Write the learner's files and the profile's config files; remove files
/// this app wrote earlier that are no longer in the project.
pub fn sync_files(dir: &Path, profile: &Profile, files: &[ProjectFile]) -> Result<(), String> {
    if files.len() > MAX_FILES {
        return Err("The project has too many files.".into());
    }
    let mut written: Vec<String> = Vec::new();
    for f in files {
        if !(profile.is_source(&f.path) || profile.is_test(&f.path)) {
            return Err(format!("{:?} is not a {} project file.", f.path, profile.name));
        }
        if f.content.len() > MAX_FILE_BYTES {
            return Err(format!("{} is too large.", f.path));
        }
        written.push(f.path.clone());
    }
    // Config files (Cargo.toml…) are always the profile's; a starter source the
    // workspace lacks (go.mod in a project saved before it was editable) is added.
    let config: Vec<&languages::ScaffoldFile> = profile
        .scaffold
        .iter()
        .filter(|s| !profile.is_source(&s.path) || !files.iter().any(|f| f.path == s.path))
        .collect();
    let all = files
        .iter()
        .map(|f| (f.path.as_str(), f.content.as_str()))
        .chain(config.iter().map(|s| (s.path.as_str(), s.content.as_str())));
    let canon_dir = std::fs::canonicalize(dir).map_err(|e| e.to_string())?;
    for (path, content) in all {
        let target = safe_target(dir, path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            let canon_parent = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
            if !canon_parent.starts_with(&canon_dir) {
                return Err(format!("{path} resolves outside the project folder."));
            }
        }
        if std::fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(format!("{path} is a link; refusing to write through it."));
        }
        if std::fs::read_to_string(&target).ok().as_deref() != Some(content) {
            std::fs::write(&target, content).map_err(|e| format!("Could not write {path}: {e}"))?;
        }
    }
    let manifest = manifest_path(dir);
    let legacy = dir.join(LEGACY_MANIFEST);
    let previous = std::fs::read_to_string(&manifest)
        .or_else(|_| std::fs::read_to_string(&legacy))
        .unwrap_or_default();
    for old in previous.lines().filter(|p| languages::safe_relative_path(p)) {
        if !written.iter().any(|w| w == old) {
            if let Ok(stale) = safe_target(dir, old) {
                if stale.parent().and_then(|p| std::fs::canonicalize(p).ok()).is_some_and(|p| p.starts_with(&canon_dir)) {
                    let _ = std::fs::remove_file(&stale);
                }
            }
        }
    }
    if std::fs::symlink_metadata(&legacy).is_ok_and(|m| m.file_type().is_file()) {
        let _ = std::fs::remove_file(&legacy);
    }
    if let Some(parent) = manifest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&manifest, written.join("\n")).map_err(|e| e.to_string())
}

fn sources(dir: &Path, profile: &Profile, spec: &str) -> Vec<String> {
    // {sources:.c,.h!main.c} -> learner sources with those extensions, minus excluded names.
    let (exts, exclude) = spec.split_once('!').unwrap_or((spec, ""));
    let exts: Vec<&str> = exts.split(',').filter(|e| !e.is_empty()).collect();
    let exclude: Vec<&str> = exclude.split(',').filter(|e| !e.is_empty()).collect();
    let listed = std::fs::read_to_string(manifest_path(dir))
        .or_else(|_| std::fs::read_to_string(dir.join(LEGACY_MANIFEST)))
        .unwrap_or_default();
    let mut out: Vec<String> = listed
        .lines()
        .filter(|p| profile.is_source(p) && exts.iter().any(|e| p.ends_with(e)) && !exclude.contains(p))
        .map(String::from)
        .collect();
    out.sort();
    out
}

fn tests_in_manifest(dir: &Path, profile: &Profile) -> Vec<String> {
    let listed = std::fs::read_to_string(manifest_path(dir))
        .or_else(|_| std::fs::read_to_string(dir.join(LEGACY_MANIFEST)))
        .unwrap_or_default();
    let mut out: Vec<String> = listed
        .lines()
        .filter(|p| profile.is_test(p) && dir.join(p).is_file())
        .map(String::from)
        .collect();
    out.sort();
    out
}

pub struct Context<'a> {
    pub dir: &'a Path,
    pub cache: &'a Path,
    pub profile: &'a Profile,
    pub stage: Option<&'a StageRef>,
}

/// Expand an argv template. Unknown placeholders are an error, never passed through.
pub fn expand(argv: &[String], ctx: &Context) -> Result<Vec<String>, String> {
    let tmp = ctx.dir.join(".lf-tmp");
    let nn = ctx.stage.map(|s| format!("{:02}", s.number)).unwrap_or_default();
    let test_file = ctx.stage.map(|s| s.test_file.clone()).unwrap_or_default();
    let test_stem = Path::new(&test_file).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut out = Vec::new();
    for (i, arg) in argv.iter().enumerate() {
        if arg == "{tests}" {
            let list = tests_in_manifest(ctx.dir, ctx.profile);
            if list.is_empty() {
                return Err("The project has no step test files yet.".into());
            }
            out.extend(list);
            continue;
        }
        if arg == "{testStems}" {
            let list: Vec<String> = tests_in_manifest(ctx.dir, ctx.profile)
                .into_iter()
                .filter_map(|p| Path::new(&p).file_stem().map(|s| s.to_string_lossy().into_owned()))
                .collect();
            if list.is_empty() {
                return Err("The project has no step test files yet.".into());
            }
            out.extend(list);
            continue;
        }
        if let Some(spec) = arg.strip_prefix("{sources:").and_then(|s| s.strip_suffix('}')) {
            out.extend(sources(ctx.dir, ctx.profile, spec));
            continue;
        }
        if let Some(name) = arg.strip_prefix('{').and_then(|s| s.strip_suffix('}')).filter(|n| ctx.profile.binaries.contains_key(*n)) {
            let path = languages::resolve_binary(&ctx.profile.binaries[name])
                .ok_or_else(|| format!("{} is not installed.", ctx.profile.binaries[name].join(" or ")))?;
            out.push(path.display().to_string());
            continue;
        }
        let expanded = arg
            .replace("{nn}", &nn)
            .replace("{testFile}", &test_file)
            .replace("{testStem}", &test_stem)
            .replace("{tmp}", &tmp.display().to_string())
            .replace("{project}", &ctx.dir.display().to_string())
            .replace("{cache}", &ctx.cache.display().to_string());
        if expanded.contains('{') && expanded.contains('}') {
            return Err(format!("Unknown placeholder in {:?}.", arg));
        }
        if i == 0 && !(expanded.starts_with(&tmp.display().to_string())) {
            return Err("A command must start with an installed program.".into());
        }
        out.push(expanded);
    }
    Ok(out)
}

pub fn environment(ctx: &Context) -> BTreeMap<String, String> {
    let path = languages::search_dirs().iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(":");
    let tmp = ctx.dir.join(".lf-tmp");
    let mut env = BTreeMap::from([
        ("PATH".to_string(), path),
        ("HOME".to_string(), std::env::var("HOME").unwrap_or_else(|_| "/".into())),
        ("TMPDIR".to_string(), format!("{}/", tmp.display())),
        ("LANG".to_string(), "en_US.UTF-8".to_string()),
        ("TERM".to_string(), "dumb".to_string()),
        ("NO_COLOR".to_string(), "1".to_string()),
    ]);
    for (k, v) in &ctx.profile.env {
        env.insert(k.clone(), v.replace("{project}", &ctx.dir.display().to_string()).replace("{cache}", &ctx.cache.display().to_string()));
    }
    env
}

pub fn policy(ctx: &Context) -> sandbox::Policy {
    let mut readable: Vec<PathBuf> = ctx.profile.read_paths.iter().map(|p| languages::expand_home(p)).collect();
    for candidates in ctx.profile.binaries.values() {
        if let Some(root) = languages::resolve_binary(candidates).and_then(|b| languages::toolchain_root(&b)) {
            readable.push(root);
        }
    }
    sandbox::Policy { writable: vec![ctx.dir.to_path_buf(), ctx.cache.to_path_buf()], readable }
}

#[cfg(test)]
pub fn execute(ctx: &Context, commands: &[Vec<String>], cancel: Arc<AtomicBool>) -> Result<ExecResult, String> {
    execute_with_options(ctx, commands, None, false, cancel)
}

pub fn execute_with_options(
    ctx: &Context,
    commands: &[Vec<String>],
    extra_env: Option<&BTreeMap<String, String>>,
    allow_network: bool,
    cancel: Arc<AtomicBool>,
) -> Result<ExecResult, String> {
    std::fs::create_dir_all(ctx.dir.join(".lf-tmp")).map_err(|e| e.to_string())?;
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    let sandbox_profile = sandbox::profile_with_network(&policy(ctx), &home, allow_network);
    let mut env = environment(ctx);
    if let Some(overrides) = extra_env {
        for (k, v) in overrides {
            env.insert(
                k.clone(),
                v.replace("{project}", &ctx.dir.display().to_string())
                    .replace("{cache}", &ctx.cache.display().to_string()),
            );
        }
    }
    let start = Instant::now();
    let mut steps = Vec::new();
    for template in commands {
        let argv = expand(template, ctx)?;
        let left = TOTAL_TIMEOUT.saturating_sub(start.elapsed());
        let step = sandbox::run(sandbox::Spec {
            argv: &argv,
            cwd: ctx.dir,
            env: &env,
            sandbox: &sandbox_profile,
            timeout: STEP_TIMEOUT.min(left),
            cancel: cancel.clone(),
        })?;
        let failed = step.exit_code != 0;
        steps.push(step);
        if failed {
            break;
        }
    }
    let last = steps.last();
    Ok(ExecResult {
        exit_code: last.map(|s| s.exit_code).unwrap_or(-1),
        timed_out: steps.iter().any(|s| s.timed_out),
        duration_ms: start.elapsed().as_millis() as u64,
        steps,
    })
}

#[tauri::command]
pub async fn language_profiles<R: Runtime>(app: AppHandle<R>) -> Result<Vec<ProfileStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !Path::new(sandbox::SANDBOX_EXEC).exists() {
            return Err("Local runs need macOS sandbox-exec, which was not found.".to_string());
        }
        Ok(profiles(&app).iter().map(languages::status).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn project_sync<R: Runtime>(
    app: AppHandle<R>,
    runs: State<'_, Runs>,
    track_id: String,
    profile_id: String,
    files: Vec<ProjectFile>,
) -> Result<String, String> {
    let lock = runs.lock_for(&track_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| "busy".to_string())?;
        let profile = profile(&app, &profile_id)?;
        let dir = project_dir(&app, &track_id)?;
        sync_files(&dir, &profile, &files)?;
        Ok(dir.display().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn project_delete<R: Runtime>(app: AppHandle<R>, runs: State<'_, Runs>, track_id: String) -> Result<(), String> {
    if !valid_id(&track_id) {
        return Err("Invalid topic id.".into());
    }
    let lock = runs.lock_for(&track_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| "busy".to_string())?;
        let base = app.path().app_data_dir().map_err(|e| e.to_string())?.join("projects");
        let dir = base.join(&track_id);
        let manifest = manifest_path(&dir);
        if manifest.exists() {
            let _ = std::fs::remove_file(&manifest);
        }
        if dir.exists() {
            std::fs::remove_dir_all(&dir).map_err(|e| format!("Could not remove the project folder: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn find_tool<'a>(profile: &'a Profile, tool_id: Option<&str>) -> Result<&'a languages::ProfileTool, String> {
    let id = tool_id.ok_or_else(|| "Unknown tool action.".to_string())?;
    profile
        .tools
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| "Unknown tool action.".to_string())
}

#[cfg(test)]
fn tool_commands(profile: &Profile, tool_id: Option<&str>) -> Result<Vec<Vec<String>>, String> {
    find_tool(profile, tool_id).map(|t| t.commands.clone())
}

fn sanitize_export_name(raw: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in raw.trim().chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() || lower == '_' {
            slug.push(lower);
            prev_dash = false;
        } else if !prev_dash && !slug.is_empty() {
            slug.push('-');
            prev_dash = true;
        }
        if slug.len() >= 64 {
            break;
        }
    }
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "learnforge-project".to_string()
    } else {
        trimmed
    }
}

/// Export validated project files into a fresh folder under `base_dir` without
/// overwriting existing directories or traversing symlinks.
pub fn export_files_to_dir(
    base_dir: &Path,
    export_name: &str,
    profile: &Profile,
    files: &[ProjectFile],
) -> Result<ExportResult, String> {
    if files.is_empty() {
        return Err("The project has no files to export yet.".into());
    }
    if files.len() > MAX_FILES {
        return Err("The project has too many files.".into());
    }
    for f in files {
        if !(profile.is_source(&f.path) || profile.is_test(&f.path)) {
            return Err(format!("{:?} is not a {} project file.", f.path, profile.name));
        }
        if f.content.len() > MAX_FILE_BYTES {
            return Err(format!("{} is too large.", f.path));
        }
    }
    std::fs::create_dir_all(base_dir).map_err(|e| format!("Could not access export folder: {e}"))?;
    let base_name = sanitize_export_name(export_name);
    let mut dest = base_dir.join(&base_name);
    let mut suffix = 2u32;
    while dest.exists() {
        if suffix > 999 {
            return Err("Too many exported folders with that name.".into());
        }
        dest = base_dir.join(format!("{base_name}-{suffix}"));
        suffix += 1;
    }
    std::fs::create_dir_all(&dest).map_err(|e| format!("Could not create export folder: {e}"))?;
    let canon_dest = std::fs::canonicalize(&dest).map_err(|e| e.to_string())?;
    let config: Vec<&languages::ScaffoldFile> = profile
        .scaffold
        .iter()
        .filter(|s| !files.iter().any(|f| f.path == s.path))
        .collect();
    let all: Vec<(&str, &str)> = files
        .iter()
        .map(|f| (f.path.as_str(), f.content.as_str()))
        .chain(config.iter().map(|s| (s.path.as_str(), s.content.as_str())))
        .collect();
    let mut count = 0usize;
    for (path, content) in all {
        let target = safe_target(&dest, path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            let canon_parent = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
            if !canon_parent.starts_with(&canon_dest) {
                return Err(format!("{path} resolves outside the export folder."));
            }
        }
        if std::fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(format!("{path} is a link; refusing to write through it."));
        }
        std::fs::write(&target, content).map_err(|e| format!("Could not export {path}: {e}"))?;
        count += 1;
    }
    Ok(ExportResult { path: dest.display().to_string(), file_count: count })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn project_exec<R: Runtime>(
    app: AppHandle<R>,
    runs: State<'_, Runs>,
    track_id: String,
    profile_id: String,
    action: String,
    stage: Option<StageRef>,
    request_id: String,
    tool_id: Option<String>,
) -> Result<ExecResult, String> {
    if !valid_id(&request_id) {
        return Err("Invalid request id.".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = runs.active.lock().map_err(|_| "busy")?;
        if active.contains_key(&request_id) {
            return Err("That run request is already active.".into());
        }
        active.insert(request_id.clone(), cancel.clone());
    }
    let lock = runs.lock_for(&track_id)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| "busy".to_string())?;
        let profile = profile(&app, &profile_id)?;
        let dir = project_dir(&app, &track_id)?;
        let cache = cache_dir(&app)?;
        let mut tool_env: Option<BTreeMap<String, String>> = None;
        let commands = match action.as_str() {
            "run" => profile.run.clone(),
            "test_batch" => profile.test_batch.clone(),
            "test" | "check" => {
                let s = stage.as_ref().ok_or("A test run needs a step.")?;
                if !profile.is_test(&s.test_file) || !dir.join(&s.test_file).is_file() || s.number == 0 || s.number > 999 {
                    return Err("That step's test file is not in the project.".to_string());
                }
                if action == "check" {
                    // Languages without a compile step have nothing to check.
                    if profile.check.is_empty() {
                        return Ok(ExecResult { steps: vec![], exit_code: 0, timed_out: false, duration_ms: 0 });
                    }
                    profile.check.clone()
                } else {
                    profile.test.clone()
                }
            }
            "tool" => {
                let tool = find_tool(&profile, tool_id.as_deref())?;
                if !tool.env.is_empty() {
                    tool_env = Some(tool.env.clone());
                }
                tool.commands.clone()
            }
            _ => return Err("Unknown action.".into()),
        };
        if commands.is_empty() {
            return Err(format!("{} has no {action} command.", profile.name));
        }
        execute_with_options(
            &Context { dir: &dir, cache: &cache, profile: &profile, stage: stage.as_ref() },
            &commands,
            tool_env.as_ref(),
            false,
            cancel,
        )
    })
    .await
    .map_err(|e| e.to_string());
    if let Ok(mut map) = runs.active.lock() {
        map.remove(&request_id);
    }
    result?
}

/// Explicitly fetch declared project dependencies (e.g. `go mod tidy` + `go mod download`).
/// Runs inside the macOS sandbox with home-read and write isolation preserved; only
/// network access is enabled so module archives can be cached in the toolchain cache,
/// while regular test/run commands remain strictly offline.
#[tauri::command]
pub async fn project_fetch_deps<R: Runtime>(
    app: AppHandle<R>,
    runs: State<'_, Runs>,
    track_id: String,
    profile_id: String,
    request_id: String,
) -> Result<FetchDepsResult, String> {
    if !valid_id(&request_id) {
        return Err("Invalid request id.".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = runs.active.lock().map_err(|_| "busy")?;
        if active.contains_key(&request_id) {
            return Err("That run request is already active.".into());
        }
        active.insert(request_id.clone(), cancel.clone());
    }
    let lock = runs.lock_for(&track_id)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| "busy".to_string())?;
        let profile = profile(&app, &profile_id)?;
        if profile.fetch_deps.is_empty() {
            return Err(format!("{} does not support dependency fetching.", profile.name));
        }
        let dir = project_dir(&app, &track_id)?;
        let cache = cache_dir(&app)?;
        let fetch_env = (!profile.fetch_deps_env.is_empty()).then_some(&profile.fetch_deps_env);
        let exec = execute_with_options(
            &Context { dir: &dir, cache: &cache, profile: &profile, stage: None },
            &profile.fetch_deps,
            fetch_env,
            true,
            cancel,
        )?;
        let mut updated_files = Vec::new();
        for name in [
            "go.mod",
            "go.sum",
            "go.work",
            "Cargo.toml",
            "Cargo.lock",
            "package.json",
            "package-lock.json",
            "requirements.txt",
            "Gemfile",
            "Gemfile.lock",
        ] {
            if !profile.is_source(name) {
                continue;
            }
            let path = dir.join(name);
            if path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if content.len() <= MAX_FILE_BYTES {
                        updated_files.push(ProjectFile { path: name.to_string(), content });
                    }
                }
            }
        }
        Ok(FetchDepsResult { exec, updated_files })
    })
    .await
    .map_err(|e| e.to_string());
    if let Ok(mut map) = runs.active.lock() {
        map.remove(&request_id);
    }
    result?
}

/// Export the project workspace as a clean standalone folder in Downloads.
#[tauri::command]
pub async fn project_export<R: Runtime>(
    app: AppHandle<R>,
    runs: State<'_, Runs>,
    track_id: String,
    profile_id: String,
    export_name: String,
    files: Vec<ProjectFile>,
    reveal: Option<bool>,
) -> Result<ExportResult, String> {
    if !valid_id(&track_id) {
        return Err("Invalid topic id.".into());
    }
    let lock = runs.lock_for(&track_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| "busy".to_string())?;
        let profile = profile(&app, &profile_id)?;
        let base = app
            .path()
            .download_dir()
            .or_else(|_| app.path().desktop_dir())
            .or_else(|_| app.path().document_dir())
            .map_err(|e| format!("Could not locate Downloads folder: {e}"))?;
        let exported = export_files_to_dir(&base, &export_name, &profile, &files)?;
        #[cfg(target_os = "macos")]
        if reveal.unwrap_or(false) {
            let _ = std::process::Command::new("/usr/bin/open")
                .args(["-R", &exported.path])
                .spawn();
        }
        #[cfg(not(target_os = "macos"))]
        let _ = reveal;
        Ok(exported)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn project_cancel(runs: State<'_, Runs>, request_id: String) {
    if let Some(flag) = runs.active.lock().ok().and_then(|m| m.get(&request_id).cloned()) {
        flag.store(true, Ordering::Relaxed);
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    fn get(id: &str) -> Profile {
        languages::load_profiles(None).0.into_iter().find(|p| p.id == id).unwrap()
    }

    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("lf-proj-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (dir, cache) = (base.join("project"), base.join("cache"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::create_dir_all(&cache).unwrap();
        (dir, cache)
    }

    fn file(path: &str, content: &str) -> ProjectFile {
        ProjectFile { path: path.into(), content: content.into() }
    }

    #[test]
    fn sync_rejects_foreign_paths_and_removes_stale_files() {
        let (dir, _) = fixture("sync");
        let go = get("go");
        assert!(sync_files(&dir, &go, &[file("../escape.go", "")]).is_err());
        assert!(sync_files(&dir, &go, &[file("notes.exe", "")]).is_err());
        assert!(sync_files(&dir, &go, &[file(".hidden.go", "")]).is_err());
        assert!(sync_files(&dir, &go, &[file("a/b/c/d/e/f.go", "")]).is_err());
        sync_files(
            &dir,
            &go,
            &[
                file("a.go", "package main"),
                file("b.go", "package main"),
                file("sample.txt", "hello"),
                file("test-config.json", "{}"),
                file("calculator_test.go", "package main"),
                file("api/internal/handlers/handlers.go", "package handlers"),
            ],
        )
        .unwrap();
        assert!(dir.join("go.mod").is_file());
        assert!(dir.join("sample.txt").is_file());
        assert!(dir.join("api/internal/handlers/handlers.go").is_file());
        // Manifest must live outside the sandbox-writable project directory.
        assert!(!dir.join(LEGACY_MANIFEST).exists());
        assert!(manifest_path(&dir).is_file());
        sync_files(&dir, &go, &[file("a.go", "package main")]).unwrap();
        assert!(dir.join("a.go").is_file() && !dir.join("b.go").exists());

        // Directory symlink inside the project must never allow writes outside.
        let outside = dir.parent().unwrap().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("sub")).unwrap();
        assert!(sync_files(&dir, &go, &[file("sub/evil.go", "package sub")]).is_err());
        assert!(!outside.join("evil.go").exists());
    }

    #[test]
    fn tool_lookup_requires_known_profile_tool() {
        let go = get("go");
        assert!(tool_commands(&go, Some("test_all")).is_ok());
        assert!(tool_commands(&go, Some("race")).is_ok());
        assert!(tool_commands(&go, Some("cover")).is_ok());
        assert!(tool_commands(&go, Some("bench")).is_ok());
        assert!(tool_commands(&go, Some("vet")).is_ok());
        assert_eq!(find_tool(&go, Some("race")).unwrap().env.get("CGO_ENABLED").map(String::as_str), Some("1"));
        assert_eq!(tool_commands(&go, None), Err("Unknown tool action.".to_string()));
        assert_eq!(tool_commands(&go, Some("unknown")), Err("Unknown tool action.".to_string()));
    }

    #[test]
    fn templates_cannot_smuggle_programs_or_placeholders() {
        let (dir, cache) = fixture("expand");
        let go = get("go");
        let ctx = Context { dir: &dir, cache: &cache, profile: &go, stage: None };
        assert!(expand(&["/bin/sh".into()], &ctx).is_err());
        assert!(expand(&["{go}".into(), "{secret}".into()], &ctx).is_err() || languages::resolve_binary(&go.binaries["go"]).is_none());
    }

    /// Runs only where Go is installed; proves a step-by-step test cycle locally.
    #[test]
    fn go_stage_tests_run_locally_and_report_by_exit_code() {
        let go = get("go");
        if languages::resolve_binary(&go.binaries["go"]).is_none() {
            return;
        }
        let (dir, cache) = fixture("go");
        let store = "package main\n\nfunc Add(a, b int) int { return a - b }\n";
        let test = "package main\n\nimport \"testing\"\n\nfunc TestStage01Add(t *testing.T) {\n\tif Add(2, 2) != 4 {\n\t\tt.Fatal(\"Add(2, 2) != 4\")\n\t}\n}\n";
        let main = "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Println(Add(1, 2)) }\n";
        let stage = StageRef { number: 1, test_file: "stage01_add_test.go".into() };
        let run = |files: &[ProjectFile]| {
            sync_files(&dir, &go, files).unwrap();
            execute(&Context { dir: &dir, cache: &cache, profile: &go, stage: Some(&stage) }, &go.test, Arc::default()).unwrap()
        };
        let failing = run(&[file("main.go", main), file("store.go", store), file(&stage.test_file, test)]);
        assert_ne!(failing.exit_code, 0, "{failing:?}");
        assert!(failing.steps[0].stdout.contains("Add(2, 2) != 4"), "{failing:?}");
        let passing = run(&[file("main.go", main), file("store.go", &store.replace("a - b", "a + b")), file(&stage.test_file, test)]);
        assert_eq!(passing.exit_code, 0, "{passing:?}");
        let program = execute(&Context { dir: &dir, cache: &cache, profile: &go, stage: None }, &go.run, Arc::default()).unwrap();
        assert_eq!(program.steps[0].stdout.trim(), "3", "{program:?}");
        let vet_cmds = tool_commands(&go, Some("vet")).unwrap();
        let vet = execute(&Context { dir: &dir, cache: &cache, profile: &go, stage: None }, &vet_cmds, Arc::default()).unwrap();
        assert_eq!(vet.exit_code, 0, "{vet:?}");
        let all_cmds = tool_commands(&go, Some("test_all")).unwrap();
        let all = execute(&Context { dir: &dir, cache: &cache, profile: &go, stage: None }, &all_cmds, Arc::default()).unwrap();
        assert_eq!(all.exit_code, 0, "{all:?}");
        assert!(all.steps[0].stdout.contains("TestStage01Add"), "{all:?}");
        let batch = execute(&Context { dir: &dir, cache: &cache, profile: &go, stage: None }, &go.test_batch, Arc::default()).unwrap();
        assert_eq!(batch.exit_code, 0, "{batch:?}");
        assert!(batch.steps[0].stdout.contains("\"Test\":\"TestStage01Add\""), "{batch:?}");
        let race_tool = find_tool(&go, Some("race")).unwrap();
        let race = execute_with_options(
            &Context { dir: &dir, cache: &cache, profile: &go, stage: None },
            &race_tool.commands,
            Some(&race_tool.env),
            false,
            Arc::default(),
        )
        .unwrap();
        assert_eq!(race.exit_code, 0, "{race:?}");
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn export_writes_clean_deduplicated_folder_and_rejects_bad_paths() {
        let (dir, _) = fixture("export");
        let go = get("go");
        let files = vec![
            file("main.go", "package main\nfunc main() {}\n"),
            file("internal/broker/log.go", "package broker\n"),
            file("schemas/event.proto", "syntax = \"proto3\";\n"),
        ];
        let first = export_files_to_dir(&dir, "Event Broker (Go)!", &go, &files).unwrap();
        assert!(first.path.ends_with("event-broker-go"), "{first:?}");
        assert_eq!(first.file_count, 4); // 3 files + scaffold go.mod
        assert!(Path::new(&first.path).join("go.mod").is_file());
        assert!(Path::new(&first.path).join("internal/broker/log.go").is_file());
        assert!(Path::new(&first.path).join("schemas/event.proto").is_file());

        let second = export_files_to_dir(&dir, "Event Broker (Go)!", &go, &files).unwrap();
        assert!(second.path.ends_with("event-broker-go-2"), "{second:?}");
        assert!(export_files_to_dir(&dir, "bad", &go, &[file("../escape.go", "")]).is_err());
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn sync_supports_more_than_64_files_and_three_digit_stages() {
        let (dir, _) = fixture("many");
        let go = get("go");
        let mut files: Vec<ProjectFile> = (1..=80)
            .map(|i| file(&format!("pkg/file_{i}.go"), "package pkg\n"))
            .collect();
        files.push(file("stage105_stream_join_test.go", "package main\n"));
        sync_files(&dir, &go, &files).unwrap();
        assert!(dir.join("pkg/file_80.go").is_file());
        assert!(dir.join("stage105_stream_join_test.go").is_file());
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn multi_language_batch_tests_and_java_packages_run_inside_sandbox() {
        // Python batch unittest with {testStems}
        let py = get("python");
        if languages::resolve_binary(&py.binaries["python"]).is_some() {
            let (dir, cache) = fixture("py-batch");
            sync_files(
                &dir,
                &py,
                &[
                    file("broker/log.py", "def count(items): return len(items)\n"),
                    file("broker/__init__.py", ""),
                    file(
                        "test_stage01_log.py",
                        "import unittest\nfrom broker.log import count\nclass T(unittest.TestCase):\n    def test_ok(self): self.assertEqual(count([1, 2]), 2)\n",
                    ),
                    file(
                        "test_stage02_fail.py",
                        "import unittest\nclass T(unittest.TestCase):\n    def test_fail(self): self.assertEqual(1, 2)\n",
                    ),
                ],
            )
            .unwrap();
            let res = execute(&Context { dir: &dir, cache: &cache, profile: &py, stage: None }, &py.test_batch, Arc::default()).unwrap();
            assert_ne!(res.exit_code, 0, "{res:?}");
            assert!(res.steps[0].stderr.contains("test_stage01_log"), "{res:?}");
            assert!(res.steps[0].stderr.contains("test_stage02_fail"), "{res:?}");
            let _ = std::fs::remove_dir_all(dir.parent().unwrap());
        }

        // TypeScript batch node:test junit with {tests}
        let ts = get("typescript");
        if languages::resolve_binary(&ts.binaries["node"]).is_some() {
            let (dir, cache) = fixture("ts-batch");
            sync_files(
                &dir,
                &ts,
                &[
                    file("internal/log.ts", "export function add(a: number, b: number): number { return a + b; }\n"),
                    file(
                        "stage01_add.test.ts",
                        "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { add } from \"./internal/log.ts\";\ntest(\"adds\", () => { assert.equal(add(2, 3), 5); });\n",
                    ),
                    file(
                        "stage02_fail.test.ts",
                        "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\ntest(\"fails\", () => { assert.equal(1, 2); });\n",
                    ),
                ],
            )
            .unwrap();
            let res = execute(&Context { dir: &dir, cache: &cache, profile: &ts, stage: None }, &ts.test_batch, Arc::default()).unwrap();
            assert_ne!(res.exit_code, 0, "{res:?}");
            assert!(res.steps[0].stdout.contains("stage01_add.test.ts"), "{res:?}");
            assert!(res.steps[0].stdout.contains("stage02_fail.test.ts"), "{res:?}");
            let _ = std::fs::remove_dir_all(dir.parent().unwrap());
        }

        // Rust batch cargo test --offline --no-fail-fast --tests with CARGO_HOME in cache
        let rs = get("rust");
        if languages::resolve_binary(&rs.binaries["cargo"]).is_some() {
            let (dir, cache) = fixture("rs-batch");
            sync_files(
                &dir,
                &rs,
                &[
                    file("src/lib.rs", "pub mod broker;\n"),
                    file("src/broker.rs", "pub fn count() -> usize { 2 }\n"),
                    file("src/main.rs", "fn main() {}\n"),
                    file("tests/stage01_broker.rs", "#[test] fn ok() { assert_eq!(learnforge_project::broker::count(), 2); }\n"),
                    file("tests/stage02_fail.rs", "#[test] fn boom() { assert_eq!(learnforge_project::broker::count(), 9); }\n"),
                ],
            )
            .unwrap();
            let res = execute(&Context { dir: &dir, cache: &cache, profile: &rs, stage: None }, &rs.test_batch, Arc::default()).unwrap();
            assert_ne!(res.exit_code, 0, "{res:?}");
            assert!(res.steps[0].stderr.contains("Running tests/stage01_broker.rs"), "{res:?}");
            assert!(res.steps[0].stderr.contains("Running tests/stage02_fail.rs"), "{res:?}");
            let _ = std::fs::remove_dir_all(dir.parent().unwrap());
        }

        // Java subpackage compilation inside sandbox
        let java = get("java");
        // macOS ships /usr/bin/javac and /usr/bin/java as stubs that fail without a JDK
        // (as on CI runners), so require both to actually run.
        let runs = |name: &str| {
            languages::resolve_binary(&java.binaries[name])
                .is_some_and(|p| languages::responds(&p, &["-version".to_string()]))
        };
        if runs("javac") && runs("java") {
            let (dir, cache) = fixture("java-pkg");
            let stage = StageRef { number: 1, test_file: "Stage01Test.java".into() };
            sync_files(
                &dir,
                &java,
                &[
                    file("broker/EventLog.java", "package broker;\npublic class EventLog { public static int size() { return 4; } }\n"),
                    file("Stage01Test.java", "import broker.EventLog;\npublic class Stage01Test { public static void main(String[] a) { if (EventLog.size() != 4) System.exit(1); } }\n"),
                ],
            )
            .unwrap();
            let res = execute(&Context { dir: &dir, cache: &cache, profile: &java, stage: Some(&stage) }, &java.test, Arc::default()).unwrap();
            assert_eq!(res.exit_code, 0, "{res:?}");
            let _ = std::fs::remove_dir_all(dir.parent().unwrap());
        }
    }
}
