/**
 * Project mode: one codebase built across a curriculum (see docs/project-mode.md).
 *
 * Pure workspace logic. Stages only add files and tests; the learner's files
 * are never overwritten, and every run executes every stage's tests. File
 * rules come from the language profile (src/services/languages/profiles.json).
 */
import {
  isSourcePath,
  profileFor,
  stageTestFile,
  starterSources,
  supportsProjectMode,
  type LanguageProfile,
} from "../languages";

export { supportsProjectMode };

export interface ProjectPlan {
  /** Durable identifier within a curriculum (defaults to "main" on legacy single-project plans). */
  id?: string;
  title: string;
  summary: string;
  /** Whether the project comes directly from a supplied book/source or was designed for the goal. */
  source?: "book" | "designed";
}

function fnv1aHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0").slice(0, 7);
}

/**
 * Storage and sandbox folder key for a track's project workspace.
 * Single-project plans keep the bare `trackId` for backward compatibility.
 * Multi-project plans derive a deterministic `[A-Za-z0-9_-]` key <= 100 chars.
 */
export function projectWorkspaceKey(trackId: string, projectId?: string, multiProject = false): string {
  const trimmed = projectId?.trim();
  if (!multiProject || !trimmed || trimmed === "main") return trackId;
  const clean =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "p";
  const safeTrack = trackId.replace(/[^A-Za-z0-9_-]+/g, "_") || "track";
  const combined = `${safeTrack}--${clean}`;
  if (combined.length <= 100) return combined;
  const suffix = `_${fnv1aHash(`${trackId}--${trimmed}`)}`;
  const prefix = combined.slice(0, 100 - suffix.length);
  return `${prefix}${suffix}`;
}

/** All workspace keys that may exist for a track, deduplicated. */
export function allTrackWorkspaceKeys(trackId: string, projects: { id: string }[]): string[] {
  const keys = new Set<string>([trackId]);
  if (projects.length > 1) {
    for (const p of projects) {
      keys.add(projectWorkspaceKey(trackId, p.id, true));
    }
  }
  return [...keys];
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface ProjectStage {
  unitId: string;
  /** 1-based, in preparation order. */
  number: number;
  task: string;
  testPath: string;
  tests: string;
  /** Stub files this stage added, as first added (paths that did not exist before). */
  addedFiles: ProjectFile[];
  /** The learner's files when the stage started, for Reset. */
  startFiles: ProjectFile[];
  passedAt?: number;
  /**
   * A chapter's build comes in small parts, like sections of a book: each part
   * is its own stage with its own test file. 1-based; absent on older stages.
   */
  section?: number;
  /** This part's title, e.g. "Append every write to a log file". */
  title?: string;
  /** The chapter's parts, in order (stored on every part of the chapter). */
  outline?: string[];
  /** When the learner started building this step with the tutor. */
  startedAt?: number;
  /** The reusable idea this step taught, named by the tutor once it passed. */
  principle?: string;
  /** Learner predictions before runs of this step, and how many matched. */
  predictions?: { made: number; matched: number };
}

export interface ProjectWorkspace {
  schemaVersion: 1;
  trackId: string;
  /** Language profile id. */
  language: string;
  files: ProjectFile[];
  stages: ProjectStage[];
  updatedAt: number;
}

export const MAX_PROJECT_FILES = 24;
export const MAX_FILE_CHARS = 60_000;
export const PROMPT_CONTEXT_CHARS = 24_000;

const profile = (language: string): LanguageProfile => {
  const found = profileFor(language);
  if (!found) throw new Error(`No language profile for ${language}.`);
  return found;
};

/**
 * A learner-owned source path for this language, never a step test.
 * Go also reserves prog.go, the Playground's unnamed first file.
 */
export function validLearnerPath(path: string, language = "go"): boolean {
  const p = profileFor(language);
  return !!p && isSourcePath(p, path) && !(language === "go" && path === "prog.go");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function stageTestPath(number: number, title: string, language = "go"): string {
  return stageTestFile(profile(language), number, title);
}

/** A new workspace starts with the language's starter sources (for example Rust's src/lib.rs). */
export function emptyWorkspace(trackId: string, language = "go"): ProjectWorkspace {
  const p = profileFor(language);
  return {
    schemaVersion: 1,
    trackId,
    language,
    files: p ? starterSources(p).map((f) => ({ ...f })) : [],
    stages: [],
    updatedAt: Date.now(),
  };
}

const goPackage = (source: string) => /^\s*(?:\/\/[^\n]*\n|\s)*package\s+(\w+)/.exec(source)?.[1];

/**
 * Check one stage's test file so stages compose without name collisions.
 * Returns a learner-readable problem, or null when the file is acceptable.
 */
export function stageTestProblem(tests: string, number: number, language = "go"): string | null {
  if (!tests.trim()) return "The step has no tests.";
  if (tests.length > MAX_FILE_CHARS) return "The step's tests are too long.";
  // Go compiles every test file in the package together, so its stages need
  // unique names. Other languages run each step's file on its own.
  if (!profileFor(language)?.testNamePrefix) return null;
  if (goPackage(tests) !== "main") return "Step tests must use package main.";
  if (!/import\s*(?:\(\s*[^)]*"testing"[^)]*\)|"testing")/.test(tests))
    return "Step tests must import the testing package.";
  const stage = `Stage${pad(number)}`;
  const names = [...tests.matchAll(/^func\s+(?:\([^)]*\)\s*)?(\w+)/gm)].map((m) => m[1]);
  if (!names.some((n) => n.startsWith(`Test${stage}`)))
    return `Step tests must include at least one Test${stage}… function.`;
  const bad = names.find((n) => !n.startsWith(`Test${stage}`) && !n.startsWith(`stage${pad(number)}`));
  if (bad) return `Test helper "${bad}" must be prefixed stage${pad(number)} so steps do not collide.`;
  if (/^(?:type|var|const)\b/m.test(tests))
    return "Step tests may not declare top-level types, variables or constants.";
  return null;
}

