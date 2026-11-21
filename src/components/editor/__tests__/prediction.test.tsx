import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PredictionPrompt, ProjectRunReport } from "../ProjectRunReport";

const base = { stdout: "", stderr: "", exitCode: 1, durationMs: 10, stepRuns: [{ number: 1, label: "Store", passed: false, timedOut: false, durationMs: 5, command: "go test", output: "want 2" }] };
const props = { isRunning: false, canRun: true, currentStep: 1, known: [], runLabel: "Run tests", onOpen: vi.fn(), onClear: vi.fn() };

describe("predict before you run", () => {
  it("offers three one-click predictions, a reason, and ways to skip", () => {
    const html = renderToStaticMarkup(<PredictionPrompt onPredict={vi.fn()} onSkip={vi.fn()} onTurnOff={vi.fn()} />);
    for (const t of ["Before you run: what do you expect?", "All tests pass", "Some tests fail", "It won’t build", "Why? (optional)", "Run without predicting", "Don’t ask in this topic"])
      expect(html).toContain(t);
  });
  it("says whether the prediction matched, with the learner's reason", () => {
    const hit = renderToStaticMarkup(<ProjectRunReport {...props} result={base} prediction={{ expected: "fail", why: "Get is a stub", actual: "fail" }} />);
    expect(hit).toContain("You predicted some tests to fail, and you were right.");
    expect(hit).toContain("Get is a stub");
    const miss = renderToStaticMarkup(<ProjectRunReport {...props} result={base} prediction={{ expected: "pass", why: "", actual: "fail" }} />);
    expect(miss).toContain("You expected all tests to pass; the result was some tests to fail.");
  });
  it("offers to ask the tutor when something fails, not when it passes", () => {
    expect(renderToStaticMarkup(<ProjectRunReport {...props} result={base} onAskTutor={vi.fn()} />)).toContain("Ask the tutor why");
    const pass = { ...base, exitCode: 0, stepRuns: [{ ...base.stepRuns[0], passed: true }] };
    expect(renderToStaticMarkup(<ProjectRunReport {...props} result={pass} onAskTutor={vi.fn()} />)).not.toContain("Ask the tutor why");
  });
});
