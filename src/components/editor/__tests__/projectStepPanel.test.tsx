import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectStepPanel } from "../ProjectStepPanel";
import type { ProjectWorkspaceController } from "../useProjectWorkspace";

const controller = (overrides: Partial<ProjectWorkspaceController>) =>
  ({
    enabled: true,
    loaded: true,
    project: { title: "Distributed KV store", summary: "Grows chapter by chapter." },
    step: "Ship the log to a follower",
    stage: undefined,
    totalSteps: 9,
    preparation: null,
    lastSummary: null,
    retryPreparation: vi.fn(),
    ...overrides,
  }) as unknown as ProjectWorkspaceController;

const stage = {
  unitId: "u3",
  number: 3,
  task: "Add `Follower.Apply(entry)` and replicate every `Put`.",
  testPath: "stage03_replication_test.go",
  tests: "",
  addedFiles: [],
  startFiles: [],
};

describe("project step panel", () => {
  it("shows the step, its test file, and that earlier steps' tests keep running", () => {
    const html = renderToStaticMarkup(<ProjectStepPanel project={controller({ stage })} />);
    expect(html).toContain("Distributed KV store");
    expect(html).toContain("Step 3 of 9");
    expect(html).toContain("Ship the log to a follower");
    expect(html).toContain("stage03_replication_test.go");
    expect(html).toContain("earlier steps’ tests");
  });

  it("flags regressions in earlier steps", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel
        project={controller({
          stage,
          lastSummary: { total: 4, passed: 2, brokenEarlier: [1, 2], currentPassed: true, allPassed: false },
        })}
      />
    );
    expect(html).toContain("Earlier steps 1, 2 now fail");
  });

  it("offers a retry when preparation fails and says files are unchanged", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel project={controller({ preparation: { unitId: "u3", state: "error", message: "The step had no tests." } })} />
    );
    expect(html).toContain("The step had no tests.");
    expect(html).toContain("Your files are unchanged.");
    expect(html).toContain("Retry");
  });

  it("explains concept-only units", () => {
    const html = renderToStaticMarkup(<ProjectStepPanel project={controller({ step: undefined })} />);
    expect(html).toContain("This unit has no project step");
  });
});
