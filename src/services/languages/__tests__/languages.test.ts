import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_PROFILES,
  isSourcePath,
  isTestPath,
  profileFor,
  safeRelativePath,
  stageTestFile,
  starterSources,
  suggestPath,
  supportsProjectMode,
} from "..";
import { applyStage, emptyWorkspace, parsePreparedStage, stageTestProblem, summarizeSuite, validWorkspace } from "../../learning/project";
import { projectRuntime } from "../../../components/editor/useProjectWorkspace";

const get = (id: string) => profileFor(id)!;

describe("language profiles", () => {
  it("every built-in profile has run and step-test commands and distinct test files", () => {
    for (const p of BUILT_IN_PROFILES) {
      expect(p.run.length, p.id).toBeGreaterThan(0);
      expect(p.test.length, p.id).toBeGreaterThan(0);
      const testFile = stageTestFile(p, 3, "Leader election");
      expect(isTestPath(p, testFile), `${p.id} ${testFile}`).toBe(true);
      expect(isSourcePath(p, testFile), `${p.id} ${testFile}`).toBe(false);
      for (const f of starterSources(p)) expect(isSourcePath(p, f.path)).toBe(true);
    }
  });

  it("names step tests in each language's convention", () => {
    expect(stageTestFile(get("go"), 3, "Leader election")).toBe("stage03_leader_election_test.go");
    expect(stageTestFile(get("python"), 3, "Leader election")).toBe("test_stage03_leader_election.py");
    expect(stageTestFile(get("rust"), 3, "Leader election")).toBe("tests/stage03_leader_election.rs");
    expect(stageTestFile(get("typescript"), 3, "Leader election")).toBe("stage03_leader_election.test.ts");
    expect(stageTestFile(get("java"), 3, "Leader election")).toBe("Stage03Test.java");
  });

  it("completes typed file names with the language's extension and folder", () => {
    expect(suggestPath(get("go"), "replication")).toBe("replication.go");
    expect(suggestPath(get("rust"), "raft")).toBe("src/raft.rs");
    expect(suggestPath(get("python"), "store.py")).toBe("store.py");
    expect(suggestPath(get("java"), "Replication")).toBe("Replication.java");
  });

  it("rejects unsafe paths everywhere", () => {
    for (const bad of [
      "../x.py",
      "../x.go",
      "/etc/passwd",
      "a/../b.rs",
      ".hidden.go",
      "a/b/c/d/e/f.go",
      "a b.go",
    ]) {
      expect(safeRelativePath(bad), bad).toBe(false);
    }
    const go = get("go");
    expect(isSourcePath(go, "notes.exe")).toBe(false);
    expect(isSourcePath(go, "a/b/c/d/e/f.go")).toBe(false);
    expect(supportsProjectMode("rust")).toBe(true);
    expect(supportsProjectMode("lua")).toBe(false);
  });

  it("supports multi-module Go sources, fixtures, learner tests, and profile tools while reserving stage tests", () => {
    const go = get("go");
    for (const src of [
      "api/internal/handlers/handlers.go",
      "api/cmd/api/main.go",
      "chapter11/api/cmd/api/main.go",
      "go.work",
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
    ]) {
      expect(safeRelativePath(src), src).toBe(true);
      expect(isSourcePath(go, src), src).toBe(true);
      expect(isTestPath(go, src), src).toBe(false);
    }
    for (const testPath of ["stage01_x_test.go", "stage105_stream_join_test.go", "api/stage01_x_test.go"]) {
      expect(isTestPath(go, testPath), testPath).toBe(true);
      expect(isSourcePath(go, testPath), testPath).toBe(false);
    }
    expect(go.tools?.map((t) => t.id)).toEqual(["test_all", "race", "cover", "bench", "vet"]);
    expect(go.testBatch?.length).toBeGreaterThan(0);
    expect(go.fetchDeps?.length).toBeGreaterThan(0);
  });
});

