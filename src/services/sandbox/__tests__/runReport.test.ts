import { describe, expect, it } from "vitest";
import { runHeadline } from "../runReport";
import type { ExecutionResult, StepRun } from "../../../types";

const step = (number: number, passed: boolean, output = "", timedOut = false): StepRun => ({ number, label: `s${number}`, passed, timedOut, durationMs: 1, command: "x", output });
const result = (stepRuns: StepRun[], extra: Partial<ExecutionResult> = {}): ExecutionResult => ({ stdout: "", stderr: "", exitCode: stepRuns.every((s) => s.passed) ? 0 : 1, durationMs: 5, stepRuns, ...extra });

describe("run headline", () => {
  it("names a regression before the current step's own failure", () => {
    expect(runHeadline(result([step(1, false, "want 2"), step(2, false)]), 2)).toMatchObject({ tone: "fail", title: "Step 1 broke", chip: "Step 1 broke" });
  });
  it("says when the current step isn't passing yet", () => {
    expect(runHeadline(result([step(1, true), step(2, false, "want 2")]), 2)).toMatchObject({ title: "Step 2 isn’t passing yet", chip: "1 of 2 passing" });
  });
  it("calls compile errors a build problem, not a test failure", () => {
    const out = "# learnforge\n./log.go:5:9: undefined: s.entries\nFAIL\tlearnforge [build failed]";
    expect(runHeadline(result([step(1, false, out), step(2, false, out)]), 2)).toMatchObject({ title: "Doesn’t build yet", chip: "Doesn’t build" });
  });
  it("reports time limits, passes and plain program runs", () => {
    expect(runHeadline(result([step(1, false, "", true)], { timedOut: true }), 1).chip).toBe("Timed out");
    expect(runHeadline(result([step(1, true), step(2, true)]), 2)).toMatchObject({ tone: "pass", title: "All 2 steps pass" });
    expect(runHeadline({ stdout: "3\n", stderr: "", exitCode: 0, durationMs: 1 })).toMatchObject({ tone: "pass", title: "Program finished" });
    expect(runHeadline({ stdout: "", stderr: "store.c:3:5: error: expected ';'", exitCode: 1, durationMs: 1 }).title).toBe("Doesn’t build yet");
  });
});

import { runOutcome } from "../runReport";
describe("run outcome (what a prediction is compared with)", () => {
  it("distinguishes passing, failing and not building", () => {
    expect(runOutcome(result([step(1, true), step(2, true)]))).toBe("pass");
    expect(runOutcome(result([step(1, true), step(2, false, "want 2")]))).toBe("fail");
    expect(runOutcome(result([step(1, false, "# learnforge\n./x.go:3: undefined: y\nFAIL [build failed]")]))).toBe("build");
    expect(runOutcome({ stdout: "3", stderr: "", exitCode: 0, durationMs: 1 })).toBe("pass");
  });
});
