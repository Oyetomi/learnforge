import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addFile,
  applyStage,
  emptyWorkspace,
  goPlaygroundBody,
  markStagePassed,
  parsePreparedStage,
  projectPromptContext,
  removeFile,
  resetFileToStageStart,
  stageTestPath,
  stageTestProblem,
  summarizeSuite,
  supportsProjectMode,
  updateFile,
  validLearnerPath,
  validWorkspace,
} from "../project";
import { validCurriculumPlan, type CurriculumPlan } from "../curriculumPlan";
import { prepareProjectStage, trackFromOutline } from "../../ai/curriculumOutline";

const stage1Tests = `package main

import "testing"

func TestStage01PutGet(t *testing.T) {
	s := stage01NewStore()
	s.Put("a", "1")
	if v, _ := s.Get("a"); v != "1" {
		t.Fatalf("got %q", v)
	}
}

func stage01NewStore() *Store { return NewStore() }
`;
const stage2Tests = `package main

import "testing"

func TestStage02Len(t *testing.T) {
	if NewStore().Len() != 0 {
		t.Fatal("empty store should have length 0")
	}
}
`;
const storeStub = `package main

type Store struct{ m map[string]string }

func NewStore() *Store { return &Store{m: map[string]string{}} }
func (s *Store) Put(k, v string) {}
func (s *Store) Get(k string) (string, bool) { return "", false }
`;

describe("project stage rules", () => {
  it("accepts only lowercase non-test Go paths", () => {
    expect(validLearnerPath("store.go")).toBe(true);
    expect(validLearnerPath("raft_log.go")).toBe(true);
    expect(validLearnerPath("wordcount/main.go")).toBe(true);
    expect(validLearnerPath("go.mod")).toBe(true);
    for (const bad of ["prog.go", "store_test.go", "Store.go", "../x.go", "a/b/c/x.go", "x.txt"])
      expect(validLearnerPath(bad)).toBe(false);
    expect(supportsProjectMode("go")).toBe(true);
    expect(supportsProjectMode("python")).toBe(true);
    expect(supportsProjectMode("lua")).toBe(false);
  });

  it("requires stage-prefixed tests and helpers, and no top-level declarations", () => {
    expect(stageTestProblem(stage1Tests, 1)).toBeNull();
    expect(stageTestProblem(stage1Tests, 2)).toMatch(/TestStage02/);
    expect(stageTestProblem(stage1Tests.replace("stage01NewStore", "newStore").replace("stage01NewStore", "newStore"), 1)).toMatch(/helper "newStore"/);
    expect(stageTestProblem(`${stage2Tests}\nvar shared = 1\n`, 2)).toMatch(/top-level/);
    expect(stageTestProblem(stage2Tests.replace("package main", "package store"), 2)).toMatch(/package main/);
    expect(stageTestProblem(stage2Tests.replace('import "testing"', ""), 2)).toMatch(/testing/);
  });

  it("drops proposed files with invalid paths or packages", () => {
    const parsed = parsePreparedStage(
      {
        task: "Add a store.",
        test_file: stage1Tests,
        new_files: [
          { path: "store.go", content: storeStub },
          { path: "store.go", content: "package main\n// duplicate" },
          { path: "../evil.go", content: "package main" },
          { path: "other_test.go", content: "package main" },
          { path: "lib.go", content: "package lib" },
        ],
      },
      1
    );
    expect(parsed.files.map((f) => f.path)).toEqual(["store.go"]);
    expect(() => parsePreparedStage({ task: "x", test_file: stage2Tests }, 1)).toThrow(/Retry/);
  });

  it("names stage test files from the step number and unit title", () => {
    expect(stageTestPath(3, "Hash index & compaction!")).toBe("stage03_hash_index_compaction_test.go");
    expect(stageTestPath(12, "")).toBe("stage12_step_test.go");
  });
});

