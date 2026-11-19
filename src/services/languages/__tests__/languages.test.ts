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
    for (const bad of ["../x.py", "/etc/x", "a/../b.rs", ".hidden.go", "a b.go"]) expect(safeRelativePath(bad)).toBe(false);
    expect(isSourcePath(get("go"), "other_test.go")).toBe(false);
    expect(supportsProjectMode("rust")).toBe(true);
    expect(supportsProjectMode("lua")).toBe(false);
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
});