export interface PreparedStage {
  task: string;
  tests: string;
  files: ProjectFile[];
  /** This part's title. */
  title?: string;
  /** The chapter's parts (proposed with the first part). */
  outline?: string[];
}

/** The parts of a unit's build so far, in order. */
export function unitStages(ws: ProjectWorkspace, unitId?: string): ProjectStage[] {
  return ws.stages.filter((s) => s.unitId === unitId).sort((a, b) => a.number - b.number);
}

/** The part of a unit's build the learner is on: the latest one prepared. */
export function currentStageFor(ws: ProjectWorkspace, unitId?: string): ProjectStage | undefined {
  const list = unitStages(ws, unitId);
  return list[list.length - 1];
}

/** How many parts this unit's build has (1 for older single-step stages). */
export function stageParts(stage: ProjectStage | undefined): number {
  return Math.max(stage?.outline?.length ?? 1, stage?.section ?? 1);
}

/** Every part of the unit's build passes. */
export function unitBuildDone(ws: ProjectWorkspace, unitId?: string): boolean {
  const current = currentStageFor(ws, unitId);
  return !!current?.passedAt && (current.section ?? 1) >= stageParts(current);
}

/** The next part to prepare once the current one passes, if any. */
export function nextPart(ws: ProjectWorkspace, unitId?: string): { section: number; title?: string } | null {
  const current = currentStageFor(ws, unitId);
  if (!current?.passedAt) return null;
  const section = (current.section ?? 1) + 1;
  return section <= stageParts(current) ? { section, title: current.outline?.[section - 1] } : null;
}

/** A stage prepared in the old one-step format that the learner never touched. */
export function untouchedLegacyStage(ws: ProjectWorkspace, unitId?: string): boolean {
  const list = unitStages(ws, unitId);
  const stage = list[0];
  if (list.length !== 1 || !stage || stage.outline || stage.passedAt || stage.startedAt) return false;
  const original = new Map([...stage.startFiles, ...stage.addedFiles].map((f) => [f.path, f.content]));
  return ws.files.every((f) => original.get(f.path) === f.content);
}