describe("workspace carry-forward", () => {
  const first = () =>
    applyStage(emptyWorkspace("t"), "u1", "Key-value store", { task: "Build it", tests: stage1Tests, files: [{ path: "store.go", content: storeStub }] }, 1);

  it("never overwrites a learner file and keeps earlier tests", () => {
    let ws = first();
    ws = updateFile(ws, "store.go", "package main\n// learner's work\n", 2);
    ws = applyStage(ws, "u2", "Length", { task: "Add Len", tests: stage2Tests, files: [{ path: "store.go", content: "package main\n// model rewrite" }, { path: "len.go", content: "package main\n" }] }, 3);
    expect(ws.files.find((f) => f.path === "store.go")?.content).toContain("learner's work");
    expect(ws.files.map((f) => f.path)).toEqual(["go.mod", "store.go", "len.go"]);
    expect(ws.stages.map((s) => s.number)).toEqual([1, 2]);
    expect(ws.stages[1].startFiles.find((f) => f.path === "store.go")?.content).toContain("learner's work");
    expect(validWorkspace(ws)).toBe(true);
  });

  it("re-preparing a step replaces its tests but keeps its number and start", () => {
    let ws = first();
    ws = applyStage(ws, "u2", "Length", { task: "v1", tests: stage2Tests, files: [] }, 2);
    ws = applyStage(ws, "u2", "Length", { task: "v2", tests: stage2Tests.replace("0", "0 "), files: [] }, 3);
    expect(ws.stages).toHaveLength(2);
    expect(ws.stages[1]).toMatchObject({ number: 2, task: "v2", testPath: "stage02_length_test.go" });
  });

  it("resets a file to its state at the start of the step, or to the step's stub", () => {
    let ws = first();
    ws = updateFile(ws, "store.go", "package main\n// edited", 2);
    const store = (w: typeof ws) => w.files.find((f) => f.path === "store.go")!.content;
    expect(store(resetFileToStageStart(ws, "u1", "store.go"))).toBe(storeStub);
    ws = applyStage(ws, "u2", "Length", { task: "x", tests: stage2Tests, files: [] }, 3);
    ws = updateFile(ws, "store.go", "package main\n// later", 4);
    expect(store(resetFileToStageStart(ws, "u2", "store.go"))).toBe("package main\n// edited");
  });

  it("adds learner files only with valid new names", () => {
    const ws = first();
    expect(addFile(ws, "replication.go").files).toHaveLength(3);
    const withPackage = addFile(ws, "wordcount/count.go").files;
    expect(withPackage[withPackage.length - 1]).toEqual({ path: "wordcount/count.go", content: "package wordcount\n" });
    expect(removeFile(addFile(ws, "replication.go"), "replication.go").files).toHaveLength(2);
    expect(addFile(ws, "store.go")).toBe(ws);
    expect(addFile(ws, "x_test.go")).toBe(ws);
  });

  it("records a pass once", () => {
    const ws = markStagePassed(first(), "u1", 10);
    expect(markStagePassed(ws, "u1", 20).stages[0].passedAt).toBe(10);
  });
});

describe("running and summarizing", () => {
  it("puts the first stage's tests in the unnamed prog.go and names every other file", () => {
    let ws = applyStage(emptyWorkspace("t"), "u1", "Store", { task: "x", tests: stage1Tests, files: [{ path: "store.go", content: storeStub }] });
    ws = applyStage(ws, "u2", "Length", { task: "y", tests: stage2Tests, files: [] });
    const body = goPlaygroundBody(ws);
    expect(body.startsWith("package main")).toBe(true);
    expect(body).toContain("func TestStage01PutGet");
    expect(body).toContain("-- stage02_length_test.go --\npackage main");
    expect(body).toContain("-- store.go --\npackage main");
    expect(body.indexOf("TestStage01")).toBeLessThan(body.indexOf("-- "));
  });

  it("runs the program normally before any step exists", () => {
    const ws = { ...emptyWorkspace("t"), files: [{ path: "main.go", content: 'package main\nfunc main() {}' }] };
    expect(goPlaygroundBody(ws)).toBe("-- main.go --\npackage main\nfunc main() {}\n");
  });

  it("reports regressions in earlier steps separately from the current step", () => {
    const summary = summarizeSuite(
      [
        { name: "TestStage01PutGet", passed: false },
        { name: "TestStage02Len", passed: true },
      ],
      2,
      1
    );
    expect(summary).toMatchObject({ brokenEarlier: [1], currentPassed: true, allPassed: false, total: 2, passed: 1 });
    expect(summarizeSuite([{ name: "TestStage01PutGet", passed: true }], 1, 0).allPassed).toBe(true);
    expect(summarizeSuite(undefined, 1, 1)).toMatchObject({ allPassed: false, currentPassed: false });
  });

  it("bounds the tutor's view of the project", () => {
    const big = { ...emptyWorkspace("t"), files: [{ path: "a.go", content: "x".repeat(100) }, { path: "b.go", content: "y".repeat(100) }] };
    const context = projectPromptContext(big, undefined, 150);
    expect(context).toContain("==== a.go ====");
    expect(context).not.toContain("==== b.go ====");
    expect(context).toContain("1 more file(s) omitted");
  });
});

