/**
 * Local, sandboxed project runs in the Mac app (src-tauri/src/project.rs).
 * Each step's tests run on their own, so pass/fail per step comes from the
 * exit code in every language.
 */
import type { ExecutionResult, StepRun, TestResult } from "../../types";
import { profileFor } from "../languages";
import { stageOfTest, type ProjectFile, type ProjectStage, type ProjectWorkspace } from "../learning/project";

/** Remove terminal colour codes and carriage-return redraws. */
export const cleanOutput = (text: string) =>
  text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");

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
interface FetchDepsResponse {
  exec: ExecResult;
  updatedFiles: ProjectFile[];
}
export interface ExportProjectResult {
  path: string;
  fileCount: number;
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
  action: "run" | "test" | "test_batch" | "check" | "tool",
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

/** Parse `go test -json -count=1 ./...` output into per-stage StepRun and TestResult buckets. */
export function parseGoTestJson(
  stdout: string,
  stderr: string,
  stages: ProjectStage[],
  exitCode: number,
  timedOut: boolean,
  durationMs: number,
  command = "go test -json -count=1 ./..."
): ExecutionResult {
  const ordered = [...stages].sort((a, b) => a.number - b.number);
  const buckets = new Map<
    number,
    { outputs: string[]; tests: Map<string, "run" | "pass" | "fail" | "skip">; elapsedSec: number }
  >();
  const buildErrors: string[] = [];
  const pkgOutputs: string[] = [];
  const nonJsonLines: string[] = [];
  let buildFailed = false;

  const ensureBucket = (n: number) => {
    let b = buckets.get(n);
    if (!b) {
      b = { outputs: [], tests: new Map(), elapsedSec: 0 };
      buckets.set(n, b);
    }
    return b;
  };

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let ev: { Action?: string; Test?: string; Output?: string; Elapsed?: number } | null = null;
    if (line.startsWith("{")) {
      try {
        ev = JSON.parse(line);
      } catch {
        ev = null;
      }
    }
    if (!ev || typeof ev.Action !== "string") {
      nonJsonLines.push(cleanOutput(rawLine));
      continue;
    }
    if (ev.Action === "build-output" && typeof ev.Output === "string") {
      buildErrors.push(cleanOutput(ev.Output));
      continue;
    }
    if (ev.Action === "build-fail") {
      buildFailed = true;
      continue;
    }
    if (typeof ev.Test === "string" && ev.Test) {
      const topTest = ev.Test.split("/")[0];
      const stageNum = stageOfTest(topTest);
      if (stageNum === null) continue;
      const bucket = ensureBucket(stageNum);
      if (ev.Action === "output" && typeof ev.Output === "string") {
        bucket.outputs.push(cleanOutput(ev.Output));
      } else if (!ev.Test.includes("/")) {
        const cur = bucket.tests.get(topTest);
        if (ev.Action === "run" && !cur) bucket.tests.set(topTest, "run");
        else if (ev.Action === "pass") {
          bucket.tests.set(topTest, "pass");
          if (typeof ev.Elapsed === "number") bucket.elapsedSec += ev.Elapsed;
        } else if (ev.Action === "fail") {
          bucket.tests.set(topTest, "fail");
          if (typeof ev.Elapsed === "number") bucket.elapsedSec += ev.Elapsed;
        } else if (ev.Action === "skip" && cur !== "fail") {
          bucket.tests.set(topTest, "skip");
        }
      }
      continue;
    }
    if (ev.Action === "output" && typeof ev.Output === "string") {
      const cleaned = cleanOutput(ev.Output);
      pkgOutputs.push(cleaned);
      if (/^#\s|\[build failed\]|cannot find package|no Go files/i.test(cleaned)) {
        buildErrors.push(cleaned);
        if (/\[build failed\]/i.test(cleaned)) buildFailed = true;
      }
    }
  }

  const globalError = [cleanOutput(stderr).trim(), buildErrors.join("").trim(), nonJsonLines.join("\n").trim()]
    .filter(Boolean)
    .join("\n")
    .trim();

  const results: TestResult[] = [];
  const logs: string[] = [];
  const stepRuns: StepRun[] = [];

