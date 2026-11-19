import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Circle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { MarkdownView } from "../chat/MarkdownView";
import type { ProjectWorkspaceController } from "./useProjectWorkspace";

type Status = { tone: "neutral" | "running" | "fail" | "pass"; label: string };

/** One-glance state of the active step, from the last run of the whole suite. */
function stepStatus(project: ProjectWorkspaceController, isRunning: boolean): Status | null {
  const { stage, lastHeadline } = project;
  if (!stage) return null;
  if (isRunning) return { tone: "running", label: "Running tests…" };
  if (lastHeadline) return { tone: lastHeadline.tone === "pass" ? "pass" : "fail", label: lastHeadline.chip };
  if (stage.passedAt) return { tone: "pass", label: "All tests pass" };
  return { tone: "neutral", label: "Not run yet" };
}

const STATUS_ICON = {
  neutral: <Circle size={11} aria-hidden="true" />,
  running: <Loader2 size={11} className="animate-spin" aria-hidden="true" />,
  fail: <XCircle size={11} aria-hidden="true" />,
  pass: <CheckCircle2 size={11} aria-hidden="true" />,
};

const taskKey = (trackId: string, unitId: string) => `learnforge:step-task-open:${trackId}:${unitId}`;

/** The active project step: what to build, and whether its tests (and earlier ones) pass. */
export const ProjectStepPanel: React.FC<{ project: ProjectWorkspaceController; isRunning?: boolean }> = ({ project, isRunning = false }) => {
  const { stage, step, preparation, totalSteps } = project;
  const status = stepStatus(project, isRunning);

  // The task starts open for a step that hasn't passed; the choice is remembered per step.
  const [taskOpen, setTaskOpen] = useState(true);
  useEffect(() => {
    if (!stage) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(taskKey(project.trackId, stage.unitId));
    } catch {
      /* Preference only. */
    }
    setTaskOpen(stored === null ? !stage.passedAt : stored === "open");
  }, [stage?.unitId, project.trackId]);
  const toggleTask = (open: boolean) => {
    setTaskOpen(open);
    if (stage)
      try {
        localStorage.setItem(taskKey(project.trackId, stage.unitId), open ? "open" : "closed");
      } catch {
        /* Preference only. */
      }
  };

  let body: React.ReactNode;
  if (!project.loaded) {
    body = <p className="project-step-note">Opening your project…</p>;
  } else if (!step) {
    body = (
      <p className="project-step-note">
        No project step in this unit: it’s about ideas rather than code. Your project is unchanged.
      </p>
    );
  } else if (preparation?.state === "loading") {
    body = (
      <p className="project-step-note" role="status">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        Preparing this step from your current files…
      </p>
    );
  } else if (preparation?.state === "error") {
    body = (
      <div className="project-step-alert" role="alert">
        <AlertCircle size={14} aria-hidden="true" />
        <div>
          <strong>This step couldn’t be prepared.</strong>
          <small>{preparation.message} Your files are unchanged.</small>
        </div>
        <button type="button" className="project-step-retry" onClick={() => void project.retryPreparation()}>
          <RotateCcw size={12} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  } else if (!stage) {
    body = (
      <p className="project-step-note">
        <span className="project-step-step">{step}</span>
        <small>This step is prepared from your files once the lesson is ready.</small>
      </p>
    );
  } else {
    body = (
      <>
        <div className="project-step-row">
          <button
            type="button"
            className="project-step-toggle"
            aria-expanded={taskOpen}
            aria-controls="project-step-task"
            onClick={() => toggleTask(!taskOpen)}
          >
            <span className="project-step-step">{step}</span>
            <ChevronDown size={14} aria-hidden="true" className="project-step-chevron" data-open={taskOpen} />
          </button>
          {status && (
            <span className={`project-step-status is-${status.tone}`} role="status" aria-live="polite">
              {STATUS_ICON[status.tone]}
              {status.label}
            </span>
          )}
        </div>
        {taskOpen && (
          <div className="project-step-task" id="project-step-task">
            <MarkdownView content={stage.task} languageHint={project.language} />
            <small>
              Tests: <code>{stage.testPath}</code> · earlier steps’ tests run too.
            </small>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="project-step-panel" aria-label="Project step">
      <header>
        <strong title={project.project?.summary}>{project.project?.title ?? "Project"}</strong>
        {stage && totalSteps > 0 && (
          <span className="project-step-progress" aria-label={`Step ${stage.number} of ${totalSteps}`}>
            <span className="project-step-segments" aria-hidden="true">
              {Array.from({ length: Math.min(totalSteps, 24) }, (_, i) => (
                <i key={i} data-state={i + 1 < stage.number ? "done" : i + 1 === stage.number ? "current" : "todo"} />
              ))}
            </span>
            Step {stage.number} of {totalSteps}
          </span>
        )}
      </header>
      {body}
    </section>
  );
};
