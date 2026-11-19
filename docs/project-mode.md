# Project mode: one project built across a curriculum

Status: phase 1 implemented (Go, Go Playground). Phase 2 (local toolchain) is a proposal and is not built.

## Problem

A curriculum lesson can include a coding exercise, but each exercise is separate. Its starter code is generated fresh, its draft is saved per lesson, and its tests check only that lesson. A learner working through a book such as *Designing Data-Intensive Applications*, which has no code of its own, gets snippets rather than a system that grows chapter by chapter.

## What project mode does

1. **Language choice is explicit.** The goal form has a programming-language picker. A chosen language makes the plan a coding plan in that language; the model's own `practice_mode` or `language` cannot override it.
2. **One project spans the plan.** With *Build one project across the course* selected (Go only in phase 1), the outline also returns a project (`title`, `summary`) and, for each unit, a `project_step`: what this unit adds to the project, or `null` for a concept-only unit (for example ethics). The approval screen shows the project and each step, and the learner can edit them before approving.
3. **Code carries forward.** The project is one workspace per topic, not per lesson. Moving to the next unit keeps the learner's files exactly as they are.
4. **Each step adds tests; earlier tests keep running.** When a unit with a step becomes active, LearnForge prepares that step from the current files: a task description, one new test file, and optional new stub files. Every run executes **all** stage test files, so a later change that breaks an earlier stage is visible.
5. **Pacing.** Lesson first, then the step. When the whole suite passes, the tutor reviews the implementation against the unit's ideas and asks one applied question. Passing tests is recorded on the stage; it does not approve readiness. Readiness still comes from independent checks and tutor review.

## Data model

`CurriculumPlan.project?: { title, summary }` and `CurriculumUnit.projectStep?: string` (`src/services/learning/curriculumPlan.ts`). Both are optional, so existing plans are unchanged.

`ProjectWorkspace` (`src/services/learning/project.ts`), one per track, stored in IndexedDB database `learnforge-projects`:

| Field | Meaning |
| --- | --- |
| `files` | Learner-owned source files (`path`, `content`). |
| `stages` | One per prepared step, in order: `unitId`, `number`, `task`, `testPath`, `tests`, `addedPaths`, `startFiles` (snapshot for Reset), `passedAt`. |

Deleting the topic deletes its workspace.

## Rules that keep stages composable

Model output is validated before it reaches the workspace; a stage that fails validation is not saved and the learner can retry.

- Learner paths match `^[a-z][a-z0-9_]{0,40}\.go$`, are not `prog.go`, and are not test files. At most 24 files, 60,000 characters each.
- A stage may only **add** files. A suggested file at an existing path is dropped; the learner's file is never overwritten.
- Stage *N* owns `stageNN_<slug>_test.go`. Its top-level functions must be named `TestStageNN…` or `stageNN…`, and it may not declare top-level types, variables or constants. Stages therefore never collide.
- All files use `package main` (one package, so the Playground can build them together).

## Execution (phase 1)

The Go Playground accepts a txtar body. When the first, unnamed file (`prog.go`) contains tests, it runs every `_test.go` file in the bundle and ignores `main()`. LearnForge sends the first stage's tests as `prog.go`, the other stage tests and all learner files as named sections. Without stages it runs the program normally. Verified against play.golang.org on 19 November 2026.

Playground limits apply: one process, no outside network, a short time limit, simulated time and an in-memory filesystem. For chapters on replication, sharding, faults and consensus, nodes are goroutines connected by an in-process network. This makes fault injection repeatable. Real disk durability (`fsync`) and real processes need phase 2.

## Tutor context

In project mode, chat requests receive the workspace (all learner files, path-labelled, capped at 24,000 characters) instead of a single editor buffer, plus the active stage task.

## Phase 2 proposal: local toolchain (not built)

Run `go test -race ./...` with the learner's installed Go in a per-topic directory, so the project can use packages, `go.mod`, real files and several processes.

This executes code on the learner's computer, including model-written tests. Before building it:

- An explicit per-topic opt-in, showing the directory and the exact command.
- Run only the installed `go` binary with a fixed argument list; no shell, no model-chosen commands.
- A working directory under the app's data folder; refuse symlinks and paths outside it.
- A wall-clock limit and output cap; kill the process group on cancel.
- Network access is not blocked by `go test`; disclose this, or run inside `sandbox-exec` on macOS.
- Stage tests remain model-written code. Show them before the first local run of each stage.

## Limits

- Phase 1 supports Go only. Other languages keep per-lesson exercises.
- Steps and tests are AI-generated and can be wrong or too large. The learner can edit steps at approval and retry a stage's preparation.
- Test passing shows the code meets those tests, not that the design is production-quality or that the learner has mastered the chapter.
