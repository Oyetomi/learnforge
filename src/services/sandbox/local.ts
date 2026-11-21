/**
 * Local, sandboxed project runs in the Mac app (src-tauri/src/project.rs).
 * Each step's tests run on their own, so pass/fail per step comes from the
 * exit code in every language.
 */
import type { ExecutionResult, StepRun, TestResult } from "../../types";

/** Remove terminal colour codes and carriage-return redraws. */
export const cleanOutput = (text: string) =>
  text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
import type { ProjectWorkspace } from "../learning/project";

interface StepOutput {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}
interface ExecResult {
  steps: StepOutput[];
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const invoke = async <T>(cmd: string, args: Record<string, unknown>) =>
  (await import("@tauri-apps/api/core")).invoke<T>(cmd, args);

const TOTAL_PROJECT_RUN_MS = 120_000;
let runCounter = 0;
let activeRun: { requestId: string | null; cancelled: boolean } | null = null;

/** Write the workspace (sources and every step's tests) to its project folder. */
export async function syncLocalProject(ws: ProjectWorkspace): Promise<string> {
  const files = [
    ...ws.files,
    ...ws.stages.map((s) => ({ path: s.testPath, content: s.tests })),
  ];
  return invoke<string>("project_sync", { trackId: ws.trackId, profileId: ws.language, files });
}

/** Delete the local on-disk project folder (Mac app only). */
export async function deleteLocalProject(trackId: string): Promise<void> {
  if (!isTauri() || !trackId) return;
  await invoke("project_delete", { trackId }).catch(() => {});
}

const transcript = (r: ExecResult) =>
  r.steps.map((s) => [cleanOutput(s.stdout).trim(), cleanOutput(s.stderr).trim()].filter(Boolean).join("\n")).join("\n\n");

/**
 * Compile a step's tests against the workspace without running anything.
 * Returns null when they compile, else the compiler's output.
 */
export async function checkLocalStage(ws: ProjectWorkspace, number: number, testFile: string): Promise<string | null> {
  await syncLocalProject(ws);
  const r = await exec(ws, "check", { number, testFile }, null);
  return r.exitCode === 0 ? null : transcript(r).slice(-4000) || `The compile check exited with status ${r.exitCode}.`;
}

async function exec(
  ws: ProjectWorkspace,
  action: "run" | "test" | "check" | "tool",
  stage?: { number: number; testFile: string },
  runHandle: { requestId: string | null; cancelled: boolean } | null = activeRun,
  toolId?: string
) {
  const requestId = `run-${Date.now().toString(36)}-${++runCounter}`;
  if (runHandle) runHandle.requestId = requestId;
  try {
    return await invoke<ExecResult>("project_exec", {
      trackId: ws.trackId,
      profileId: ws.language,
      action,
      stage: stage ?? null,
      requestId,
      toolId: toolId ?? null,
    });
  } finally {
    if (runHandle && runHandle.requestId === requestId) runHandle.requestId = null;
  }
}

/** Run a language profile's sandboxed tool action (e.g. go vet, coverage, benchmarks). */
export async function runLocalProjectTool(ws: ProjectWorkspace, toolId: string): Promise<ExecutionResult> {
  const started = performance.now();
  const handle = { requestId: null as string | null, cancelled: false };
  activeRun = handle;
  try {
    await syncLocalProject(ws);
    if (handle.cancelled) {
      return { stdout: "", stderr: "Stopped.", exitCode: -1, durationMs: Math.round(performance.now() - started), error: "Stopped." };
    }
    const r = await exec(ws, "tool", undefined, handle, toolId);
    const stdout = cleanOutput(r.steps.map((s) => s.stdout).join("")).trim();
    if (handle.cancelled) {
      return {
        stdout,
        stderr: "Stopped.",
        exitCode: -1,
        durationMs: Math.round(performance.now() - started),
        timedOut: r.timedOut,
        error: "Stopped.",
      };
    }
    const stderr =
      cleanOutput(r.steps.map((s) => s.stderr).join("\n")).trim() ||
      (r.exitCode !== 0 && !stdout ? `Exited with status ${r.exitCode}.` : "");
    return {
      stdout,
      stderr,
      exitCode: r.exitCode,
      durationMs: Math.round(performance.now() - started),
      timedOut: r.timedOut,
      error: r.timedOut ? "The command hit the time limit." : undefined,
    };
  } finally {
    if (activeRun === handle) activeRun = null;
  }
}

/** Stop the run in progress, if any. */
export async function cancelLocalRun(): Promise<void> {
  if (!activeRun) return;
  activeRun.cancelled = true;
  if (activeRun.requestId) await invoke("project_cancel", { requestId: activeRun.requestId }).catch(() => {});
}

/**
 * Run every step's tests (or the program, before any step exists) locally.
 * Test names carry the step number (TestStageNN) so the project summary can
 * tell the current step from regressions in earlier ones.
 */
export async function runLocalProject(ws: ProjectWorkspace): Promise<ExecutionResult> {
  const started = performance.now();
  const handle = { requestId: null as string | null, cancelled: false };
  activeRun = handle;
  try {
    await syncLocalProject(ws);
    if (handle.cancelled) {
      return { stdout: "", stderr: "Stopped.", exitCode: -1, durationMs: Math.round(performance.now() - started), error: "Stopped." };
    }
    if (!ws.stages.length) {
      const r = await exec(ws, "run", undefined, handle);
      const last = r.steps[r.steps.length - 1];
      return {
        stdout: cleanOutput(r.steps.map((s) => s.stdout).join("")).trim(),
        stderr: cleanOutput(r.steps.map((s) => s.stderr).join("\n")).trim() || (r.exitCode !== 0 && !last?.stdout ? `Exited with status ${r.exitCode}.` : ""),
        exitCode: r.exitCode,
        durationMs: Math.round(performance.now() - started),
        timedOut: r.timedOut,
        error: r.timedOut ? "The program hit the time limit." : undefined,
      };
    }
    const results: TestResult[] = [];
    const logs: string[] = [];
    const stepRuns: StepRun[] = [];
    let suiteTimedOut = false;
    for (const stage of [...ws.stages].sort((a, b) => a.number - b.number)) {
      if (handle.cancelled) break;
      if (performance.now() - started > TOTAL_PROJECT_RUN_MS) {
        suiteTimedOut = true;
        break;
      }
      const nn = String(stage.number).padStart(2, "0");
      const r = await exec(ws, "test", { number: stage.number, testFile: stage.testPath }, handle);
      const output = transcript(r);
      logs.push(`Step ${stage.number} · ${stage.testPath} · ${r.exitCode === 0 ? "passed" : "failed"}\n${output}`);
      stepRuns.push({
        number: stage.number,
        label: stage.testPath,
        passed: r.exitCode === 0,
        timedOut: r.timedOut,
        durationMs: r.durationMs,
        command: r.steps.map((s) => s.command).join(" && "),
        output,
      });
      results.push({
        name: `TestStage${nn} · ${stage.testPath}`,
        passed: r.exitCode === 0,
        ...(r.exitCode === 0 ? {} : { error: output.slice(-4000) || `Exited with status ${r.exitCode}.` }),
      });
      if (handle.cancelled) break;
    }
    const failed = handle.cancelled || suiteTimedOut || results.some((r) => !r.passed);
    return {
      stdout: logs.join("\n\n"),
      stderr: handle.cancelled ? "Stopped." : suiteTimedOut ? "Stopped after 120 s (suite time limit)." : "",
      exitCode: failed ? 1 : 0,
      durationMs: Math.round(performance.now() - started),
      testResults: results,
      stepRuns,
      timedOut: suiteTimedOut || stepRuns.some((s) => s.timedOut),
      ...(handle.cancelled ? { error: "Stopped." } : {}),
    };
  } finally {
    if (activeRun === handle) activeRun = null;
  }
}
