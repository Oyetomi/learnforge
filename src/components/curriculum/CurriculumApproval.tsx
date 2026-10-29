import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import type { CourseTrack } from "../../services/ai/types";
import type { CurriculumPlan } from "../../services/learning/curriculumPlan";
import {
  curriculumUnits,
  validCurriculumPlan,
} from "../../services/learning/curriculumPlan";
import {
  approveLearningPlan,
  recordPlacementAttempt,
} from "../../services/learning/placement";
import { prepareCurriculumUnit } from "../../services/ai/curriculumOutline";
import type { PlacementAttempt } from "../../types";
import { MarkdownView } from "../chat/MarkdownView";
import "./curriculum.css";

export function CurriculumApproval({
  track,
  onApprove,
  onRevise,
}: {
  track: CourseTrack;
  onApprove: (track: CourseTrack) => void;
  onRevise: () => void;
}) {
  const [draft, setDraft] = useState(track);
  const [editing, setEditing] = useState(false);
  const [attempts, setAttempts] = useState<PlacementAttempt[]>([]);
  const [probe, setProbe] = useState<number | null>(null);
  const [probeIds, setProbeIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    surface = useRef<HTMLDivElement>(null),
    errorRef = useRef<HTMLParagraphElement>(null),
    mounted = useRef(false),
    submitting = useRef(false),
    answering = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    answering.current = false;
    surface.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [probe]);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  const plan = draft.curriculum!;
  const proposed = approveLearningPlan(draft, attempts, new Set());
  const area =
    probe === null
      ? undefined
      : draft.milestones.find((m) => m.id === probeIds[probe]);
  const visit = (
    index: number | null,
    ids = probeIds,
    savedAttempts = attempts
  ) => {
    const saved =
      index === null
        ? undefined
        : savedAttempts.find((a) => a.milestoneId === ids[index]);
    setSelected(saved?.selectedIds || []);
    setProbe(index);
  };
  const changePlan = (next: CurriculumPlan) => {
    setAttempts([]);
    setProbeIds([]);
    setError("");
    if (attempts.length)
      setNotice(
        "Starting-point answers were cleared because the outcomes changed. You can check the revised plan again."
      );
    setDraft({
      ...draft,
      curriculum: next,
      tagline: next.destination,
      milestones: curriculumUnits(next).map((u) => ({
        id: u.id,
        title: u.title,
        concept: u.outcome,
        prompt: u.outcome,
        starter_code: "",
        test_code: "",
        prerequisite_ids: u.prerequisiteIds,
        contentStatus: "outline",
      })),
    });
  };
  const startPlacement = async () => {
    if (controller.current) return;
    if (
      probeIds.length &&
      probeIds.every((id) =>
        draft.milestones.some((m) => m.id === id && m.check)
      )
    ) {
      visit(0);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setPreparing(true);
    setEditing(false);
    setError("");
    setNotice("");
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 180_000);
    // Sample capability groups once. Revisited answers retain their committed question.
    const ids = plan.modules.slice(0, 3).map((m) => m.units[0].id);
    try {
      const prepared = await Promise.all(
        ids.map((id) =>
          prepareCurriculumUnit(draft, id, request.signal, "placement")
        )
      );
      if (!mounted.current || request.signal.aborted) return;
      const eligible = prepared.filter(
        (m) => m.check && m.check.options.length >= 2
      );
      if (!eligible.length)
        throw new Error(
          "No suitable starting-point choices were prepared. You can approve the outline and begin gently."
        );
      setDraft((prev) => ({
        ...prev,
        milestones: prev.milestones.map(
          (m) => prepared.find((p) => p.id === m.id) || m
        ),
      }));
      const nextIds = eligible.map((m) => m.id);
      setProbeIds(nextIds);
      visit(0, nextIds);
    } catch (e) {
      if (!mounted.current) return;
      if (timedOut)
        setError(
          "The optional check took longer than expected. Your outline is still here; try again or approve it without placement."
        );
      else if (!request.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not prepare the optional check."
        );
      // A failed group must not leave its siblings generating in the background.
      request.abort();
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) {
        if (mounted.current) setPreparing(false);
        controller.current = null;
      }
    }
  };
  const approve = () => {
    if (submitting.current) return;
    if (!validCurriculumPlan(plan)) {
      setError(
        "Every unit needs a distinct outcome, an assessment and valid prerequisites. Check your edits."
      );
      return;
    }
    submitting.current = true;
    try {
      onApprove({
        ...proposed,
        curriculum: { ...plan, approvedAt: Date.now() },
      });
    } catch (e) {
      submitting.current = false;
      setError(
        e instanceof Error
          ? e.message
          : "The plan could not be saved. Try again."
      );
    }
  };
  return (
    <div ref={surface} className="new-topic-form curriculum-approval">
      <div className="new-topic-intro">
        <span className="curriculum-eyebrow">
          {probe === null
            ? "Review the scope"
            : "Optional starting-point check"}
        </span>
        <h3 ref={heading} tabIndex={-1}>
          {probe === null ? draft.title : area?.title}
        </h3>
        <p>{plan.originalGoal}</p>
      </div>
      {probe !== null && area?.check ? (
        <section className="placement-probe-card">
          <div className="placement-probe-header">
            <span>
              Area {probe + 1} of {probeIds.length}
            </span>
            <button className="check-coach-button" onClick={() => visit(null)}>
              Back to outline
            </button>
          </div>
          <p className="placement-explainer">
            This suggests a starting point. Fresh independent practice
            establishes readiness later.
          </p>
          {area.check.context && (
            <MarkdownView
              content={area.check.context}
              languageHint={draft.language || undefined}
            />
          )}
          <div id="curriculum-placement-question">
            <MarkdownView
              content={area.check.question}
              languageHint={draft.language || undefined}
            />
          </div>
          <fieldset
            className="placement-probe-options"
            aria-labelledby="curriculum-placement-question"
          >
            <legend>
              {area.check.multiple
                ? "Select all that apply"
                : "Choose one answer"}
            </legend>
            {area.check.options.map((o) => (
              <label
                className={`check-option ${
                  selected.includes(o.id) ? "is-selected" : ""
                }`}
                key={o.id}
              >
                <input
                  type={area.check!.multiple ? "checkbox" : "radio"}
                  name="curriculum-placement"
                  checked={selected.includes(o.id)}
                  onChange={() =>
                    setSelected((prev) =>
                      area.check!.multiple
                        ? prev.includes(o.id)
                          ? prev.filter((id) => id !== o.id)
                          : [...prev, o.id]
                        : [o.id]
                    )
                  }
                />
                <span
                  className="placement-choice-indicator"
                  data-multiple={area.check!.multiple}
                  aria-hidden="true"
                >
                  {selected.includes(o.id) ? "✓" : ""}
                </span>
                <MarkdownView
                  content={o.label}
                  languageHint={draft.language || undefined}
                />
              </label>
            ))}
          </fieldset>
          <div className="placement-probe-actions">
            {[true, false].map((dontKnow) => (
              <button
                key={String(dontKnow)}
                className={
                  dontKnow ? "check-coach-button" : "dialog-primary-button"
                }
                disabled={!dontKnow && !selected.length}
                onClick={() => {
                  if (answering.current) return;
                  answering.current = true;
                  const attempt = recordPlacementAttempt(
                    area.id,
                    area.check!,
                    selected,
                    null,
                    dontKnow
                  );
                  const next = [
                    ...attempts.filter((a) => a.milestoneId !== area.id),
                    attempt,
                  ];
                  setAttempts(next);
                  visit(
                    probe + 1 < probeIds.length ? probe + 1 : null,
                    probeIds,
                    next
                  );
                }}
              >
                {dontKnow
                  ? "I don’t know yet"
                  : probe + 1 < probeIds.length
                  ? "Next area"
                  : "Review recommendation"}
              </button>
            ))}
          </div>
          {probe > 0 && (
            <button
              className="check-coach-button placement-back"
              onClick={() => visit(probe - 1)}
            >
              <ArrowLeft size={13} /> Previous area
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="curriculum-review-grid">
            <section aria-label="Curriculum outline">
              <div className="curriculum-review-toolbar">
                <span>
                  {plan.modules.length} modules · {curriculumUnits(plan).length}{" "}
                  outcomes
                </span>
                <button
                  className="check-coach-button"
                  onClick={() => setEditing((v) => !v)}
                  disabled={preparing}
                  aria-pressed={editing}
                >
                  {editing ? "Finish editing" : "Edit curriculum"}
                </button>
              </div>
              {plan.modules.map((module, index) => (
                <details
                  className="curriculum-module-review"
                  key={module.id}
                  open={editing || undefined}
                >
                  <summary>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{module.title}</strong>
                      <small>{module.outcome}</small>
                    </div>
                    <em>{module.units.length} outcomes</em>
                    <ChevronDown
                      className="curriculum-disclosure-icon"
                      size={15}
                      aria-hidden="true"
                    />
                  </summary>
                  {editing && (
                    <label>
                      Module outcome
                      <textarea
                        value={module.outcome}
                        aria-label={`Outcome for ${module.title}`}
                        maxLength={1200}
                        onChange={(e) =>
                          changePlan({
                            ...plan,
                            modules: plan.modules.map((m) =>
                              m.id === module.id
                                ? { ...m, outcome: e.target.value }
                                : m
                            ),
                          })
                        }
                      />
                    </label>
                  )}
                  <ol>
                    {module.units.map((unit) => (
                      <li key={unit.id}>
                        <strong>{unit.title}</strong>
                        {editing ? (
                          <>
                            <label>
                              Learning outcome
                              <textarea
                                value={unit.outcome}
                                aria-label={`Learning outcome for ${unit.title}`}
                                maxLength={1200}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    modules: plan.modules.map((m) => ({
                                      ...m,
                                      units: m.units.map((u) =>
                                        u.id === unit.id
                                          ? { ...u, outcome: e.target.value }
                                          : u
                                      ),
                                    })),
                                  })
                                }
                              />
                            </label>
                            <label>
                              How understanding is checked
                              <textarea
                                value={unit.assessment}
                                aria-label={`Assessment for ${unit.title}`}
                                maxLength={1200}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    modules: plan.modules.map((m) => ({
                                      ...m,
                                      units: m.units.map((u) =>
                                        u.id === unit.id
                                          ? { ...u, assessment: e.target.value }
                                          : u
                                      ),
                                    })),
                                  })
                                }
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <p>{unit.outcome}</p>
                            <small>Evidence: {unit.assessment}</small>
                          </>
                        )}
                        <small>
                          Prerequisites:{" "}
                          {unit.prerequisiteIds.length
                            ? unit.prerequisiteIds
                                .map(
                                  (id) =>
                                    curriculumUnits(plan).find(
                                      (u) => u.id === id
                                    )?.title
                                )
                                .join(" · ")
                            : "No prior curriculum units"}
                        </small>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </section>
            <aside className="curriculum-scope-card">
              <h4>The destination</h4>
              {editing ? (
                <label>
                  Desired ability
                  <textarea
                    value={plan.destination}
                    maxLength={1200}
                    onChange={(e) =>
                      changePlan({ ...plan, destination: e.target.value })
                    }
                  />
                </label>
              ) : (
                <p>{plan.destination}</p>
              )}
              <h4>Starting point</h4>
              <p>{plan.startingPoint}</p>
              <h4>Outside this scope</h4>
              {editing ? (
                <label>
                  One exclusion per line
                  <textarea
                    value={plan.exclusions.join("\n")}
                    onChange={(e) =>
                      changePlan({
                        ...plan,
                        exclusions: e.target.value.split("\n").filter(Boolean),
                      })
                    }
                  />
                </label>
              ) : (
                <ul>
                  {plan.exclusions.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
              <h4>Prepared as you go</h4>
              <p>
                Approve the outline now; lessons are prepared one unit at a
                time. Text checks show understanding. Practical skills may need
                evidence outside the app.
              </p>
            </aside>
          </div>
          <section className="curriculum-placement" aria-busy={preparing}>
            <div>
              <strong>
                {attempts.length
                  ? "Suggested starting point"
                  : "Optional placement"}
              </strong>
              <p id="curriculum-placement-description">
                {attempts.length
                  ? proposed.placement!.reason
                  : "Check up to three areas, or start with a small first step. Placement does not award credit."}
              </p>
            </div>
            <button
              className="check-coach-button"
              disabled={preparing || !validCurriculumPlan(plan)}
              onClick={() => void startPlacement()}
              aria-describedby="curriculum-placement-description"
            >
              {preparing ? (
                <>
                  <Loader2 className="animate-spin" size={14} /> Preparing
                  areas…
                </>
              ) : attempts.length ? (
                "Revisit placement"
              ) : (
                "Find my starting point"
              )}
            </button>
            {preparing && (
              <button
                className="check-coach-button"
                onClick={() => {
                  controller.current?.abort();
                  setNotice(
                    "Check preparation cancelled. Your outline is unchanged; you can try again or approve it without placement."
                  );
                }}
              >
                Cancel check preparation
              </button>
            )}
          </section>
          {notice && (
            <p className="curriculum-notice" role="status">
              {notice}
            </p>
          )}
          <footer className="new-topic-footer">
            <button
              className="dialog-secondary-button"
              disabled={preparing}
              onClick={onRevise}
            >
              Adjust goal
            </button>
            <button
              className="dialog-primary-button"
              disabled={preparing}
              onClick={approve}
            >
              Approve curriculum
              <ArrowRight size={14} />
            </button>
          </footer>
        </>
      )}
      {error && (
        <p ref={errorRef} tabIndex={-1} className="topic-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