  for (const stage of ordered) {
    const nn = String(stage.number).padStart(2, "0");
    const bucket = buckets.get(stage.number);
    let passed = false;
    let output = "";
    let stepDurationMs = 0;

    if (bucket && bucket.tests.size > 0) {
      const statuses = [...bucket.tests.values()];
      passed =
        !buildFailed &&
        !timedOut &&
        statuses.every((s) => s === "pass" || s === "skip") &&
        statuses.some((s) => s === "pass");
      output =
        bucket.outputs.join("").trim() ||
        (passed ? "ok" : globalError || `Exited with status ${exitCode}.`);
      stepDurationMs = Math.round(bucket.elapsedSec * 1000);
    } else {
      passed = false;
      output =
        globalError ||
        pkgOutputs.join("").trim() ||
        (timedOut
          ? "Stopped after time limit before this step ran."
          : `No TestStage${nn} tests ran (exited with status ${exitCode}).`);
    }

    logs.push(`Step ${stage.number} · ${stage.testPath} · ${passed ? "passed" : "failed"}\n${output}`);
    stepRuns.push({
      number: stage.number,
      label: stage.testPath,
      passed,
      timedOut: timedOut && !passed,
      durationMs: stepDurationMs,
      command,
      output,
    });
    results.push({
      name: `TestStage${nn} · ${stage.testPath}`,
      passed,
      ...(passed ? {} : { error: output.slice(-4000) || `Exited with status ${exitCode}.` }),
    });
  }

  const failed = timedOut || exitCode !== 0 || results.some((r) => !r.passed);
  return {
    stdout: logs.join("\n\n"),
    stderr: failed ? globalError : cleanOutput(stderr).trim(),
    exitCode: failed ? (exitCode || 1) : 0,
    durationMs,
    testResults: results,
    stepRuns,
    timedOut,
  };
}

/**
 * Explicitly fetch declared project dependencies (e.g. `go mod tidy` + `go mod download`)
 * inside the macOS sandbox with outbound network enabled only for this action.
 */
export async function fetchLocalProjectDeps(
  ws: ProjectWorkspace
): Promise<{ result: ExecutionResult; updatedFiles: ProjectFile[] }> {
  const started = performance.now();
  const handle = { requestId: null as string | null, cancelled: false };
  activeRun = handle;
  try {
    await syncLocalProject(ws);
    if (handle.cancelled) {
      return {
        result: {
          stdout: "",
          stderr: "Stopped.",
          exitCode: -1,
          durationMs: Math.round(performance.now() - started),
          error: "Stopped.",
        },
        updatedFiles: [],
      };
    }
    const requestId = `deps-${Date.now().toString(36)}-${++runCounter}`;
    handle.requestId = requestId;
    const response = await invoke<FetchDepsResponse>("project_fetch_deps", {
      trackId: ws.trackId,
      profileId: ws.language,
      requestId,
    });
    const r = response.exec;
    const stdout = cleanOutput(r.steps.map((s) => s.stdout).join("")).trim();
    if (handle.cancelled) {
      return {
        result: {
          stdout,
          stderr: "Stopped.",
          exitCode: -1,
          durationMs: Math.round(performance.now() - started),
          timedOut: r.timedOut,
          error: "Stopped.",
        },
        updatedFiles: [],
      };
    }
    const stderr =
      cleanOutput(r.steps.map((s) => s.stderr).join("\n")).trim() ||
      (r.exitCode !== 0 && !stdout ? `Exited with status ${r.exitCode}.` : "");
    return {
      result: {
        stdout,
        stderr,
        exitCode: r.exitCode,
        durationMs: Math.round(performance.now() - started),
        timedOut: r.timedOut,
        error: r.timedOut ? "Dependency fetch hit the time limit." : undefined,
      },
      updatedFiles: response.updatedFiles ?? [],
    };
  } finally {
    if (activeRun === handle) activeRun = null;
  }
}

/** Export the project workspace as a standalone folder in ~/Downloads (Mac app). */
export async function exportLocalProject(
  ws: ProjectWorkspace,
  exportName: string,
  includeTests = true,
  reveal = true
): Promise<ExportProjectResult> {
  const files = includeTests
    ? [...ws.files, ...ws.stages.map((s) => ({ path: s.testPath, content: s.tests }))]
    : [...ws.files];
  return invoke<ExportProjectResult>("project_export", {
    trackId: ws.trackId,
    profileId: ws.language,
    exportName,
    files,
    reveal,
  });
}

/**
 * Run every step's tests (or the program, before any step exists) locally.
 * For Go, runs all steps in a single `go test -json ./...` invocation; other
 * languages run each step's test file in sequence.
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
    const profile = profileFor(ws.language);
    if (ws.language === "go" && profile?.testBatch?.length) {
      const r = await exec(ws, "test_batch", undefined, handle);
      if (handle.cancelled) {
        return {
          stdout: "",
          stderr: "Stopped.",
          exitCode: -1,
          durationMs: Math.round(performance.now() - started),
          timedOut: r.timedOut,
          error: "Stopped.",
        };
      }
      const stdout = r.steps.map((s) => s.stdout).join("\n");
      const stderr = r.steps.map((s) => s.stderr).join("\n");
      const command = r.steps.map((s) => s.command).join(" && ") || "go test -json -count=1 ./...";
      return parseGoTestJson(
        stdout,
        stderr,
        ws.stages,
        r.exitCode,
        r.timedOut,
        Math.round(performance.now() - started),
        command
      );
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