/** Validate a model's stage proposal. Throws with a retryable message. */
export function parsePreparedStage(value: unknown, number: number, language = "go"): PreparedStage {
  const v = value as { task?: unknown; test_file?: unknown; new_files?: unknown; title?: unknown; outline?: unknown };
  const text = (s: unknown, max: number): s is string =>
    typeof s === "string" && !!s.trim() && s.length <= max;
  if (!v || !text(v.task, 4000)) throw new Error("The project step had no task description. Retry.");
  if (typeof v.test_file !== "string") throw new Error("The project step had no tests. Retry.");
  const problem = stageTestProblem(v.test_file, number, language);
  if (problem) throw new Error(`${problem} Retry.`);
  const files: ProjectFile[] = [];
  for (const f of Array.isArray(v.new_files) ? v.new_files : []) {
    const path = typeof f?.path === "string" ? f.path.trim() : "";
    const content = typeof f?.content === "string" ? f.content : "";
    if (!validLearnerPath(path, language) || content.length > MAX_FILE_CHARS) continue;
    // Root Go files share the tests' package; files in folders are other packages.
    if (language === "go" && path.endsWith(".go") && !path.includes("/") && goPackage(content) !== "main") continue;
    if (!files.some((x) => x.path === path)) files.push({ path, content });
  }
  const title = typeof v.title === "string" && v.title.trim() ? v.title.trim().slice(0, 120) : undefined;
  const outline = Array.isArray(v.outline)
    ? v.outline.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim().slice(0, 120)).slice(0, 6)
    : [];
  return { task: v.task.trim(), tests: v.test_file, files, ...(title ? { title } : {}), ...(outline.length ? { outline } : {}) };
}

/**
 * Add a prepared stage. New files are added only at unused paths; an existing
 * learner file always wins. Re-preparing a unit's stage replaces that stage's
 * tests but keeps its number.
 */
export function applyStage(
  ws: ProjectWorkspace,
  unitId: string,
  unitTitle: string,
  prepared: PreparedStage,
  now = Date.now(),
  /** Which part of the unit's build this is (1 unless a later part). */
  section = 1
): ProjectWorkspace {
  const existing = ws.stages.find((s) => s.unitId === unitId && (s.section ?? 1) === section);
  const first = unitStages(ws, unitId)[0];
  const outline = section === 1 ? prepared.outline : first?.outline;
  const number = existing?.number ?? ws.stages.length + 1;
  const taken = new Set(ws.files.map((f) => f.path));
  const room = Math.max(0, MAX_PROJECT_FILES - ws.files.length);
  const added = prepared.files.filter((f) => !taken.has(f.path)).slice(0, room);
  const stage: ProjectStage = {
    unitId,
    number,
    task: prepared.task,
    testPath: existing?.testPath ?? stageTestPath(number, prepared.title || unitTitle, ws.language),
    tests: prepared.tests,
    addedFiles: [...(existing?.addedFiles || []), ...added],
    startFiles: existing?.startFiles ?? ws.files,
    section,
    ...(prepared.title ? { title: prepared.title } : {}),
    ...(outline?.length ? { outline } : {}),
    ...(existing?.startedAt || first?.startedAt ? { startedAt: existing?.startedAt ?? first?.startedAt } : {}),
  };
  return {
    ...ws,
    files: [...ws.files, ...added],
    stages: existing
      ? ws.stages.map((s) => (s.number === existing.number ? stage : s))
      : [...ws.stages, stage],
    updatedAt: now,
  };
}

export function updateFile(ws: ProjectWorkspace, path: string, content: string, now = Date.now()): ProjectWorkspace {
  if (!ws.files.some((f) => f.path === path)) return ws;
  return { ...ws, files: ws.files.map((f) => (f.path === path ? { ...f, content } : f)), updatedAt: now };
}

