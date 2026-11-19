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
  resetFileToStageStart,
  summarizeSuite,
  supportsProjectMode,
  updateFile,
  type ProjectWorkspace,
  type SuiteSummary,
} from "../../services/learning/project";
import { loadProject, saveProject } from "../../services/learning/projectStore";

const SAVE_DELAY_MS = 350;

export type ProjectSaveStatus = "saved" | "saving" | "memory";
export interface ProjectTab {
  path: string;
  readOnly: boolean;
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
}

/**
 * One workspace per project-mode topic. Files carry forward across lessons;
 * each unit with a project step adds one test file, and every run executes
 * every step's tests.
 */
export function useProjectWorkspace(track: CourseTrack | undefined, milestone: Milestone | null) {
  const plan = useMemo(() => (track ? curriculumForTrack(track) : null), [track]);
  const enabled = !!plan?.project && supportsProjectMode(track?.language);
  const trackId = enabled ? track!.id : "";
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [activePath, setActivePath] = useState("");
  const [status, setStatus] = useState<ProjectSaveStatus>("saved");
  const [preparation, setPreparation] = useState<StagePreparation | null>(null);
  const [lastSummary, setLastSummary] = useState<SuiteSummary | null>(null);
  const latest = useRef<ProjectWorkspace | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preparing = useRef<AbortController | null>(null);

  const unitId = milestone?.curriculum_unit_id;
  const unit = plan && unitId ? curriculumUnits(plan).find((u) => u.id === unitId) : undefined;
  const step = enabled ? unit?.projectStep?.trim() || undefined : undefined;
  const stage = workspace && unitId ? workspace.stages.find((s) => s.unitId === unitId) : undefined;
  const totalSteps = plan ? curriculumUnits(plan).filter((u) => u.projectStep?.trim()).length : 0;

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
      const ws = saved ?? emptyWorkspace(trackId);
      latest.current = ws;
      setWorkspace(ws);
      setActivePath(ws.files[0]?.path ?? "");
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

  useEffect(() => setLastSummary(null), [unitId]);

  const prepareStage = useCallback(async () => {
    if (!track || !unitId || !unit?.projectStep?.trim() || !latest.current) return;
    preparing.current?.abort();
    const controller = new AbortController();
    preparing.current = controller;
    setPreparation({ unitId, state: "loading" });
    try {
      const { prepareProjectStage } = await import("../../services/ai/curriculumOutline");
      const { stage: prepared } = await prepareProjectStage(track, unitId, latest.current, controller.signal);
      if (controller.signal.aborted || !latest.current) return;
      const next = applyStage(latest.current, unitId, unit.title, prepared);
      commit(next, true);
      const added = next.stages.find((s) => s.unitId === unitId)?.addedFiles[0]?.path;
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
  }, [track, unitId, unit, commit]);

  // Prepare the step once its lesson is ready, if it has none yet.
  useEffect(() => {
    if (!workspace || !step || stage || milestone?.content_status === "outline") return;
    if (preparation?.unitId === unitId) return;
    void prepareStage();
  }, [workspace, step, stage, milestone?.content_status, unitId, preparation?.unitId, prepareStage]);

  useEffect(() => () => preparing.current?.abort(), []);

  const tabs: ProjectTab[] = useMemo(() => {
    if (!workspace) return [];
    return [
      ...workspace.files.map((f) => ({ path: f.path, readOnly: false })),
      ...[...workspace.stages].sort((a, b) => a.number - b.number).map((s) => ({ path: s.testPath, readOnly: true })),
    ];
  }, [workspace]);

  /** Changes whenever any learner file changes (not on tab switches or recorded passes). */
  const revision = useMemo(() => {
    let hash = 2166136261;
    for (const f of workspace?.files ?? [])
      for (const text of [f.path, "\0", f.content, "\0"])
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return hash.toString(36);
  }, [workspace?.files]);

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
    const { executeGoProject } = await import("../../services/sandbox/api");
    const result = await executeGoProject(goPlaygroundBody(ws), ws.stages.length > 0);
    const current = unitId ? ws.stages.find((s) => s.unitId === unitId) : undefined;
    const summary = summarizeSuite(result.testResults, current?.number, result.exitCode);
    setLastSummary(summary);
    const stageJustPassed = !!current && summary.allPassed && !current.passedAt;
    if (stageJustPassed && latest.current) commit(markStagePassed(latest.current, unitId!), true);
    return { result, summary, stageJustPassed, stageNumber: current?.number };
  }, [flush, unitId, commit]);

  return {
    enabled,
    loaded: !!workspace,
    project: plan?.project,
    step,
    stage,
    totalSteps,
    preparation: preparation?.unitId === unitId ? preparation : null,
    lastSummary,
    status,
    revision,
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
      setActivePath(path);
      return true;
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
