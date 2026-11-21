import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectStepPanel } from "../ProjectStepPanel";
import type { ProjectWorkspaceController } from "../useProjectWorkspace";

const controller = (overrides: Partial<ProjectWorkspaceController>) =>
  ({
    enabled: true,
    loaded: true,
    trackId: "t",
    language: "go",
    project: { title: "Distributed KV store", summary: "Grows chapter by chapter." },
    step: "Ship the log to a follower",
    stage: undefined,
    totalSteps: 9,
    stepNumber: 3,
    preparation: null,
    lastSummary: null,
    lastHeadline: null,
    principles: [],
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
  it("shows the step, progress, its test file and that it hasn't run yet", () => {
    const html = renderToStaticMarkup(<ProjectStepPanel project={controller({ stage })} />);
    expect(html).toContain("Distributed KV store");
    expect(html).toContain('aria-label="Step 3 of 9"');
    expect(html).toContain("Ship the log to a follower");
    expect(html).toContain("stage03_replication_test.go");
    expect(html).toContain("Not run yet");
    expect(html.match(/data-state="done"/g)).toHaveLength(2);
  });

  it("shows the last run's outcome in the status chip", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel project={controller({ stage, lastHeadline: { tone: "fail", title: "Doesn’t build yet", chip: "Doesn’t build" } })} />
    );
    expect(html).toContain("Doesn’t build");
    expect(renderToStaticMarkup(<ProjectStepPanel project={controller({ stage })} isRunning />)).toContain("Running tests…");
  });

  it("explains a failed preparation, keeps files, and offers to try again", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel project={controller({ preparation: { unitId: "u3", state: "error", message: "The step had no tests." } })} />
    );
    expect(html).toContain("This step couldn’t be prepared.");
    expect(html).toContain("Your files are unchanged.");
    expect(html).toContain("Try again");
  });

  it("is calm, not an error, while the lesson is still being prepared", () => {
    const html = renderToStaticMarkup(<ProjectStepPanel project={controller({})} />);
    expect(html).toContain("once the lesson is ready");
    expect(html).not.toContain('role="alert"');
  });

  it("shows the step's principle and the principles built so far", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel
        project={controller({
          stage: { ...stage, passedAt: 1, principle: "Append-only writes make crash recovery simple." },
          principles: [
            { number: 2, principle: "An index trades write cost for fast reads." },
            { number: 3, principle: "Append-only writes make crash recovery simple." },
          ],
        })}
      />
    );
    expect(html).toContain("Append-only writes make crash recovery simple.");
    expect(html).toContain("Principles so far (2)");
  });

  it("shows a chapter's build as parts, like a book's sections", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel
        project={controller({
          stage: { ...stage, section: 2, title: "Write every Put to a log file", outline: ["In-memory map", "Write every Put to a log file", "Rebuild the map on start"] },
          part: { n: 2, total: 3, title: "Write every Put to a log file", outline: ["In-memory map", "Write every Put to a log file", "Rebuild the map on start"] },
        })}
      />
    );
    expect(html).toContain("Part 2 of 3");
    expect(html).toContain("Write every Put to a log file");
    expect(html).toContain('data-state="done"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Rebuild the map on start");
  });

  it("explains concept-only units", () => {
    expect(renderToStaticMarkup(<ProjectStepPanel project={controller({ step: undefined })} />)).toContain("No project step in this unit");
  });

  it("shows multi-project header context when a course has multiple projects", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel
        project={controller({
          project: {
            id: "word-count",
            title: "Word Count CLI",
            summary: "Counts words, lines, and bytes.",
            source: "book",
          },
          projectIndex: 2,
          totalProjects: 4,
          totalSteps: 4,
          stepNumber: 2,
          stage,
        })}
      />
    );
    expect(html).toContain("Word Count CLI");
    expect(html).toContain("Project 2 of 4");
    expect(html).toContain("From book");
    expect(html).toContain('aria-label="Step 2 of 4"');
  });

  it("keeps single-project header uncluttered without a project count pill", () => {
    const html = renderToStaticMarkup(
      <ProjectStepPanel
        project={controller({
          projectIndex: 1,
          totalProjects: 1,
          stage,
        })}
      />
    );
    expect(html).toContain("Distributed KV store");
    expect(html).not.toContain("Project 1 of 1");
  });
});
