import React from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { MarkdownView } from "../chat/MarkdownView";
import type { ProjectWorkspaceController } from "./useProjectWorkspace";

/** The active project step: what to build, whether its tests and earlier ones pass. */
export const ProjectStepPanel: React.FC<{ project: ProjectWorkspaceController }> = ({ project }) => {
  const { stage, step, preparation, lastSummary, totalSteps } = project;
  const title = project.project?.title ?? "Project";
  let body: React.ReactNode;
  if (!project.loaded) {
    body = <p className="project-step-note">Opening your project…</p>;
  } else if (!step) {
    body = (
      <p className="project-step-note">
        This unit has no project step. Your project is unchanged; keep working on it or continue with the lesson.
      </p>
    );
  } else if (preparation?.state === "loading") {
    body = (
      <p className="project-step-note" role="status">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Preparing this step from your current files…
      </p>
    );
  } else if (preparation?.state === "error" || !stage) {
    body = (
      <div className="project-step-note is-error" role="alert">
        <AlertCircle size={13} aria-hidden="true" />
        <span>{preparation?.message || "This step isn’t prepared yet."} Your files are unchanged.</span>
        <button type="button" className="check-coach-button" onClick={() => void project.retryPreparation()}>
          <RotateCcw size={12} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  } else {
    const broken = lastSummary?.brokenEarlier ?? [];
    body = (
      <>
        <details className="project-step-task" open={!stage.passedAt}>
          <summary>
            <span>{step}</span>
            <ChevronDown size={14} aria-hidden="true" className="curriculum-disclosure-icon" />
          </summary>
          <MarkdownView content={stage.task} languageHint="go" />
          <small>Tests for this step: {stage.testPath}. Every run also runs the earlier steps’ tests.</small>
        </details>
        {broken.length > 0 && (
          <p className="project-step-note is-error" role="status">
            <AlertCircle size={13} aria-hidden="true" />
            Earlier step{broken.length > 1 ? "s" : ""} {broken.join(", ")} now fail{broken.length > 1 ? "" : "s"}. Fix those before moving on.
          </p>
        )}
        {stage.passedAt && (
          <p className="project-step-note is-passed">
            <CheckCircle2 size={13} aria-hidden="true" /> All tests passed for this step and every earlier one.
          </p>
        )}
      </>
    );
  }
  return (
    <section className="project-step-panel" aria-label="Project step">
      <header>
        <strong>{title}</strong>
        {stage && totalSteps > 0 && (
          <span>
            Step {stage.number} of {totalSteps}
          </span>
        )}
      </header>
      {body}
    </section>
  );
};