export function addFile(ws: ProjectWorkspace, path: string, now = Date.now()): ProjectWorkspace {
  if (!validLearnerPath(path, ws.language) || ws.files.some((f) => f.path === path) || ws.files.length >= MAX_PROJECT_FILES)
    return ws;
  return { ...ws, files: [...ws.files, { path, content: starterContent(ws.language, path) }], updatedAt: now };
}

/** A new file's first line where the language needs one (Go's package clause). */
function starterContent(language: string, path: string): string {
  if (language !== "go" || !path.endsWith(".go")) return "";
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const pkg = dir ? dir.slice(dir.lastIndexOf("/") + 1).replace(/[^a-z0-9_]/g, "") || "main" : "main";
  return `package ${pkg}\n`;
}

/** Remove a file the learner created (never a step's test file). */
export function removeFile(ws: ProjectWorkspace, path: string, now = Date.now()): ProjectWorkspace {
  if (!ws.files.some((f) => f.path === path)) return ws;
  return { ...ws, files: ws.files.filter((f) => f.path !== path), updatedAt: now };
}

/** Restore one file to how it was when the stage began, or to the stub the stage added. */
export function resetFileToStageStart(ws: ProjectWorkspace, unitId: string, path: string, now = Date.now()): ProjectWorkspace {
  const stage = currentStageFor(ws, unitId);
  const original =
    stage?.startFiles.find((f) => f.path === path) ?? stage?.addedFiles.find((f) => f.path === path);
  return original ? updateFile(ws, path, original.content, now) : ws;
}

/** The learner started building this step (the tutor kicked it off). */
export function markStageStarted(ws: ProjectWorkspace, unitId: string, now = Date.now()): ProjectWorkspace {
  const current = currentStageFor(ws, unitId);
  if (!current || current.startedAt) return ws;
  return { ...ws, stages: ws.stages.map((s) => (s.number === current.number ? { ...s, startedAt: now } : s)), updatedAt: now };
}

/** Remember the reusable principle the tutor named for a passed step. */
export function recordPrinciple(ws: ProjectWorkspace, unitId: string, principle: string, now = Date.now()): ProjectWorkspace {
  const text = principle.trim().slice(0, 300);
  const current = currentStageFor(ws, unitId);
  if (!text || !current) return ws;
  return { ...ws, stages: ws.stages.map((s) => (s.number === current.number ? { ...s, principle: text } : s)), updatedAt: now };
}

/** Count a prediction made before a run of this step. */
export function recordPrediction(ws: ProjectWorkspace, unitId: string, matched: boolean, now = Date.now()): ProjectWorkspace {
  const current = currentStageFor(ws, unitId);
  return {
    ...ws,
    stages: ws.stages.map((s) =>
      s.number === current?.number
        ? { ...s, predictions: { made: (s.predictions?.made ?? 0) + 1, matched: (s.predictions?.matched ?? 0) + (matched ? 1 : 0) } }
        : s
    ),
    updatedAt: now,
  };
}

/** Record a fully passing run for the active unit's stage. */
export function markStagePassed(ws: ProjectWorkspace, unitId: string, now = Date.now()): ProjectWorkspace {
  const current = currentStageFor(ws, unitId);
  if (!current) return ws;
  return {
    ...ws,
    stages: ws.stages.map((s) => (s.number === current.number ? { ...s, passedAt: s.passedAt ?? now } : s)),
    updatedAt: now,
  };
}

/**
 * Go Playground txtar body. With stages, the first stage's tests are the
 * unnamed prog.go, which puts the Playground in test mode: it then runs every
 * _test.go file and ignores main(). Without stages, the program runs normally.
 */
export function goPlaygroundBody(ws: ProjectWorkspace): string {
  const section = (path: string, content: string) => `-- ${path} --\n${content.replace(/\n?$/, "\n")}`;
  const sources = ws.files.map((f) => section(f.path, f.content));
  if (!ws.stages.length) return sources.join("");
  const [first, ...others] = [...ws.stages].sort((a, b) => a.number - b.number);
  return [
    first.tests.replace(/\n?$/, "\n"),
    ...others.map((s) => section(s.testPath, s.tests)),
    ...sources,
  ].join("");
}

