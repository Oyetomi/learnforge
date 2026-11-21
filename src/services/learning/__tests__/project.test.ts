import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  addFile,
  allTrackWorkspaceKeys,
  applyStage,
  currentStageFor,
  emptyWorkspace,
  goPlaygroundBody,
  markStagePassed,
  nextPart,
  parsePreparedStage,
  projectPromptContext,
  projectWorkspaceKey,
  removeFile,
  resetFileToStageStart,
  stageTestPath,
  stageTestProblem,
  summarizeSuite,
  supportsProjectMode,
  unitBuildDone,
  untouchedLegacyStage,
  updateFile,
  validLearnerPath,
  validWorkspace,
} from "../project";
import {
  hasProjectMode,
  planProjects,
  projectForUnit,
  unitsForProject,
  validCurriculumPlan,
  type CurriculumPlan,
} from "../curriculumPlan";
import { deleteTrackProjects, loadProject, saveProject } from "../projectStore";
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
    for (const bad of ["prog.go", "stage01_x_test.go", "Store.go", "../x.go", "a/b/c/d/e/x.go", "x.exe"])
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
          { path: "stage01_other_test.go", content: "package main" },
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
    expect(addFile(ws, "stage01_x_test.go")).toBe(ws);
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

describe("a chapter's build in parts", () => {
  const outline = ["In-memory map", "Length"];
  const part1 = { task: "Map", tests: stage1Tests, files: [{ path: "store.go", content: storeStub }], title: "In-memory map", outline };
  const part2 = { task: "Len", tests: stage2Tests, files: [], title: "Length" };
  it("prepares parts one at a time, each with its own tests, and knows when the chapter is done", () => {
    let ws = applyStage(emptyWorkspace("t"), "u1", "Store", part1, 1, 1);
    expect(currentStageFor(ws, "u1")).toMatchObject({ section: 1, title: "In-memory map", outline });
    expect(nextPart(ws, "u1")).toBeNull();
    ws = markStagePassed(ws, "u1", 2);
    expect(nextPart(ws, "u1")).toEqual({ section: 2, title: "Length" });
    expect(unitBuildDone(ws, "u1")).toBe(false);
    ws = applyStage(ws, "u1", "Store", part2, 3, 2);
    expect(ws.stages).toHaveLength(2);
    expect(currentStageFor(ws, "u1")).toMatchObject({ number: 2, section: 2, outline });
    // The earlier part's pass is kept; marking applies to the current part.
    ws = markStagePassed(ws, "u1", 4);
    expect(ws.stages.map((s) => s.passedAt)).toEqual([2, 4]);
    expect(unitBuildDone(ws, "u1")).toBe(true);
    expect(projectPromptContext(ws, "u1")).toContain("2. Length (current)");
  });
  it("re-preparing a part replaces it in place", () => {
    let ws = applyStage(emptyWorkspace("t"), "u1", "Store", part1, 1, 1);
    ws = applyStage(ws, "u1", "Store", { ...part1, task: "Map v2" }, 2, 1);
    expect(ws.stages).toHaveLength(1);
    expect(ws.stages[0].task).toBe("Map v2");
  });
  it("treats an untouched old one-step stage as replaceable, but never one with the learner's work", () => {
    const old = applyStage(emptyWorkspace("t"), "u1", "Store", { task: "Old", tests: stage1Tests, files: [{ path: "store.go", content: storeStub }] }, 1);
    expect(untouchedLegacyStage(old, "u1")).toBe(true);
    expect(untouchedLegacyStage(updateFile(old, "store.go", storeStub + "\n// mine"), "u1")).toBe(false);
    expect(untouchedLegacyStage(applyStage(emptyWorkspace("t"), "u1", "Store", part1, 1, 1), "u1")).toBe(false);
  });
});

