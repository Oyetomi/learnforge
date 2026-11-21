import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CourseTrack } from "../../services/ai/types";
import type { ExecutionResult, Milestone } from "../../types";
import { curriculumForTrack, curriculumUnits } from "../../services/learning/curriculumPlan";
import {
  addFile,
  applyStage,
  emptyWorkspace,
  goPlaygroundBody,
  markStagePassed,
  projectPromptContext,
  markStageStarted,
  currentStageFor,
  nextPart,
  stageParts,
  unitBuildDone,
  unitStages,
  untouchedLegacyStage,
  recordPrediction,
  recordPrinciple,
  stageOfTest,
  removeFile,
  resetFileToStageStart,
  summarizeSuite,
  supportsProjectMode,
  updateFile,
  type PreparedStage,
  type ProjectWorkspace,
  type SuiteSummary,
} from "../../services/learning/project";
import { loadProject, saveProject } from "../../services/learning/projectStore";
import { loadLanguageStatus, profileFor, type LanguageStatus } from "../../services/languages";
import { runHeadline, runOutcome, type Headline, type Prediction } from "../../services/sandbox/runReport";

export interface ProjectRuntime {
  available: boolean;
  local: boolean;
  label: string;
  detail: string;
}

/**
 * The file to open first: the newest step's stub, else the entry file, else
 * the first source that is not a config file (go.mod, package.json…).
 */
export function initialFile(ws: ProjectWorkspace, language: string): string {
  const latest = [...ws.stages].sort((a, b) => b.number - a.number)[0];
  const stub = latest?.addedFiles.find((f) => ws.files.some((x) => x.path === f.path))?.path;
  if (stub) return stub;
  const entry = profileFor(language)?.entry;
  if (entry && ws.files.some((f) => f.path === entry)) return entry;
  const config = /(^|\/)(go\.(mod|sum)|package\.json|tsconfig\.json|Cargo\.toml)$/;
  return ws.files.find((f) => !config.test(f.path))?.path ?? ws.files[0]?.path ?? "";
}

/** A short hash of the learner's files. */
function revisionOf(files: { path: string; content: string }[]): string {
  let hash = 2166136261;
  for (const f of files)
    for (const text of [f.path, "\0", f.content, "\0"])
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash.toString(36);
}

/** Where this project's code runs: the sandboxed local toolchain, the Go Playground, or nowhere yet. */
export function projectRuntime(language: string, status: LanguageStatus[] | null | undefined): ProjectRuntime {
  const name = profileFor(language)?.name ?? language;
  const local = status?.find((p) => p.id === language);
  if (local?.runnable)
    return {
      available: true,
      local: true,
      label: `${name} · local sandbox`,
      detail: `Runs with your installed ${name} toolchain inside a sandbox: no internet, and it can write only to this project's folder.`,
    };
  if (language === "go")
    return {
      available: true,
      local: false,
      label: "Go Playground · cloud",
      detail: status
        ? "Go isn't installed on this Mac, so Run sends the project to the Go Playground. Install Go to run locally."
        : "Run sends the project to the Go Playground. The Mac app runs it locally when Go is installed.",
    };
  return {
    available: false,
    local: false,
    label: `${name} · not installed`,
    detail: status
      ? `Install ${local?.missing.join(", ") || name} to run this project. It runs on this Mac inside a sandbox.`
      : `${name} projects run in the Mac app with your installed toolchain.`,
  };
}

const SAVE_DELAY_MS = 350;

export type ProjectSaveStatus = "saved" | "saving" | "memory";
export interface ProjectTab {
  path: string;
  readOnly: boolean;
  /** Step tests: "Step 2 · Append-only log". */
  label?: string;
  stage?: number;
}
export interface StagePreparation {
  unitId: string;
  state: "loading" | "error";
  message?: string;
}
export interface ProjectRun {
  result: ExecutionResult;
  summary: SuiteSummary;
  /** True the first time the whole suite passes for the active step. */
  stageJustPassed: boolean;
  stageNumber?: number;
  /** Which part of the chapter's build this run was for. */
  part?: { n: number; total: number; title?: string };
  /** Every part of this chapter's build passes. */
  unitDone?: boolean;
  /** The part prepared next, if the chapter has more. */
  next?: { section: number; title?: string };
  /** The learner's prediction before this run, if any, and this step's prediction record. */
  prediction?: { expected: Prediction; why: string; actual: Prediction };
  predictions?: { made: number; matched: number };
}

/**
 * One workspace per project-mode topic. Files carry forward across lessons;
 * each unit with a project step adds one test file, and every run executes
 * every step's tests.
 */