describe("project workspaces in other languages", () => {
  it("starts a Rust project with its starter sources and accepts its step files", () => {
    const ws = emptyWorkspace("t", "rust");
    expect(ws.files.map((f) => f.path)).toEqual(["src/lib.rs", "src/main.rs"]);
    const prepared = parsePreparedStage(
      {
        task: "Add a log",
        test_file: "use learnforge_project::*;\n#[test]\nfn appends() {}\n",
        new_files: [{ path: "src/log.rs", content: "pub fn x() {}" }, { path: "log.rs", content: "" }, { path: "tests/extra.rs", content: "" }],
      },
      1,
      "rust"
    );
    expect(prepared.files.map((f) => f.path)).toEqual(["src/log.rs"]);
    const next = applyStage(ws, "u1", "Append-only log", prepared);
    expect(next.stages[0].testPath).toBe("tests/stage01_append_only_log.rs");
    expect(validWorkspace(next)).toBe(true);
  });

  it("applies Go's naming rules only to Go", () => {
    expect(stageTestProblem("import unittest\n", 1, "python")).toBeNull();
    expect(stageTestProblem("package main\nimport \"testing\"\nfunc TestX(t *testing.T){}\n", 1, "go")).toMatch(/TestStage01/);
  });
});

describe("where a project runs", () => {
  const status = (id: string, runnable: boolean, missing: string[] = []) => [{ ...get(id), runnable, missing, lspProgram: null }];

  it("prefers the local sandbox when the toolchain is installed", () => {
    expect(projectRuntime("rust", status("rust", true))).toMatchObject({ available: true, local: true });
  });
  it("falls back to the Go Playground only for Go", () => {
    expect(projectRuntime("go", status("go", false, ["go"]))).toMatchObject({ available: true, local: false, label: "Go Playground · cloud" });
    expect(projectRuntime("go", null)).toMatchObject({ available: true, local: false });
  });
  it("explains what to install for other languages", () => {
    const r = projectRuntime("python", status("python", false, ["python3"]));
    expect(r).toMatchObject({ available: false, local: false });
    expect(r.detail).toContain("Install python3");
    expect(projectRuntime("rust", null).detail).toContain("Mac app");
  });
});

