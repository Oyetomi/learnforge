import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { CourseTrack } from "../../services/ai/types";
import type { PlacementAttempt } from "../../types";
import {
  approveLearningPlan,
  recordPlacementAttempt,
  replacePlacementAttempt,
} from "../../services/learning/placement";
import { MarkdownView } from "../chat/MarkdownView";

interface Props {
  track: CourseTrack;
  onApprove: (track: CourseTrack) => void;
  onRevise: () => void;
}

export const PlanApproval: React.FC<Props> = ({
  track,
  onApprove,
  onRevise,
}) => {
  // Draft planning decisions live only here until the learner approves the plan.
  const [saveError, setSaveError] = useState("");
  const [attempts, setAttempts] = useState<PlacementAttempt[]>([]);
  const [deferred, setDeferred] = useState(new Set<string>());
  const [probeIndex, setProbeIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confidence, setConfidence] =
    useState<PlacementAttempt["confidence"]>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  const probes = track.milestones.filter(
    (m) => m.check && m.check.options.length >= 2
  );
  const area = probeIndex === null ? undefined : probes[probeIndex];
  const check = area?.check;
  const proposed = approveLearningPlan(track, attempts, deferred);
  const visit = (index: number | null, currentAttempts = attempts) => {
    if (index !== null && !probes[index]) return;
    const saved =
      index === null
        ? undefined
        : currentAttempts.find((a) => a.milestoneId === probes[index].id);
    setSelected(saved?.selectedIds || []);
    setConfidence(saved?.confidence || null);
    setProbeIndex(index);
  };
  useEffect(() => {
    surfaceRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
    submitting.current = false;
  }, [probeIndex]);
  useEffect(() => {
    if (!saveError) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [saveError]);
  const answer = (dontKnow: boolean) => {
    if (
      !area ||
      !check ||
      submitting.current ||
      (!dontKnow && !selected.length)
    )
      return;
    submitting.current = true;
    const next = replacePlacementAttempt(
      attempts,
      recordPlacementAttempt(area.id, check, selected, confidence, dontKnow)
    );
    setAttempts(next);
    visit(probeIndex! + 1 < probes.length ? probeIndex! + 1 : null, next);
  };
  return (
    <div ref={surfaceRef} className="new-topic-form plan-approval-stage">
      <div className="new-topic-intro">
        <h3>{track.title}</h3>
        <p>{track.description || track.tagline}</p>
      </div>
      {area && check ? (
        <section
          className="placement-probe-card"
          aria-labelledby="placement-area-title"
        >
          <div className="placement-probe-header">
            <span role="status">
              Starting point · Area {probeIndex! + 1} of {probes.length}
            </span>
            <button
              type="button"
              className="check-coach-button"
              onClick={() => visit(null)}
            >
              Back to plan
            </button>
          </div>
          <h4 id="placement-area-title" tabIndex={-1} ref={headingRef}>
            {area.title}
          </h4>
          <p className="placement-explainer">
            This helps choose a starting point. Readiness is checked later
            through fresh practice.
          </p>
          {check.context && (
            <MarkdownView
              content={check.context}
              languageHint={track.language || undefined}
            />
          )}
          <div id="placement-question" className="placement-probe-question">
            <MarkdownView
              content={check.question}
              languageHint={track.language || undefined}
            />
          </div>
          <fieldset
            className="placement-probe-options"
            aria-labelledby="placement-question"
          >
            <legend>
              {check.multiple ? "Select all that apply" : "Choose one answer"}
            </legend>
            {check.options.map((option) => (
              <label
                key={option.id}
                className={`check-option ${
                  selected.includes(option.id) ? "is-selected" : ""
                }`}
              >
                <input
                  type={check.multiple ? "checkbox" : "radio"}
                  name="placement-answer"
                  checked={selected.includes(option.id)}
                  onChange={() =>
                    setSelected((previous) =>
                      check.multiple
                        ? previous.includes(option.id)
                          ? previous.filter((id) => id !== option.id)
                          : [...previous, option.id]
                        : [option.id]
                    )
                  }
                />
                <span
                  className="placement-choice-indicator"
                  data-multiple={check.multiple}
                  aria-hidden="true"
                >
                  {selected.includes(option.id) ? "✓" : ""}
                </span>
                <span className="check-option-label">
                  <MarkdownView
                    content={option.label}
                    languageHint={track.language || undefined}
                  />
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="placement-confidence">
            <legend>
              How sure are you? <span>(optional)</span>
            </legend>
            {(
              [
                ["unsure", "Not sure"],
                ["somewhat", "Somewhat sure"],
                ["confident", "Confident"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="placement-confidence"
                  checked={confidence === value}
                  onChange={() => setConfidence(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="placement-probe-actions">
            <button
              type="button"
              className="check-coach-button"
              onClick={() => answer(true)}
            >
              I don’t know yet
            </button>
            <button
              type="button"
              className="dialog-primary-button"
              disabled={!selected.length}
              onClick={() => answer(false)}
            >
              {probeIndex! + 1 < probes.length
                ? "Next area"
                : "See recommendation"}
              <ArrowRight size={14} />
            </button>
          </div>
          {probeIndex! > 0 && (
            <button
              type="button"
              className="check-coach-button placement-back"
              onClick={() => visit(probeIndex! - 1)}
            >
              <ArrowLeft size={12} /> Previous area
            </button>
          )}
        </section>
      ) : (
        <>
          <section
            className="placement-recommendation"
            aria-label="Suggested starting point"
          >
            <h4 tabIndex={-1} ref={headingRef}>
              Suggested starting point
            </h4>
            <p>{proposed.placement!.reason}</p>
            <small>
              {track.milestones.length === 1
                ? "One focused lesson, followed by fresh practice and feedback."
                : `All ${track.milestones.length} concepts stay on your roadmap. “Keep for later” changes your focus, not your readiness; a prerequisite may still need to come first.`}
            </small>
          </section>
          <div className="plan-approval-toolbar">
            <span>
              {attempts.length
                ? `${attempts.length} of ${probes.length} areas checked`
                : probes.length
                ? "Optional starting-point check"
                : "Start with an accessible explanation and fresh practice"}
            </span>
            {probes.length > 0 && (
              <button
                type="button"
                className="check-coach-button"
                onClick={() => visit(0)}
              >
                {attempts.length
                  ? "Revisit starting-point check"
                  : "Find my starting point"}
              </button>
            )}
          </div>
          <ul className="plan-approval-list" aria-label="Proposed concepts">
            {track.milestones.map((milestone, index) => {
              const saved = attempts.find(
                (a) => a.milestoneId === milestone.id
              );
              const later = deferred.has(milestone.id);
              return (
                <li
                  key={milestone.id}
                  className={`plan-approval-item ${later ? "is-deferred" : ""}`}
                >
                  <div>
                    <strong>
                      {index + 1}. {milestone.title}
                    </strong>
                    <small>{milestone.prompt}</small>
                    <span className="plan-concept-note">
                      {proposed.placement!.startMilestoneId === milestone.id
                        ? "Start here · "
                        : ""}
                      {saved
                        ? saved.correct && saved.confidence !== "unsure"
                          ? "Familiar so far · fresh practice next"
                          : "Build up in small steps"
                        : "Not checked yet"}
                    </span>
                    {saved && (
                      <button
                        type="button"
                        className="check-coach-button"
                        onClick={() =>
                          visit(probes.findIndex((m) => m.id === milestone.id))
                        }
                      >
                        Revisit answer
                      </button>
                    )}
                  </div>
                  {track.milestones.length > 1 && (
                    <button
                      type="button"
                      className="check-coach-button"
                      aria-pressed={later}
                      aria-label={`${
                        later ? "Focus now on" : "Keep for later:"
                      } ${milestone.title}`}
                      onClick={() =>
                        setDeferred((previous) => {
                          const next = new Set(previous);
                          if (next.has(milestone.id)) next.delete(milestone.id);
                          else next.add(milestone.id);
                          return next;
                        })
                      }
                    >
                      {later ? "Focus now" : "Keep for later"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {saveError && (
            <p
              ref={errorRef}
              tabIndex={-1}
              className="topic-error"
              role="alert"
            >
              {saveError}
            </p>
          )}
          <footer className="new-topic-footer">
            <button
              className="dialog-secondary-button"
              type="button"
              onClick={onRevise}
            >
              Revise goal
            </button>
            <button
              className="dialog-primary-button"
              type="button"
              onClick={() => {
                if (submitting.current) return;
                submitting.current = true;
                try {
                  onApprove(proposed);
                } catch (error) {
                  submitting.current = false;
                  setSaveError(
                    error instanceof Error
                      ? error.message
                      : "The plan could not be saved. Try again."
                  );
                }
              }}
            >
              Approve plan & start
              <ArrowRight size={14} />
            </button>
          </footer>
        </>
      )}
    </div>
  );
};