export function useProjectWorkspace(track: CourseTrack | undefined, milestone: Milestone | null) {
  const plan = useMemo(() => (track ? curriculumForTrack(track) : null), [track]);
  const [languages, setLanguages] = useState<LanguageStatus[] | null | undefined>(undefined);
  const hasProjectPlan = !!plan?.project;
  // Re-evaluate once custom profiles from languages.json arrive via loadLanguageStatus().
  const enabled = useMemo(
    () => hasProjectPlan && supportsProjectMode(track?.language),
    [hasProjectPlan, track?.language, languages]
  );
  const trackId = enabled ? track!.id : "";
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [activePath, setActivePath] = useState("");
  const [status, setStatus] = useState<ProjectSaveStatus>("saved");
  const [preparation, setPreparation] = useState<StagePreparation | null>(null);
  const [lastSummary, setLastSummary] = useState<SuiteSummary | null>(null);
  const [lastHeadline, setLastHeadline] = useState<Headline | null>(null);
  /** A prediction made before the next run, and how the last one turned out. */
  const pendingPrediction = useRef<{ expected: Prediction; why: string } | null>(null);
  const [lastPrediction, setLastPrediction] = useState<{ expected: Prediction; why: string; actual: Prediction } | null>(null);
  /** The project revision when tests last ran; a prediction is asked again only after edits. */
  const [predictedRevision, setPredictedRevision] = useState<string | null>(null);
  const [predictOff, setPredictOff] = useState(false);
  /** A location to show after go-to-definition switches files. */
  const [reveal, setReveal] = useState<{ path: string; line: number; column: number; at: number } | null>(null);
  const latest = useRef<ProjectWorkspace | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preparing = useRef<AbortController | null>(null);

  const unitId = milestone?.curriculum_unit_id;
  const unit = plan && unitId ? curriculumUnits(plan).find((u) => u.id === unitId) : undefined;
  const step = enabled ? unit?.projectStep?.trim() || undefined : undefined;
  // A chapter's build comes in parts; the current part is the latest prepared.
  const stage = workspace && unitId ? currentStageFor(workspace, unitId) : undefined;
  const following = workspace && unitId ? nextPart(workspace, unitId) : null;
  const legacy = !!workspace && !!unitId && untouchedLegacyStage(workspace, unitId);
  const unitStarted = !!workspace && !!unitId && unitStages(workspace, unitId).some((s) => s.startedAt);
  const unitDone = !!workspace && !!unitId && unitBuildDone(workspace, unitId);
  const stepUnits = plan ? curriculumUnits(plan).filter((u) => u.projectStep?.trim()) : [];
  const totalSteps = stepUnits.length;
  /** 1-based position of this unit's step in the plan (0 for a concepts-only unit). */
  const stepNumber = stepUnits.findIndex((u) => u.id === unitId) + 1;
  const stepIndex = useMemo(() => new Map(stepUnits.map((u, i) => [u.id, i + 1])), [stepUnits.map((u) => u.id).join()]);
  /** "Step 3" for a one-part step, "Step 3.2" for part 2 of a chapter's build. */
  const stageName = useCallback(
    (s: { unitId: string; number: number; section?: number; outline?: string[] }) => {
      const n = stepIndex.get(s.unitId) ?? s.number;
      return s.outline?.length || (s.section ?? 1) > 1 ? `Step ${n}.${s.section ?? 1}` : `Step ${n}`;
    },
    [stepIndex]
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!latest.current) return;
    setStatus((await saveProject(latest.current)) ? "saved" : "memory");
  }, []);

  const commit = useCallback(
    (next: ProjectWorkspace, immediate = false) => {
      latest.current = next;
      setWorkspace(next);
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush]
  );

  useEffect(() => {
    if (!hasProjectPlan) return;
    let cancelled = false;
    void loadLanguageStatus().then((list) => {
      if (!cancelled) setLanguages(list);
    });
    return () => {
      cancelled = true;
    };
  }, [hasProjectPlan]);
  const runtime = projectRuntime(track?.language || "go", languages);

  // Load (or start) the workspace when the topic changes.
  useEffect(() => {
    setWorkspace(null);
    latest.current = null;
    setPreparation(null);
    setLastSummary(null);
    preparing.current?.abort();
    if (!trackId) return;
    let cancelled = false;
    void loadProject(trackId).then((saved) => {
      if (cancelled) return;
      const ws = saved ?? emptyWorkspace(trackId, track?.language || "go");
      latest.current = ws;
      setWorkspace(ws);
      setActivePath(initialFile(ws, track?.language || "go"));
    });
    return () => {
      cancelled = true;
      void flush();
    };
  }, [trackId, flush]);

  useEffect(() => {
    const save = () => void flush();
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
    };
  }, [flush]);

  useEffect(() => {
    setLastSummary(null);
    setLastHeadline(null);
    setLastPrediction(null);
    setPredictedRevision(null);
  }, [unitId, stage?.number]);
  useEffect(() => {
    try {
      setPredictOff(!!trackId && localStorage.getItem(`learnforge:predict-off:${trackId}`) === "1");
    } catch {
      setPredictOff(false);
    }
  }, [trackId]);

  /** Units whose old one-step stage was already re-prepared as parts this session. */
  const reprepared = useRef(new Set<string>());
  const prepareStage = useCallback(async () => {
    if (!track || !unitId || !unit?.projectStep?.trim() || !latest.current) return;
    // Which part: the next one after a passed part, otherwise the current one (or the first).
    const now = currentStageFor(latest.current, unitId);
    const upcoming = nextPart(latest.current, unitId);
    const section = upcoming?.section ?? now?.section ?? 1;
    if (untouchedLegacyStage(latest.current, unitId)) reprepared.current.add(unitId);
    preparing.current?.abort();
    const controller = new AbortController();
    preparing.current = controller;
    setPreparation({ unitId, state: "loading" });
    try {
      const { prepareProjectStage } = await import("../../services/ai/curriculumOutline");
      // In the Mac app, a proposed step must compile against the current files
      // before it is shown (Go compiles every step's tests together).
      const check = runtime.local
        ? async (candidate: PreparedStage, number: number, testPath: string) => {
            const { checkLocalStage, syncLocalProject } = await import("../../services/sandbox/local");
            const base = latest.current!;
            const trial = applyStage(base, unitId, unit.title, candidate, Date.now(), section);
            const actualTestPath = trial.stages.find((s) => s.number === number)?.testPath ?? testPath;
            try {
              const problem = await checkLocalStage(trial, number, actualTestPath);
              if (problem) await syncLocalProject(latest.current ?? base).catch(() => {});
              return problem;
            } catch (err) {
              await syncLocalProject(latest.current ?? base).catch(() => {});
              throw err;
            }
          }
        : undefined;
      const { stage: prepared } = await prepareProjectStage(track, unitId, latest.current, controller.signal, check, section);
      if (controller.signal.aborted || !latest.current) return;
      const before = new Set(latest.current.files.map((f) => f.path));
      const next = applyStage(latest.current, unitId, unit.title, prepared, Date.now(), section);
      commit(next, true);
      if (runtime.local) {
        void import("../../services/sandbox/local").then(({ syncLocalProject }) => syncLocalProject(next)).catch(() => {});
      }
      const added = next.files.find((f) => !before.has(f.path))?.path;
      setActivePath((current) => added ?? (current || next.files[0]?.path || ""));
      setPreparation(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPreparation({
        unitId,
        state: "error",
        message: error instanceof Error ? error.message : "The project step could not be prepared.",
      });
    }
  }, [track, unitId, unit, commit, runtime.local]);

  // Prepare the step once its lesson is ready and toolchain status is known
  // (so local compile-checking is never skipped on initial load).
  useEffect(() => {
    if (!workspace || !step || milestone?.content_status === "outline" || languages === undefined) return;
    const redo = legacy && !!unitId && !reprepared.current.has(unitId);
    if (stage && !following && !redo) return;
    if (preparation?.unitId === unitId) return;
    void prepareStage();
  }, [workspace, step, stage, following, legacy, milestone?.content_status, languages, unitId, preparation?.unitId, prepareStage]);

  useEffect(() => () => preparing.current?.abort(), []);

  const unitTitles = useMemo(
    () => new Map((plan ? curriculumUnits(plan) : []).map((u) => [u.id, u.title])),
    [plan]
  );
  const tabs: ProjectTab[] = useMemo(() => {
    if (!workspace) return [];
    return [
      ...workspace.files.map((f) => ({ path: f.path, readOnly: false })),
      ...[...workspace.stages].sort((a, b) => a.number - b.number).map((s) => ({
        path: s.testPath,
        readOnly: true,
        stage: s.number,
        label: `${stageName(s)} · ${s.title ?? unitTitles.get(s.unitId) ?? "tests"}`,
      })),
    ];
  }, [workspace, unitTitles, stageName]);

  /** Changes whenever any learner file changes (not on tab switches or recorded passes). */
  const revision = useMemo(() => revisionOf(workspace?.files ?? []), [workspace?.files]);

  const allFiles = useMemo(
    () =>
      !workspace
        ? []
        : [
            ...workspace.files.map((f) => ({ path: f.path, content: f.content, readOnly: false })),
            ...workspace.stages.map((st) => ({ path: st.testPath, content: st.tests, readOnly: true })),
          ],
    [workspace]
  );

  const activeTab = tabs.find((t) => t.path === activePath) ?? tabs[0];
  const activeContent = !workspace || !activeTab
    ? ""
    : activeTab.readOnly
    ? workspace.stages.find((s) => s.testPath === activeTab.path)?.tests ?? ""
    : workspace.files.find((f) => f.path === activeTab.path)?.content ?? "";

  const run = useCallback(async (): Promise<ProjectRun> => {
    await flush();
    const ws = latest.current;
    if (!ws) throw new Error("The project is still loading.");
    if (!ws.files.length) throw new Error("The project has no files yet. Its first step adds them.");
    let result: ExecutionResult;
    if (runtime.local) {
      const { runLocalProject } = await import("../../services/sandbox/local");
      result = await runLocalProject(ws);
    } else if (ws.language === "go") {
      const { executeGoProject } = await import("../../services/sandbox/api");
      result = await executeGoProject(goPlaygroundBody(ws), ws.stages.length > 0);
    } else throw new Error(runtime.detail);
    const current = unitId ? currentStageFor(ws, unitId) : undefined;
    // The Go Playground reports test functions; group them into steps like local runs.
    if (!result.stepRuns && ws.stages.length && result.testResults?.length) {
      const tests = result.testResults;
      result = {
        ...result,
        stepRuns: [...ws.stages].sort((a, b) => a.number - b.number).map((st) => {
          const own = tests.filter((t) => stageOfTest(t.name.split("/")[0]) === st.number);
          return {
            number: st.number,
            label: st.testPath,
            passed: own.length > 0 && own.every((t) => t.passed),
            timedOut: false,
            durationMs: 0,
            command: "go test",
            output: own.map((t) => (t.passed ? `--- PASS: ${t.name}` : `--- FAIL: ${t.name}\n${t.error ?? ""}`)).join("\n"),
          };
        }),
      };
    }
    if (result.stepRuns)
      result = {
        ...result,
        stepRuns: result.stepRuns.map((r) => {
          const st = ws.stages.find((x) => x.number === r.number);
          return st ? { ...r, label: st.title ?? unitTitles.get(st.unitId) ?? r.label } : r;
        }),
      };
    const summary = summarizeSuite(result.testResults, current?.number, result.exitCode);
    // Show results by step ("Step 2 · Append-only log") rather than raw test names.
    if (result.testResults)
      result = {
        ...result,
        testResults: result.testResults.map((r) => {
          const n = stageOfTest(r.name.split("/")[0]);
          const stage = n === null ? undefined : ws.stages.find((s) => s.number === n);
          if (!stage) return r;
          const title = stage.title ?? unitTitles.get(stage.unitId) ?? stage.testPath;
          const local = / · /.test(r.name);
          const fn = r.name.replace(/^TestStage\d{2}/, "");
          return { ...r, name: `${stageName(stage)} · ${title}${!local && fn ? ` · ${fn}` : ""}` };
        }),
      };
    setLastSummary(summary);
    setLastHeadline(runHeadline(result, current?.number));
    const prediction = pendingPrediction.current;
    pendingPrediction.current = null;
    let made: ProjectRun["prediction"];
    if (prediction && current && latest.current) {
      made = { ...prediction, actual: runOutcome(result) };
      setLastPrediction(made);
      commit(recordPrediction(latest.current, current.unitId, made.actual === prediction.expected), true);
    } else setLastPrediction(null);
    setPredictedRevision(revisionOf(ws.files));
    const stageJustPassed = !!current && summary.allPassed && !current.passedAt;
    if (stageJustPassed && latest.current) commit(markStagePassed(latest.current, unitId!), true);
    const after = latest.current;
    const predictions = after && current ? after.stages.find((s) => s.number === current.number)?.predictions : undefined;
    const coming = after && unitId ? nextPart(after, unitId) : null;
    return {
      result,
      summary,
      stageJustPassed,
      stageNumber: current?.number,
      prediction: made,
      predictions,
      part: current ? { n: current.section ?? 1, total: stageParts(current), title: current.title } : undefined,
      unitDone: !!after && !!unitId && unitBuildDone(after, unitId),
      next: coming ?? undefined,
    };
  }, [flush, unitId, commit, runtime.local, runtime.detail, unitTitles, stageName]);

  return {
    enabled,
    loaded: !!workspace,
    project: plan?.project,
    step,
    stage,
    totalSteps,
    stepNumber,
    /** The chapter's build: which part, how many, and their titles. */
    part: stage ? { n: stage.section ?? 1, total: stageParts(stage), title: stage.title, outline: stage.outline ?? [] } : undefined,
    /** The learner started building this chapter with the tutor. */
    started: unitStarted,
    /** Every part of this chapter's build passes. */
    unitDone,
    preparation: preparation?.unitId === unitId ? preparation : null,
    lastSummary,
    lastHeadline,
    lastPrediction,
    /** Ask for a prediction before this run: a step with tests, edited since the last run, unless turned off. */
    wantsPrediction: !predictOff && !!stage && predictedRevision !== revision,
    predict(expected: Prediction, why: string) {
      pendingPrediction.current = { expected, why: why.trim().slice(0, 500) };
    },
    skipPrediction() {
      pendingPrediction.current = null;
    },
    setPredictionsOff(off: boolean) {
      setPredictOff(off);
      try {
        localStorage.setItem(`learnforge:predict-off:${trackId}`, off ? "1" : "0");
      } catch {
        /* Preference only. */
      }
    },
    /** The learner starts building this step (with the tutor). */
    startStep() {
      if (latest.current && unitId) commit(markStageStarted(latest.current, unitId), true);
    },
    /** Keep the principle the tutor named for this step. */
    recordPrinciple(text: string) {
      if (!latest.current || !unitId) return;
      const current = currentStageFor(latest.current, unitId);
      if (!current || current.principle === text.trim()) return;
      commit(recordPrinciple(latest.current, unitId, text), true);
    },
    principles: (workspace?.stages ?? [])
      .filter((s) => s.principle)
      .sort((a, b) => a.number - b.number)
      .map((s) => ({ number: s.number, principle: s.principle! })),
    status,
    revision,
    runtime,
    language: track?.language || "go",
    trackId,
    allFiles,
    reveal,
    /** Switch to a file and show a position (go-to-definition into another file). */
    openAt(path: string, line: number, column: number) {
      setActivePath(path);
      setReveal({ path, line, column, at: Date.now() });
    },
    /** Update any learner file by path (edits made outside the active tab, such as rename). */
    updatePath(path: string, content: string) {
      const current = latest.current?.files.find((f) => f.path === path);
      if (!latest.current || !current || current.content === content) return;
      commit(updateFile(latest.current, path, content));
    },
    /** Write the project to its local folder (language servers read files there). */
    async syncToDisk() {
      await flush();
      if (!latest.current || !runtime.local) return;
      const { syncLocalProject } = await import("../../services/sandbox/local");
      await syncLocalProject(latest.current);
    },
    languageReady: languages !== undefined,
    tabs,
    activePath: activeTab?.path ?? "",
    activeReadOnly: !!activeTab?.readOnly,
    activeContent,
    selectFile: setActivePath,
    updateActive(content: string) {
      if (!latest.current || !activeTab || activeTab.readOnly) return;
      commit(updateFile(latest.current, activeTab.path, content));
    },
    addFile(path: string): boolean {
      if (!latest.current) return false;
      const next = addFile(latest.current, path);
      if (next === latest.current) return false;
      commit(next, true);
      if (runtime.local) {
        void import("../../services/sandbox/local").then(({ syncLocalProject }) => syncLocalProject(next)).catch(() => {});
      }
      setActivePath(path);
      return true;
    },
    removeFile(path: string) {
      if (!latest.current) return;
      const next = removeFile(latest.current, path);
      if (next === latest.current) return;
      commit(next, true);
      if (runtime.local) {
        void import("../../services/sandbox/local").then(({ syncLocalProject }) => syncLocalProject(next)).catch(() => {});
      }
      setActivePath((current) => (current === path ? next.files[0]?.path ?? "" : current));
    },
    /** Reset the active file to how it was when this step began. */
    resetActive() {
      if (!latest.current || !activeTab || activeTab.readOnly || !unitId) return;
      commit(resetFileToStageStart(latest.current, unitId, activeTab.path), true);
    },
    canResetActive: !!stage && !!activeTab && !activeTab.readOnly &&
      (stage.startFiles.some((f) => f.path === activeTab.path) || stage.addedFiles.some((f) => f.path === activeTab.path)),
    retryPreparation: prepareStage,
    run,
    promptContext: () => (latest.current ? projectPromptContext(latest.current, unitId) : ""),
  };
}

export type ProjectWorkspaceController = ReturnType<typeof useProjectWorkspace>;
