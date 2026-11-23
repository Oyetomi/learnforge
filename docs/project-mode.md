# Project mode and the code workspace

One project built across a curriculum, in the learner's chosen language, with an IDE-style workspace.

## What the learner gets

1. **An explicit language.** The goal form has a *Code practice* language menu. A chosen language makes the plan a coding plan in that language; the model's own `practice_mode` or `language` cannot override it.
2. **One or multiple projects across the course.** With *Build a project*, you can let LearnForge match the book/goal, enforce one continuous codebase, or split major parts into multiple focused projects (up to 12) — and add, split, or reassign projects during outline review. Each coding unit defines a `project_step` (or none for concepts-only units), editable before approval.
3. **Code that carries forward.** One workspace per project (up to 80 learner source files and 256 synced files including stage tests), with folders up to 4 levels deep across every built-in language (for example `internal/broker/log.go`, `src/broker/log.rs`, `broker/EventLog.java`, `store/__init__.py`) and schema/config fixtures (`.json`, `.jsonl`, `.yaml`, `.sql`, `.proto`, `.avsc`). When large codebases exceed the prompt context budget (80 KB), active and recent files keep full bodies while older unchanged files are summarized to their exported API skeletons (with lockfiles deprioritized).
4. **Tests that accumulate (fast batch runs + workspace tools).** Each step is prepared from the current files: a task, one new step test file (supporting 2–3 digit stages up to 999), optional new stub files. Go (`go test -json`), Rust (`cargo test --offline --no-fail-fast --tests`), Python (`python3 -m unittest -v`), and TypeScript/JavaScript (`node --test --test-reporter=junit`) execute all stages in a single batch invocation and report pass/fail/regressions per step; C, C++, Java, and Ruby run each step file in sequence. Every built-in language includes workspace tools (`Race detector`/`go vet`/`Coverage`/`Benchmarks` in Go, `cargo check`/`Clippy` in Rust, `Syntax check` in Python/Ruby, `Strict warnings`/`ASan + UBSan` in C/C++, `javac -Xlint` in Java) plus **Export** (standalone folder in `~/Downloads` on Mac, or `.tar` download in browser mode).
5. **Chapters built in parts, like a build-along book.** Modelled on how *Let's Go* / *Let's Go Further* grow one app: each chapter's step is delivered as 2–5 short parts (15–30 minutes each). Part 1's preparation also proposes the chapter's outline; each later part is prepared only after the previous one passes, from the learner's actual code. Every part's task has the same shape: **Where we are** (a real limitation of the current code), **What to change** (`File:` lines and exact signatures, never the implementation), **Check it** (what each test checks, in plain words) and **Why it works** (theory after practice, with forward references). Each part has its own test file, so tests accumulate part by part.
6. **The tutor leads the build.** The lesson card says when to start (after one independent correct answer: *Ready to build*). *Start building with your tutor* opens the project and the tutor introduces the chapter's parts, the first file to open and one question about the plan. The tutor always sees the project files and the last run; failing results offer *Ask the tutor why* (first failure explained, one hint, no fix). When a part passes, the tutor says what works now and motivates the next part from a limitation in the code; after the last part it reviews the implementation, names the reusable **Principle**, and asks one applied question. Passing tests does not approve readiness.
7. **Predict before you run.** After edits, Run tests first asks what the learner expects (all pass / some fail / won't build, with an optional reason) and reports whether the prediction matched; the tutor's review addresses wrong predictions. Can be turned off per topic.
8. **An IDE.** File explorer with folders, breadcrumb, completion, live errors, hover documentation, go to definition across files (F12), rename (F2), formatting, signature help, find, folding. Errors from a run are also underlined at their file and line.

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

- **No internet (opt-in dependency fetch & localhost services).** Regular runs and tests deny outbound internet except `localhost` (so multi-process exercises and optional declared local services such as Kafka/Redpanda on `localhost:9092` work). For Go (`go mod tidy`/`download`), Rust (`cargo fetch`), Python (`pip install --target .lf-deps`), TypeScript/JavaScript (`npm install --ignore-scripts`), and Ruby (`bundle install`), an explicit user-confirmed fetch action runs inside the same home/write-isolated sandbox with outbound network enabled only for fetching dependencies into the project/toolchain cache; tests themselves remain offline.
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

- Before a step is shown, the Mac app compiles its tests against the learner's current files (each profile's `check` command; nothing runs). A step whose tests don't compile is sent back to the model once with the compiler output; if the repair still doesn't compile, preparation fails with Try again rather than saving a step that would break the project (in Go, one uncompilable test file breaks every step's tests).
- A step may only add files; a proposed file at an existing path is dropped.
- Step test files follow the profile's name (`stage03_leader_election_test.go`, `tests/stage03_leader_election.rs`, `test_stage03_leader_election.py`, `Stage03Test.java`) and are read-only in the editor.
- Learners can add and delete their own files, in folders. Reset restores a file to how it was when the step began.

## Verification · 19 November 2026

- Native (`cargo test`, 18 tests): sandbox denies home reads, outside writes, internet and inherited environment; kills runaway process groups; a Go step fails then passes locally; a sandboxed clangd completes struct fields and reports errors; the full IPC round trip (camelCase arguments, a Go module with a subfolder package, step test and program output) through Tauri's mock runtime.
- Frontend (`npm test`): profiles, file rules, runtime choice, local-run aggregation and regressions, diagnostics parsing for Go/Rust/Python/C/Java/Ruby/Node, the LSP client, the explorer and step panel.
- Browser, real editor and project hook, with the Mac bridge replaced by a mock forwarding to a real sandboxed clangd: `s->` offers the struct's fields, a type error is underlined live, hover shows the signature, F12 opens the definition in another folder, new files in folders and delete work.
- Real AI, real toolchain (20 November 2026), through the app's own planning and step code against the local proxy, with `go test`: Gemini 3.8 Flash and Gemini 4 Neon each planned a valid DDIA project, prepared a lesson, and prepared step 1 (fails before, passes after implementing) and step 2 on the learner's code (step 1 still passes; step 2 fails, then passes). The first run without the compile check found a step whose tests didn't compile against the learner's code; with the check, Neon's broken step 2 was caught and repaired.
- Not yet exercised: clicking through the packaged Mac app, and gopls (not installed on the test Mac).
