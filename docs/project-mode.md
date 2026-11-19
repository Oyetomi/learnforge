# Project mode and the code workspace

One project built across a curriculum, in the learner's chosen language, with an IDE-style workspace.

## What the learner gets

1. **An explicit language.** The goal form has a *Code practice* language menu. A chosen language makes the plan a coding plan in that language; the model's own `practice_mode` or `language` cannot override it.
2. **One project across the course.** With *Build one project across the course*, the outline also defines a project and a `project_step` per unit (or none for a concepts-only unit). Steps are shown, and editable, before approval.
3. **Code that carries forward.** One workspace per topic, with folders (for example `wordcount/main.go`, `src/raft/log.rs`, `store/__init__.py`).
4. **Tests that accumulate.** Each step is prepared from the current files: a task, one new step test file, optional new stub files. Every run executes every step's tests; a later change that breaks an earlier step is reported as a regression.
5. **Pacing.** When the whole suite passes, the tutor reviews the implementation and asks one applied question. Passing tests does not approve readiness.
6. **An IDE.** File explorer with folders, breadcrumb, completion, live errors, hover documentation, go to definition across files (F12), rename (F2), formatting, signature help, find, folding. Errors from a run are also underlined at their file and line.

## Languages

Languages are data: `src/services/languages/profiles.json`, shared by the frontend and the native runner. A profile names its programs, file rules, run and step-test commands (argv templates, never shell strings), starter and config files, language server and the guides given to the tutor.

Built in: Go, Python, Rust, TypeScript, JavaScript, C, C++, Java, Ruby.

**Any other language:** add a profile to `languages.json` in the app's configuration folder (`~/Library/Application Support/com.oyetomi.learnforge/`). It uses the same schema; a custom id may not replace a built-in one. The webview cannot write that file, so a compromised page cannot add commands.

Step tests run one file at a time, so pass/fail per step comes from the exit code in every language. Go compiles all test files in a package together, so Go step tests must use `TestStageNN…`/`stageNN…` names and no top-level declarations; other languages have no naming rule.

## Where code runs

| | Mac app, toolchain installed | Mac app, not installed | Browser development build |
| --- | --- | --- | --- |
| Go | Locally, sandboxed | Go Playground | Go Playground |
| Other languages | Locally, sandboxed | Not runnable; Settings explains what to install | Not runnable |

The toolchain is found on the login shell's `PATH` plus common install folders. A language server counts as installed only if it answers `--version` (a rustup stub without the component does not).

### Sandbox (`src-tauri/src/sandbox.rs`)

Every run and every language server is started through `/usr/bin/sandbox-exec` with a generated profile:

- **No internet.** Network is denied except localhost (so multi-process exercises work).
- **Writes** only to the project folder (which holds `TMPDIR`) and the shared toolchain cache.
- **No reading** file contents under the home folder except the project, the cache, and each toolchain's own install folder (plus profile `readPaths` such as `~/.rustup`).
- **Clean environment.** The child gets a rebuilt environment (`PATH`, `HOME`, `TMPDIR`, profile variables); app secrets in the environment are not inherited.
- **Limits.** 60 s per command, 120 s per run, 256 KB output per stream; the whole process group is killed on timeout or Stop.
- **No arbitrary commands.** The webview sends a profile id and an action. Commands come only from profiles, and placeholders are expanded natively. An unknown placeholder or a program that is not an installed binary is refused. File paths must match the profile's patterns (relative, at most four segments, no dot segments) and are never written through symlinks.

`sandbox-exec` is deprecated by Apple but present and working on macOS 26.3. Step tests are model-written code; the sandbox limits what they can do, it does not make them trustworthy.

### Language servers (`src-tauri/src/lsp.rs`, `src/services/lsp/client.ts`, `src/components/editor/languageServer.ts`)

The server runs in the same sandbox, in the project folder. Messages are relayed between its stdio and the webview. A small LSP client keeps every project file open, sends edits in order before each request, and maps diagnostics, completion, hover, definition (switching files through the explorer), signature help, formatting and rename onto Monaco. Every project file has its own Monaco model, so cross-file features work. Servers stop when the workspace closes or the app quits.

## Data

`CurriculumPlan.project` and `CurriculumUnit.projectStep` are optional; older plans are unchanged. The workspace (`ProjectWorkspace`, `src/services/learning/project.ts`) is stored per topic in IndexedDB (`learnforge-projects`) and mirrored to `~/Library/Application Support/com.oyetomi.learnforge/projects/<topic>` when it runs locally. Deleting the topic deletes the workspace.

## Rules that keep steps composable

- A step may only add files; a proposed file at an existing path is dropped.
- Step test files follow the profile's name (`stage03_leader_election_test.go`, `tests/stage03_leader_election.rs`, `test_stage03_leader_election.py`, `Stage03Test.java`) and are read-only in the editor.
- Learners can add and delete their own files, in folders. Reset restores a file to how it was when the step began.

## Verification · 19 November 2026

- Native (`cargo test`, 18 tests): sandbox denies home reads, outside writes, internet and inherited environment; kills runaway process groups; a Go step fails then passes locally; a sandboxed clangd completes struct fields and reports errors; the full IPC round trip (camelCase arguments, a Go module with a subfolder package, step test and program output) through Tauri's mock runtime.
- Frontend (`npm test`): profiles, file rules, runtime choice, local-run aggregation and regressions, diagnostics parsing for Go/Rust/Python/C/Java/Ruby/Node, the LSP client, the explorer and step panel.
- Browser, real editor and project hook, with the Mac bridge replaced by a mock forwarding to a real sandboxed clangd: `s->` offers the struct's fields, a type error is underlined live, hover shows the signature, F12 opens the definition in another folder, new files in folders and delete work.
- Not yet exercised: the packaged Mac app end to end, and gopls (not installed on the test Mac).