/** Which stage a Go test belongs to, from its required TestStageNN prefix. */
export function stageOfTest(name: string): number | null {
  const m = /^TestStage(\d{2})/.exec(name);
  return m ? Number(m[1]) : null;
}

export interface SuiteSummary {
  total: number;
  passed: number;
  /** Earlier stages whose tests fail: a regression. */
  brokenEarlier: number[];
  currentPassed: boolean;
  allPassed: boolean;
}

export function summarizeSuite(
  results: { name: string; passed: boolean }[] | undefined,
  currentStage: number | undefined,
  exitCode: number
): SuiteSummary {
  const list = results || [];
  const broken = new Set<number>();
  let currentSeen = false,
    currentFailed = false;
  for (const r of list) {
    const stage = stageOfTest(r.name.split("/")[0]);
    if (stage === null) continue;
    if (stage === currentStage) {
      currentSeen = true;
      if (!r.passed) currentFailed = true;
    } else if (!r.passed && currentStage !== undefined && stage < currentStage) broken.add(stage);
  }
  const passed = list.filter((r) => r.passed).length;
  return {
    total: list.length,
    passed,
    brokenEarlier: [...broken].sort((a, b) => a - b),
    currentPassed: currentSeen && !currentFailed,
    allPassed: exitCode === 0 && list.length > 0 && passed === list.length,
  };
}

/** Path-labelled files for the tutor, bounded so large projects stay within context. */
export function projectPromptContext(ws: ProjectWorkspace, activeUnitId?: string, max = PROMPT_CONTEXT_CHARS): string {
  const stage = currentStageFor(ws, activeUnitId);
  const parts: string[] = [];
  if (stage) {
    const outline = stage.outline?.length
      ? `\nThis chapter's build has ${stage.outline.length} parts: ${stage.outline.map((t, i) => `${i + 1}. ${t}${i + 1 < (stage.section ?? 1) ? " (done)" : i + 1 === (stage.section ?? 1) ? " (current)" : ""}`).join("; ")}.`
      : "";
    parts.push(`Current project part${stage.title ? ` "${stage.title}"` : ""}:${outline}\n${stage.task}\nTests for this part are in ${stage.testPath}.`);
  }
  let used = parts.join("").length;
  let omitted = 0;
  for (const f of ws.files) {
    const block = `// ==== ${f.path} ====\n${f.content}`;
    if (used + block.length > max) {
      omitted++;
      continue;
    }
    parts.push(block);
    used += block.length;
  }
  if (omitted) parts.push(`// ${omitted} more file(s) omitted for length.`);
  return parts.join("\n\n");
}

/** Bounded file listing for preparing the next step. */
export function filesForPrompt(ws: ProjectWorkspace, max = PROMPT_CONTEXT_CHARS): { path: string; content: string; truncated?: boolean }[] {
  let used = 0;
  return ws.files.map((f) => {
    const room = Math.max(0, max - used);
    used += Math.min(room, f.content.length);
    return f.content.length > room ? { path: f.path, content: f.content.slice(0, room), truncated: true } : f;
  });
}

export function validWorkspace(value: unknown): value is ProjectWorkspace {
  const w = value as ProjectWorkspace;
  return (
    !!w &&
    w.schemaVersion === 1 &&
    typeof w.trackId === "string" &&
    typeof w.language === "string" &&
    !!profileFor(w.language) &&
    Array.isArray(w.files) &&
    w.files.every((f) => f && validLearnerPath(f.path, w.language) && typeof f.content === "string") &&
    Array.isArray(w.stages) &&
    w.stages.every(
      (s) =>
        s &&
        typeof s.unitId === "string" &&
        Number.isInteger(s.number) &&
        typeof s.task === "string" &&
        typeof s.tests === "string" &&
        typeof s.testPath === "string" &&
        Array.isArray(s.addedFiles) &&
        Array.isArray(s.startFiles)
    )
  );
}
