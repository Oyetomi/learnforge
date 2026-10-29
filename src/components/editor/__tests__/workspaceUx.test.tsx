import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestResultsPanel } from "../TestResultsPanel";
import { OutputConsole } from "../OutputConsole";
import { editorShortcutApplies } from "../keyboard";

describe("code workspace feedback", () => {
  it("does not advertise learner readiness when implementation tests pass", () => {
    const html = renderToStaticMarkup(
      <TestResultsPanel
        testResults={[{ name: "Example test", passed: true }]}
        hasRun
      />
    );
    expect(html).toContain("All supplied tests passed.");
    expect(html).toContain("tutor’s understanding check");
    expect(html).not.toContain("Ready for next challenge");
    expect(html).not.toContain("Continue to next lesson");
  });
  it("offers advancement only when the parent explicitly makes it available", () => {
    const html = renderToStaticMarkup(
      <TestResultsPanel
        testResults={[{ name: "Example", passed: true }]}
        onNextMilestone={vi.fn()}
      />
    );
    expect(html).toContain("Continue to next lesson");
  });
  it("shows empty-string assertion values rather than hiding the failed comparison", () => {
    const html = renderToStaticMarkup(
      <TestResultsPanel
        testResults={[
          {
            name: "Empty output",
            passed: false,
            expected: "",
            actual: "unexpected",
          },
        ]}
      />
    );
    expect(html).toContain("Expected");
    expect(html).toContain("(empty string)");
    expect(html).toContain("Actual");
    expect(html).toContain("unexpected");
  });
  it("does not show previous passing results while a new run is pending", () => {
    const html = renderToStaticMarkup(
      <TestResultsPanel
        isRunning
        testResults={[{ name: "Old result", passed: true }]}
      />
    );
    expect(html).toContain("Running tests");
    expect(html).not.toContain("1 of 1 passed");
    expect(html).not.toContain("All supplied tests passed");
  });
  it("keeps compiler diagnostics distinct from a failed execution", () => {
    const html = renderToStaticMarkup(
      <OutputConsole
        stdout="ok"
        stderr="A warning"
        exitCode={0}
        onClear={vi.fn()}
      />
    );
    expect(html).toContain("Execution complete");
    expect(html).toContain("console-diagnostic");
    expect(html).not.toContain("Execution failed");
  });
});
describe("editor shortcut ownership", () => {
  const command = {
    key: "Enter",
    metaKey: true,
    ctrlKey: false,
    defaultPrevented: false,
  };
  it("runs in the code workspace, while leaving the coach composer alone", () => {
    expect(editorShortcutApplies(command, true, false)).toBe(true);
    expect(editorShortcutApplies(command, false, false)).toBe(false);
  });
  it("honors an open dialog and an already handled Monaco command", () => {
    expect(editorShortcutApplies(command, true, true)).toBe(false);
    expect(
      editorShortcutApplies({ ...command, defaultPrevented: true }, true, false)
    ).toBe(false);
  });
});