describe("multi-project curricula and book-grounded stage preparation", () => {
  const bookSource = {
    name: "Go in Action.pdf",
    sections: [
      { id: "ch1", title: "Chapter 1: Go overview", level: 0, pageStart: 1, pageEnd: 12 },
      { id: "ch2", title: "Chapter 2: Word Count CLI", level: 0, pageStart: 13, pageEnd: 34 },
      { id: "ch9", title: "Chapter 9: Concurrency and RSS Reader", level: 0, pageStart: 180, pageEnd: 210 },
      { id: "ch11", title: "Chapter 11: Multi-module RSS Workspace", level: 0, pageStart: 240, pageEnd: 270 },
    ],
  };

  const bookRefs = [
    {
      id: "ref-ch1",
      name: "Go in Action.pdf - Chapter 1",
      content: "Go emphasizes simplicity, fast compilation, and explicit error handling.",
      sectionId: "ch1",
      truncated: false,
    },
    {
      id: "ref-ch2",
      name: "Go in Action.pdf - Chapter 2",
      content: "Build a wordcount CLI reading from stdin or files with -l and -w flags and CountWords.",
      sectionId: "ch2",
      truncated: false,
    },
    {
      id: "ref-ch9",
      name: "Go in Action.pdf - Chapter 9",
      content: "Concurrent RSS Reader uses FeedFetcher, Matcher interface, worker goroutines, and channel fan-in.",
      sectionId: "ch9",
      truncated: false,
    },
    {
      id: "ref-ch11",
      name: "Go in Action.pdf - Chapter 11",
      content: "Extend the RSS Reader into a multi-module workspace with go.work and domain ports.",
      sectionId: "ch11",
      truncated: false,
    },
  ];

  const multiProjectOutline = () => ({
    title: "Go in Action",
    destination: "Build idiomatic CLI and concurrent Go applications",
    practice_mode: "coding",
    language: "go",
    exclusions: ["Live internet RSS endpoints are adapted to localhost httptest servers."],
    projects: [
      {
        id: "wordcount",
        title: "Word Count CLI",
        summary: "Reads input streams and counts words and lines with CLI flags.",
        source: "book",
      },
      {
        id: "rss",
        title: "Concurrent RSS Reader",
        summary: "Fetches, parses, and matches RSS feeds concurrently and grows into a workspace.",
        source: "book",
      },
      {
        id: "unused",
        title: "Unused Draft Project",
        summary: "Declared by the model without any unit referencing it.",
        source: "designed",
      },
    ],
    modules: [
      {
        title: "Foundations & CLI",
        outcome: "Write and structure Go CLI tools",
        units: [
          {
            id: "u1",
            title: "Go mental model",
            outcome: "Explain Go toolchain and compilation trade-offs",
            assessment: "Compare Go build characteristics for a service",
            prerequisite_ids: [],
            source_section_ids: ["ch1"],
            project_id: null,
            project_step: null,
          },
          {
            id: "u2",
            title: "Word Count CLI",
            outcome: "Parse flags and scan input streams in Go",
            assessment: "Implement a streaming line and word counter",
            prerequisite_ids: ["u1"],
            source_section_ids: ["ch2"],
            project_id: "wordcount",
            project_step: "Create wordcount/main.go with CountWords and -l/-w flags",
          },
        ],
      },
      {
        title: "Concurrency & Workspaces",
        outcome: "Coordinate goroutines and multi-module packages",
        units: [
          {
            id: "u3",
            title: "Concurrent RSS fetcher",
            outcome: "Coordinate concurrent feed fetchers with channels",
            assessment: "Fan in feed results without data races",
            prerequisite_ids: ["u2"],
            source_section_ids: ["ch9"],
            project_id: "rss",
            project_step: "Implement FeedFetcher and concurrent Matcher goroutines over localhost fixtures",
          },
          {
            id: "u4",
            title: "Multi-module RSS workspace",
            outcome: "Organize Go packages across a multi-module workspace",
            assessment: "Split feed fetching and matching into clean packages",
            prerequisite_ids: ["u3"],
            source_section_ids: ["ch11"],
            project_id: "rss",
            project_step: "Refactor the RSS reader into modules wired through domain interfaces",
          },
        ],
      },
    ],
  });

  const multiBase = {
    topic: "Go in Action",
    interest: "Learn Go from Go in Action",
    startingPoint: "Know another language",
    destination: "Build real Go programs",
    language: "go",
    project: true,
    sourceDocument: bookSource,
    references: bookRefs,
  };

  it("parses multi-project outlines, prunes unused projects, and resolves per-unit projects", () => {
    const track = trackFromOutline(multiProjectOutline(), multiBase);
    const plan = track.curriculum as CurriculumPlan;

    expect(validCurriculumPlan(plan)).toBe(true);
    expect(plan.project).toBeUndefined();
    expect(plan.projects).toHaveLength(2);
    expect(planProjects(plan).map((p) => [p.id, p.title, p.source])).toEqual([
      ["wordcount", "Word Count CLI", "book"],
      ["rss", "Concurrent RSS Reader", "book"],
    ]);
    expect(hasProjectMode(plan)).toBe(true);

    const [u1, u2] = plan.modules[0].units;
    const [u3, u4] = plan.modules[1].units;
    expect(u1.projectId).toBeUndefined();
    expect(u1.projectStep).toBeUndefined();
    expect(u2.projectId).toBe("wordcount");
    expect(u3.projectId).toBe("rss");
    expect(u4.projectId).toBe("rss");

    expect(projectForUnit(plan, u1.id)).toBeUndefined();
    expect(projectForUnit(plan, u2.id)?.id).toBe("wordcount");
    expect(projectForUnit(plan, u3.id)?.id).toBe("rss");
    expect(projectForUnit(plan, u4.id)?.id).toBe("rss");
    expect(projectForUnit(plan)?.id).toBe("wordcount");

    expect(unitsForProject(plan, "wordcount").map((u) => u.id)).toEqual([u2.id]);
    expect(unitsForProject(plan, "rss").map((u) => u.id)).toEqual([u3.id, u4.id]);
  });

  it("rejects invalid multi-project plans and missing project_id mappings", () => {
    const missingId = multiProjectOutline();
    (missingId.modules[1].units[0] as any).project_id = null;
    expect(() => trackFromOutline(missingId, multiBase)).toThrow(/project_id/);

    const unknownId = multiProjectOutline();
    (unknownId.modules[1].units[0] as any).project_id = "nonexistent";
    expect(() => trackFromOutline(unknownId, multiBase)).toThrow(/project_id/);

    const validPlan = trackFromOutline(multiProjectOutline(), multiBase).curriculum as CurriculumPlan;

    const missingUnitProjectId = structuredClone(validPlan);
    delete missingUnitProjectId.modules[1].units[0].projectId;
    expect(validCurriculumPlan(missingUnitProjectId)).toBe(false);

    const unknownUnitProjectId = structuredClone(validPlan);
    unknownUnitProjectId.modules[1].units[0].projectId = "ghost";
    expect(validCurriculumPlan(unknownUnitProjectId)).toBe(false);

    const duplicateProjectIds = structuredClone(validPlan);
    duplicateProjectIds.projects![1].id = "WORDCOUNT";
    expect(validCurriculumPlan(duplicateProjectIds)).toBe(false);

    const badSource = structuredClone(validPlan);
    (badSource.projects![0] as any).source = "web";
    expect(validCurriculumPlan(badSource)).toBe(false);

    const strayProjectId = structuredClone(validPlan);
    delete strayProjectId.projects;
    for (const m of strayProjectId.modules) {
      for (const u of m.units) {
        delete u.projectStep;
      }
    }
    expect(validCurriculumPlan(strayProjectId)).toBe(false);
  });

  it("stays backward compatible with legacy single-project plans lacking id or projects", () => {
    const legacyPlan: CurriculumPlan = {
      schemaVersion: 1,
      version: 1,
      scope: "curriculum",
      originalGoal: "DDIA",
      destination: "Build a store",
      startingPoint: "Some experience",
      exclusions: [],
      project: { title: "Legacy Store", summary: "Single shared project." },
      modules: [
        {
          id: "m1",
          title: "Storage",
          outcome: "Store records",
          units: [
            {
              id: "u1",
              title: "Logs",
              outcome: "Explain append-only logs",
              assessment: "Design a log",
              prerequisiteIds: [],
              projectStep: "Append records to a log",
            },
            {
              id: "u2",
              title: "Ethics",
              outcome: "Weigh retention policies",
              assessment: "Compare retention trade-offs",
              prerequisiteIds: ["u1"],
            },
          ],
        },
      ],
    };
    expect(validCurriculumPlan(legacyPlan)).toBe(true);
    expect(hasProjectMode(legacyPlan)).toBe(true);
    expect(planProjects(legacyPlan)).toEqual([
      { id: "main", title: "Legacy Store", summary: "Single shared project." },
    ]);
    expect(projectForUnit(legacyPlan, "u1")?.id).toBe("main");
    expect(projectForUnit(legacyPlan, "u2")?.id).toBe("main");
    expect(unitsForProject(legacyPlan, "main").map((u) => u.id)).toEqual(["u1"]);
  });

  it("generates backward-compatible and bounded workspace keys for single and multi-project tracks", () => {
    expect(projectWorkspaceKey("track-1", "wordcount", false)).toBe("track-1");
    expect(projectWorkspaceKey("track-1", undefined, true)).toBe("track-1");
    expect(projectWorkspaceKey("track-1", "main", true)).toBe("track-1");
    expect(projectWorkspaceKey("track-1", "Word Count!", true)).toBe("track-1--word-count");

    const longTrack = "curriculum-" + "a".repeat(60);
    const longKeyA = projectWorkspaceKey(longTrack, "concurrent-rss-reader-project-alpha-edition", true);
    const longKeyB = projectWorkspaceKey(longTrack, "concurrent-rss-reader-project-beta-edition", true);
    expect(longKeyA.length).toBeLessThanOrEqual(100);
    expect(longKeyB.length).toBeLessThanOrEqual(100);
    expect(longKeyA).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(longKeyB).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(longKeyA).not.toBe(longKeyB);
    expect(longKeyA.startsWith(`${longTrack}--`)).toBe(true);

    expect(allTrackWorkspaceKeys("track-1", [])).toEqual(["track-1"]);
    expect(allTrackWorkspaceKeys("track-1", [{ id: "main" }])).toEqual(["track-1"]);
    expect(allTrackWorkspaceKeys("track-1", [{ id: "wordcount" }, { id: "rss" }])).toEqual([
      "track-1",
      "track-1--wordcount",
      "track-1--rss",
    ]);
  });

  it("passes the unit's specific activeProject and book sourceExcerpts to prepareProjectStage", async () => {
    const track = trackFromOutline(multiProjectOutline(), multiBase);
    const ch9Unit = track.curriculum!.modules[1].units[0];
    const wsKey = projectWorkspaceKey(track.id, "rss", true);
    const ws = { ...emptyWorkspace(wsKey), files: [{ path: "go.mod", content: "module learnforge\n\ngo 1.21\n" }] };

    const fetch = vi.fn().mockResolvedValue(
      response({
        title: "Feed fetcher skeleton",
        outline: ["Feed fetcher skeleton", "Concurrent matcher fan-in"],
        task: "Create the FeedFetcher and Matcher interfaces.",
        test_file: stage1Tests,
        new_files: [{ path: "store.go", content: storeStub }],
      })
    );
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

    const { stage, number } = await prepareProjectStage(track, ch9Unit.id, ws);
    expect(number).toBe(1);
    expect(stage.title).toBe("Feed fetcher skeleton");

    const systemPrompt = JSON.parse(fetch.mock.calls[0][1].body).messages[0].content as string;
    const sent = JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).messages[1].content);
    expect(systemPrompt).toContain("sourceExcerpts");
    expect(sent.project).toEqual({
      id: "rss",
      title: "Concurrent RSS Reader",
      summary: "Fetches, parses, and matches RSS feeds concurrently and grows into a workspace.",
      source: "book",
    });
    expect(sent.sourceExcerpts).toContain("FeedFetcher");
    expect(sent.sourceExcerpts).toContain("Matcher interface");
    expect(sent.sourceExcerpts).not.toContain("CountWords");
  });

  it("deletes all multi-project workspaces including orphaned trackId--* entries in IndexedDB", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await saveProject(emptyWorkspace("track-a"));
    await saveProject(emptyWorkspace("track-a--wordcount"));
    await saveProject(emptyWorkspace("track-a--rss"));
    await saveProject(emptyWorkspace("track-a--orphan"));
    await saveProject(emptyWorkspace("track-b--rss"));

    const keys = allTrackWorkspaceKeys("track-a", [{ id: "wordcount" }, { id: "rss" }]);
    await deleteTrackProjects("track-a", keys);

    expect(await loadProject("track-a")).toBeNull();
    expect(await loadProject("track-a--wordcount")).toBeNull();
    expect(await loadProject("track-a--rss")).toBeNull();
    expect(await loadProject("track-a--orphan")).toBeNull();
    expect(await loadProject("track-b--rss")).not.toBeNull();
  });
});