const response = (value: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
afterEach(() => vi.unstubAllGlobals());

const outline = (overrides: Record<string, unknown> = {}) => ({
  title: "Data-intensive systems in Go",
  destination: "Build and reason about a replicated store",
  practice_mode: "general",
  language: null,
  exclusions: [],
  project: { title: "A distributed key-value store", summary: "Grows from a map to a replicated, sharded store." },
  modules: [
    {
      title: "Storage",
      outcome: "Store data durably",
      units: [
        { id: "a", title: "Logs", outcome: "Explain append-only logs", assessment: "Design a log for a new case", prerequisite_ids: [], project_step: "Add an append-only log" },
        { id: "b", title: "Ethics", outcome: "Weigh data retention", assessment: "Argue a retention policy", prerequisite_ids: ["a"], project_step: null },
      ],
    },
    {
      title: "Replication",
      outcome: "Copy data safely",
      units: [
        { id: "c", title: "Leaders", outcome: "Explain leader-based replication", assessment: "Predict lag effects", prerequisite_ids: ["a"], project_step: "Ship the log to a follower" },
      ],
    },
  ],
  ...overrides,
});

describe("project plans", () => {
  const base = { topic: "DDIA", interest: "DDIA", startingPoint: "Some experience", destination: "Build it" };

  it("makes a chosen language authoritative and keeps project steps", () => {
    const track = trackFromOutline(outline(), { ...base, language: "go", project: true });
    expect(track.language).toBe("go");
    expect(track.learningIntent?.practiceMode).toBe("coding");
    expect(track.curriculum?.project?.title).toBe("A distributed key-value store");
    const steps = track.curriculum!.modules.flatMap((m) => m.units.map((u) => u.projectStep));
    expect(steps).toEqual(["Add an append-only log", undefined, "Ship the log to a follower"]);
  });

  it("ignores project fields unless project mode was requested for a supported language", () => {
    expect(trackFromOutline(outline(), { ...base, language: "go" }).curriculum?.project).toBeUndefined();
    expect(trackFromOutline(outline(), { ...base, language: "lua", project: true }).curriculum?.project).toBeUndefined();
  });

  it("rejects a requested project with no steps", () => {
    const noSteps = outline();
    for (const m of noSteps.modules as any[]) for (const u of m.units) u.project_step = null;
    expect(() => trackFromOutline(noSteps, { ...base, language: "go", project: true })).toThrow(/project/);
  });

  it("validates saved project plans", () => {
    const plan = trackFromOutline(outline(), { ...base, language: "go", project: true }).curriculum as CurriculumPlan;
    expect(validCurriculumPlan(plan)).toBe(true);
    const emptied = structuredClone(plan);
    emptied.modules[0].units[0].projectStep = "";
    expect(validCurriculumPlan(emptied)).toBe(true);
    emptied.modules[1].units[0].projectStep = "";
    expect(validCurriculumPlan(emptied)).toBe(false);
    const stray = structuredClone(plan);
    delete stray.project;
    expect(validCurriculumPlan(stray)).toBe(false);
  });

  it("sends compiler errors back for one repair, and gives up clearly if the repair doesn't compile", async () => {
    const track = trackFromOutline(outline(), { ...base, language: "go", project: true });
    const unitId = track.curriculum!.modules[0].units[0].id;
    const ws = { ...emptyWorkspace(track.id), files: [{ path: "main.go", content: "package main\nfunc main() {}\n" }] };
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const good = { task: "Add a store", test_file: stage1Tests, new_files: [{ path: "store.go", content: storeStub }] };
    const fetch = vi.fn().mockImplementation(async () => response(good));
    vi.stubGlobal("fetch", fetch);
    const check = vi.fn().mockResolvedValueOnce("./x_test.go:9: s.Put(...) (no value) used as value").mockResolvedValueOnce(null);
    const { stage } = await prepareProjectStage(track, unitId, ws, undefined, check);
    expect(stage.tests).toBe(stage1Tests);
    expect(check).toHaveBeenCalledTimes(2);
    expect(check.mock.calls[0][2]).toMatch(/^stage01_.*_test\.go$/);
    const repair = JSON.parse(JSON.parse(fetch.mock.calls[1][1].body).messages[1].content);
    expect(repair.validationFailure).toContain("(no value) used as value");

    const never = vi.fn().mockResolvedValue("does not compile");
    await expect(prepareProjectStage(track, unitId, ws, undefined, never)).rejects.toThrow(/didn’t compile against your files/);
  });

  it("prepares a step from current files and repairs one invalid proposal", async () => {
    const track = trackFromOutline(outline(), { ...base, language: "go", project: true });
    const unitId = track.curriculum!.modules[0].units[0].id;
    const ws = { ...emptyWorkspace(track.id), files: [{ path: "main.go", content: "package main\nfunc main() {}\n" }] };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ task: "Add a log", test_file: stage2Tests, new_files: [] }))
      .mockResolvedValueOnce(response({ task: "Add a log", test_file: stage1Tests, new_files: [{ path: "store.go", content: storeStub }] }));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const { stage, number } = await prepareProjectStage(track, unitId, ws);
    expect(number).toBe(1);
    expect(stage.files.map((f) => f.path)).toEqual(["store.go"]);
    const sent = JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).messages[1].content);
    expect(sent.currentFiles).toEqual(ws.files);
    expect(sent.step).toBe("Add an append-only log");
    const repair = JSON.parse(JSON.parse(fetch.mock.calls[1][1].body).messages[1].content);
    expect(repair.validationFailure).toMatch(/TestStage01/);
  });
});
