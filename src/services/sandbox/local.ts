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

const invoke = async <T>(cmd: string, args: Record<string, unknown>) =>
  (await import("@tauri-apps/api/core")).invoke<T>(cmd, args);

let runCounter = 0;
let activeRun: string | null = null;

/** Write the workspace (sources and every step's tests) to its project folder. */
export async function syncLocalProject(ws: ProjectWorkspace): Promise<string> {
  const files = [
    ...ws.files,
    ...ws.stages.map((s) => ({ path: s.testPath, content: s.tests })),
  ];
  return invoke<string>("project_sync", { trackId: ws.trackId, profileId: ws.language, files });
}

const transcript = (r: ExecResult) =>
  r.steps.map((s) => [cleanOutput(s.stdout).trim(), cleanOutput(s.stderr).trim()].filter(Boolean).join("\n")).join("\n\n");

async function exec(ws: ProjectWorkspace, action: "run" | "test", stage?: { number: number; testFile: string }) {
  const requestId = `run-${Date.now().toString(36)}-${++runCounter}`;
  activeRun = requestId;
  try {
    return await invoke<ExecResult>("project_exec", {
      trackId: ws.trackId,
      profileId: ws.language,
      action,
      stage: stage ?? null,
      requestId,
    });
  } finally {
    if (activeRun === requestId) activeRun = null;
  }
}

/** Stop the run in progress, if any. */
export async function cancelLocalRun(): Promise<void> {
  if (activeRun) await invoke("project_cancel", { requestId: activeRun }).catch(() => {});
}

/**
 * Run every step's tests (or the program, before any step exists) locally.
 * Test names carry the step number (TestStageNN) so the project summary can
 * tell the current step from regressions in earlier ones.
 */
export async function runLocalProject(ws: ProjectWorkspace): Promise<ExecutionResult> {
  const started = performance.now();
  await syncLocalProject(ws);
  if (!ws.stages.length) {
    const r = await exec(ws, "run");
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
  for (const stage of [...ws.stages].sort((a, b) => a.number - b.number)) {
    const nn = String(stage.number).padStart(2, "0");
    const r = await exec(ws, "test", { number: stage.number, testFile: stage.testPath });
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
  }
  const failed = results.some((r) => !r.passed);
  return {
    stdout: logs.join("\n\n"),
    stderr: "",
    exitCode: failed ? 1 : 0,
    durationMs: Math.round(performance.now() - started),
    testResults: results,
    stepRuns,
    timedOut: stepRuns.some((s) => s.timedOut),
  };
}