describe("local project runs", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@tauri-apps/api/core");
  });

  it("syncs every file, runs each step on its own and reports regressions by step", async () => {
    const calls: { cmd: string; args: any }[] = [];
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (cmd: string, args: any) => {
        calls.push({ cmd, args });
        if (cmd === "project_sync") return "/projects/t";
        const n = args.stage.number;
        return { steps: [{ command: "cargo test", stdout: n === 1 ? "boom" : "ok", stderr: "", exitCode: n === 1 ? 101 : 0, timedOut: false, durationMs: 5 }], exitCode: n === 1 ? 101 : 0, timedOut: false, durationMs: 5 };
      }),
    }));
    const { runLocalProject } = await import("../../sandbox/local");
    let ws = emptyWorkspace("t", "rust");
    ws = applyStage(ws, "u1", "Log", { task: "a", tests: "#[test] fn a() {}", files: [] });
    ws = applyStage(ws, "u2", "Index", { task: "b", tests: "#[test] fn b() {}", files: [] });
    const result = await runLocalProject(ws);
    const synced = calls[0].args.files.map((f: any) => f.path);
    expect(synced).toEqual(["src/lib.rs", "src/main.rs", "tests/stage01_log.rs", "tests/stage02_index.rs"]);
    expect(calls.slice(1).map((c) => [c.args.action, c.args.stage.testFile])).toEqual([
      ["test", "tests/stage01_log.rs"],
      ["test", "tests/stage02_index.rs"],
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.testResults?.map((t) => t.passed)).toEqual([false, true]);
    expect(result.testResults?.[0].error).toContain("boom");
    expect(summarizeSuite(result.testResults, 2, result.exitCode)).toMatchObject({ brokenEarlier: [1], currentPassed: true, allPassed: false });
  });

  it("syncs files and runs a sandboxed language tool action via runLocalProjectTool", async () => {
    const calls: { cmd: string; args: any }[] = [];
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (cmd: string, args: any) => {
        calls.push({ cmd, args });
        if (cmd === "project_sync") return "/projects/go-track";
        return {
          steps: [
            {
              command: "go test -cover -count=1 ./...",
              stdout: "\u001b[32mok  \tlearnforge\t0.12s\tcoverage: 100.0% of statements\u001b[0m\n",
              stderr: "",
              exitCode: 0,
              timedOut: false,
              durationMs: 120,
            },
          ],
          exitCode: 0,
          timedOut: false,
          durationMs: 120,
        };
      }),
    }));
    const { runLocalProjectTool } = await import("../../sandbox/local");
    const ws = emptyWorkspace("go-track", "go");
    const result = await runLocalProjectTool(ws, "cover");
    expect(calls.map((c) => c.cmd)).toEqual(["project_sync", "project_exec"]);
    expect(calls[1].args).toMatchObject({
      trackId: "go-track",
      profileId: "go",
      action: "tool",
      stage: null,
      toolId: "cover",
    });
    expect(result.stdout).toBe("ok  \tlearnforge\t0.12s\tcoverage: 100.0% of statements");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("respects cancellation during runLocalProjectTool", async () => {
    const calls: { cmd: string; args: any }[] = [];
    let markSyncStarted!: () => void;
    const syncStarted = new Promise<void>((resolve) => {
      markSyncStarted = resolve;
    });
    let releaseSync!: () => void;
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (cmd: string, args: any) => {
        calls.push({ cmd, args });
        if (cmd === "project_sync") {
          markSyncStarted();
          await new Promise<void>((resolve) => {
            releaseSync = resolve;
          });
          return "/projects/go-track";
        }
        return { steps: [], exitCode: 0, timedOut: false, durationMs: 0 };
      }),
    }));
    const { cancelLocalRun, runLocalProjectTool } = await import("../../sandbox/local");
    const ws = emptyWorkspace("go-track", "go");
    const pending = runLocalProjectTool(ws, "vet");
    await syncStarted;
    await cancelLocalRun();
    releaseSync();
    const result = await pending;
    expect(calls.map((c) => c.cmd)).toEqual(["project_sync"]);
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Stopped.");
    expect(result.error).toBe("Stopped.");
  });

  it("runs all Go stages in a single test_batch go test -json invocation and groups regressions by stage", async () => {
    const calls: { cmd: string; args: any }[] = [];
    const goJsonOutput = [
      JSON.stringify({ Action: "run", Package: "learnforge", Test: "TestStage01Broker" }),
      JSON.stringify({ Action: "output", Package: "learnforge", Test: "TestStage01Broker", Output: "    stage01_broker_test.go:12: expected 3 events, got 2\n" }),
      JSON.stringify({ Action: "fail", Package: "learnforge", Test: "TestStage01Broker", Elapsed: 0.04 }),
      JSON.stringify({ Action: "run", Package: "learnforge", Test: "TestStage02Consumer" }),
      JSON.stringify({ Action: "output", Package: "learnforge", Test: "TestStage02Consumer", Output: "--- PASS: TestStage02Consumer (0.01s)\n" }),
      JSON.stringify({ Action: "pass", Package: "learnforge", Test: "TestStage02Consumer", Elapsed: 0.01 }),
    ].join("\n");
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (cmd: string, args: any) => {
        calls.push({ cmd, args });
        if (cmd === "project_sync") return "/projects/go-edm";
        return {
          steps: [
            {
              command: "go test -json -count=1 ./...",
              stdout: goJsonOutput,
              stderr: "",
              exitCode: 1,
              timedOut: false,
              durationMs: 65,
            },
          ],
          exitCode: 1,
          timedOut: false,
          durationMs: 65,
        };
      }),
    }));
    const { runLocalProject } = await import("../../sandbox/local");
    let ws = emptyWorkspace("go-edm", "go");
    ws = applyStage(ws, "u1", "Broker", { task: "a", tests: "package main\nimport \"testing\"\nfunc TestStage01Broker(t *testing.T) {}", files: [] });
    ws = applyStage(ws, "u2", "Consumer", { task: "b", tests: "package main\nimport \"testing\"\nfunc TestStage02Consumer(t *testing.T) {}", files: [] });
    const result = await runLocalProject(ws);
    expect(calls.map((c) => c.cmd)).toEqual(["project_sync", "project_exec"]);
    expect(calls[1].args).toMatchObject({ action: "test_batch", stage: null });
    expect(result.exitCode).toBe(1);
    expect(result.stepRuns?.map((s) => [s.number, s.passed])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(result.testResults?.[0].error).toContain("expected 3 events, got 2");
    expect(summarizeSuite(result.testResults, 2, result.exitCode)).toMatchObject({
      brokenEarlier: [1],
      currentPassed: true,
      allPassed: false,
    });
  });

  it("reports compile errors cleanly across all stages in Go batch mode", async () => {
    const { parseGoTestJson } = await import("../../sandbox/local");
    let ws = emptyWorkspace("go-edm", "go");
    ws = applyStage(ws, "u1", "Broker", { task: "a", tests: "package main\nimport \"testing\"\nfunc TestStage01Broker(t *testing.T) {}", files: [] });
    ws = applyStage(ws, "u2", "Consumer", { task: "b", tests: "package main\nimport \"testing\"\nfunc TestStage02Consumer(t *testing.T) {}", files: [] });
    const buildFailJson = [
      JSON.stringify({ Action: "build-output", Output: "# learnforge [learnforge.test]\n./broker.go:10:2: undefined: Event\n" }),
      JSON.stringify({ Action: "build-fail" }),
    ].join("\n");
    const parsed = parseGoTestJson(buildFailJson, "", ws.stages, 1, false, 40);
    expect(parsed.exitCode).toBe(1);
    expect(parsed.stepRuns?.every((s) => !s.passed)).toBe(true);
    expect(parsed.stepRuns?.[0].output).toContain("undefined: Event");
  });

  it("invokes project_fetch_deps and project_export through Tauri IPC", async () => {
    const calls: { cmd: string; args: any }[] = [];
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (cmd: string, args: any) => {
        calls.push({ cmd, args });
        if (cmd === "project_sync") return "/projects/go-edm";
        if (cmd === "project_fetch_deps") {
          return {
            exec: {
              steps: [{ command: "go mod tidy", stdout: "", stderr: "", exitCode: 0, timedOut: false, durationMs: 30 }],
              exitCode: 0,
              timedOut: false,
              durationMs: 30,
            },
            updatedFiles: [{ path: "go.sum", content: "example.com/pkg v1.0.0 h1:abc=\n" }],
          };
        }
        if (cmd === "project_export") {
          return { path: "/Users/test/Downloads/event-broker", fileCount: 3 };
        }
        return {};
      }),
    }));
    const { exportLocalProject, fetchLocalProjectDeps } = await import("../../sandbox/local");
    const ws = emptyWorkspace("go-edm", "go");
    const deps = await fetchLocalProjectDeps(ws);
    expect(deps.result.exitCode).toBe(0);
    expect(deps.updatedFiles).toEqual([{ path: "go.sum", content: "example.com/pkg v1.0.0 h1:abc=\n" }]);
    const exported = await exportLocalProject(ws, "Event Broker", true, true);
    expect(exported).toEqual({ path: "/Users/test/Downloads/event-broker", fileCount: 3 });
    expect(calls.map((c) => c.cmd)).toEqual(["project_sync", "project_fetch_deps", "project_export"]);
  });
});
