import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  CircleX,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
} from "lucide-react";
import type {
  CheckAttempt,
  LearningCheck,
  LearningReference,
} from "../../types";
import { FreeResponseCard } from "./FreeResponseCard";
import { VoiceDictationButton } from "./VoiceDictationButton";
import { usePracticeSupport } from "./usePracticeSupport";
import {
  gradeLearningCheck,
  orderedCheckOptions,
} from "../../services/learning/checks";
import { recordVisualSupport } from "../../services/learning/preferences";
import { MarkdownView } from "../chat/MarkdownView";
import { CodeBlock } from "../chat/CodeBlock";
import {
  formatCheckContext,
  questionPresentation,
} from "./questionPresentation";

export interface QuestionCardProps {
  references?: LearningReference[];
  onDispute?: (check: LearningCheck) => void;
  check: LearningCheck;
  language?: string;
  hideContext?: boolean;
  attempt?: CheckAttempt;
  isBusy: boolean;
  assistedSoFar?: boolean;
  initialRetryIds?: string[];
  initialChoicesHidden?: boolean;
  onSubmit: (check: LearningCheck, attempt: CheckAttempt) => void;
  onAskCoach: () => void;
  onClarify?: () => void;
  onNewQuestion: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  /** The follow-up is still being prepared; Continue stays available. */
  continuePending?: boolean;
  showActions?: boolean;
  showCoachLink?: boolean;
  feedbackTeaching?: React.ReactNode;
}

export const QuestionCard: React.FC<QuestionCardProps> = (props) => {
  const support = usePracticeSupport(props.check.id);
  const shared = {
    ...props,
    assistedSoFar: props.assistedSoFar || support.length > 0,
  };
  return props.check.kind === "free-response" ? (
    <FreeResponseCard {...shared} />
  ) : (
    <ChoiceQuestionCard {...shared} />
  );
};

const ChoiceQuestionCard: React.FC<QuestionCardProps> = ({
  check,
  language,
  hideContext = false,
  attempt,
  isBusy,
  assistedSoFar = false,
  initialRetryIds,
  initialChoicesHidden = false,
  onSubmit,
  onAskCoach,
  onClarify,
  onNewQuestion,
  onContinue,
  continueLabel = "Continue",
  continuePending = false,
  showActions = true,
  showCoachLink = true,
  feedbackTeaching,
}) => {
  const feedbackRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLDivElement>(null);
  const focusRetry = useRef(false);
  const focusFeedback = useRef(false);
  useEffect(() => {
    if (attempt && focusFeedback.current) {
      feedbackRef.current?.focus({ preventScroll: true });
      const frame = requestAnimationFrame(() =>
        feedbackRef.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      );
      focusFeedback.current = false;
      return () => cancelAnimationFrame(frame);
    }
  }, [attempt]);
  const presentation = useMemo(
    () => questionPresentation(check.question),
    [check.question]
  );
  const formattedContext = useMemo(
    () => (check.context ? formatCheckContext(check.context, language) : ""),
    [check.context, language]
  );
  const codeSamples =
    presentation.snippets.length > 1 && !/`snippet \d+`/.test(presentation.stem)
      ? [presentation.snippets.join("\n\n")]
      : presentation.snippets;
  const runnableSnippet = useMemo(() => {
    if (
      !language ||
      !["go", "rust", "python", "typescript", "javascript"].includes(
        language.toLowerCase()
      )
    )
      return null;
    if (codeSamples.length > 0 && codeSamples[0].trim().length > 10) {
      return codeSamples[0].trim();
    }
    const fence = /```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)```/.exec(formattedContext);
    return fence && fence[1].trim().length > 10 ? fence[1].trim() : null;
  }, [language, codeSamples, formattedContext]);
  const [sandboxPrediction, setSandboxPrediction] = useState("");
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxUsed, setSandboxUsed] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<{
    prediction: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  } | null>(null);
  const handleRunSnippet = async () => {
    if (
      !runnableSnippet ||
      !language ||
      isBusy ||
      sandboxRunning ||
      !sandboxPrediction.trim()
    )
      return;
    const prediction = sandboxPrediction.trim();
    if (!attempt) {
      setSandboxUsed(true);
      recordVisualSupport(check.id, "sandbox:predict-run");
    }
    setSandboxRunning(true);
    try {
      const { executeCode } = await import("../../services/sandbox");
      const res = await executeCode(language, runnableSnippet);
      setSandboxResult({
        prediction,
        stdout: res.stdout || "",
        stderr: res.stderr || res.error || "",
        exitCode: res.exitCode,
      });
    } catch (err: any) {
      setSandboxResult({
        prediction,
        stdout: "",
        stderr: err?.message || "Sandbox execution failed.",
        exitCode: 1,
      });
    } finally {
      setSandboxRunning(false);
    }
  };
  const options = useMemo(() => orderedCheckOptions(check), [check]);
  const [draft, setDraft] = useState(() => {
    const empty = {
      selectedIds: [] as string[],
      dontKnow: false,
      thinking: "",
      retriedOptionIds: [...(initialRetryIds || [])],
      confidence: null as CheckAttempt["confidence"],
    };
    try {
      const saved = JSON.parse(
        localStorage.getItem(`learnforge:check-draft:${check.id}`) || "null"
      );
      if (!saved || typeof saved !== "object") return empty;
      return {
        selectedIds: Array.isArray(saved.selectedIds)
          ? (saved.selectedIds
              .filter(
                (id: unknown) =>
                  typeof id === "string" &&
                  check.options.some((option) => option.id === id)
              )
              .slice(0, check.multiple ? check.options.length : 1) as string[])
          : [],
        dontKnow: saved.dontKnow === true,
        thinking: typeof saved.thinking === "string" ? saved.thinking : "",
        retriedOptionIds: Array.isArray(saved.retriedOptionIds)
          ? [
              ...new Set<string>(
                saved.retriedOptionIds.filter(
                  (id: unknown) =>
                    typeof id === "string" &&
                    check.options.some((option) => option.id === id)
                )
              ),
            ]
          : [...(initialRetryIds || [])],
        confidence: ["unsure", "somewhat", "confident"].includes(
          saved.confidence
        )
          ? (saved.confidence as CheckAttempt["confidence"])
          : null,
      };
    } catch {
      return empty;
    }
  });
  useEffect(() => {
    if (!attempt) {
      try {
        localStorage.setItem(
          `learnforge:check-draft:${check.id}`,
          JSON.stringify(draft)
        );
      } catch {}
    }
  }, [draft, check.id, attempt]);
  const selectedIds = attempt?.selectedIds || draft.selectedIds;
  const retriedIds = draft.retriedOptionIds;
  useEffect(() => {
    if (!focusRetry.current || !retriedIds.length) return;
    retryRef.current?.focus({ preventScroll: true });
    retryRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    focusRetry.current = false;
  }, [retriedIds]);
  const [choicesHidden, setChoicesHidden] = useState(initialChoicesHidden);
  const select = (id: string) => {
    if (isBusy || attempt || (!check.multiple && retriedIds.includes(id)))
      return;
    setDraft((previous) => ({
      ...previous,
      dontKnow: false,
      selectedIds: check.multiple
        ? previous.selectedIds.includes(id)
          ? previous.selectedIds.filter((value) => value !== id)
          : [...previous.selectedIds, id]
        : [id],
    }));
  };
  const submittedRef = useRef(false);
  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (
      attempt ||
      submittedRef.current ||
      isBusy ||
      (!draft.dontKnow && !draft.selectedIds.length)
    )
      return;
    const isCorrect = gradeLearningCheck(
      check,
      draft.selectedIds,
      draft.dontKnow
    );
    // Feedback-first retry (#237): on multi-option checks (3+ options), give one
    // chance to repair a wrong selection before revealing the committed answer.
    if (
      !draft.dontKnow &&
      !isCorrect &&
      retriedIds.length === 0 &&
      options.length >= 3
    ) {
      focusRetry.current = true;
      setDraft((previous) => ({
        ...previous,
        retriedOptionIds: [...previous.selectedIds],
        selectedIds: check.multiple ? previous.selectedIds : [],
      }));
      return;
    }
    submittedRef.current = true;
    focusFeedback.current = true;
    onSubmit(check, {
      ...draft,
      checkId: check.id,
      milestoneId: check.milestoneId,
      correct: isCorrect,
      assisted: assistedSoFar || retriedIds.length > 0 || sandboxUsed ? true : undefined,
      retriedOptionIds: retriedIds.length > 0 ? retriedIds : undefined,
      submittedAt: Date.now(),
    });
  };
  const revealSolution = () => {
    if (attempt || submittedRef.current || isBusy) return;
    submittedRef.current = true;
    focusFeedback.current = true;
    const chosen = draft.selectedIds.length ? draft.selectedIds : retriedIds;
    onSubmit(check, {
      ...draft,
      selectedIds: chosen,
      checkId: check.id,
      milestoneId: check.milestoneId,
      correct: false,
      assisted: true,
      retriedOptionIds: retriedIds.length > 0 ? retriedIds : undefined,
      submittedAt: Date.now(),
    });
  };
  useEffect(() => {
    if (!attempt) submittedRef.current = false;
  }, [attempt]);

  // Keyboard: A–F / 1–9 choose, ? = don't know, [ / ] = confidence, T = think out loud, Enter = check.
  const sectionRef = useRef<HTMLElement>(null);
  const thinkingInputRef = useRef<HTMLTextAreaElement>(null);
  const [detailOpen, setDetailOpen] = useState(
    () => Boolean(draft.thinking || draft.confidence)
  );
  const keyState = useRef({
    submit,
    select,
    attempt,
    onContinue,
    isBusy,
    options,
    choicesHidden,
  });
  keyState.current = {
    submit,
    select,
    attempt,
    onContinue,
    isBusy,
    options,
    choicesHidden,
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const section = sectionRef.current;
      if (
        !section ||
        !section.isConnected ||
        section.offsetParent === null ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector("dialog[open]")
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "textarea, select, [contenteditable='true'], input[type='text'], input:not([type])"
        )
      )
        return;
      if (target && target !== document.body && !section.contains(target))
        return;
      const state = keyState.current;
      if (state.isBusy) return;
      if (event.key === "Enter") {
        // Let focused buttons, links and disclosures handle Enter natively.
        if (target?.closest("button, a, summary")) return;
        event.preventDefault();
        if (!state.attempt) state.submit();
        else if (state.onContinue && !state.isBusy) state.onContinue();
        return;
      }
      if (state.attempt || state.choicesHidden) return;
      if (event.key === "?") {
        event.preventDefault();
        setDraft((previous) => ({
          ...previous,
          dontKnow: !previous.dontKnow,
          selectedIds: [],
        }));
        return;
      }
      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        setDetailOpen(true);
        requestAnimationFrame(() => {
          thinkingInputRef.current?.focus();
        });
        return;
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        setDetailOpen(true);
        const levels = ["unsure", "somewhat", "confident"] as const;
        setDraft((previous) => {
          const idx = previous.confidence
            ? levels.indexOf(previous.confidence)
            : -1;
          const nextIdx =
            event.key === "]"
              ? Math.min(levels.length - 1, idx + 1)
              : idx <= 0
              ? 0
              : idx - 1;
          return { ...previous, confidence: levels[nextIdx] };
        });
        return;
      }
      const key = event.key.toLowerCase();
      const index = /^[a-f]$/.test(key)
        ? key.charCodeAt(0) - 97
        : /^[1-9]$/.test(key)
        ? Number(key) - 1
        : -1;
      if (index >= 0 && index < state.options.length) {
        event.preventDefault();
        state.select(state.options[index].id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`knowledge-check ${attempt ? "is-answered" : ""}`}
      aria-label="Check your understanding"
    >
      <div className="check-kicker">
        <CircleHelp size={15} />
        <span>Check your understanding</span>
        {!attempt && (
          <span
            className={`check-mode-pill ${
              assistedSoFar || retriedIds.length > 0 || sandboxUsed
                ? "is-open-book"
                : "is-closed-book"
            }`}
          >
            {assistedSoFar || retriedIds.length > 0 || sandboxUsed
              ? "Supported practice"
              : "Independent practice"}
          </span>
        )}
      </div>
      <details
        open={!attempt}
        className={`check-question-review ${attempt ? "is-submitted" : ""}`}
      >
        <summary>Review question and choices</summary>
        {!hideContext && formattedContext && (
          <div className="check-context">
            <MarkdownView content={formattedContext} languageHint={language} />
          </div>
        )}

        {!hideContext && presentation.snippets.length > 0 && (
          <div className="check-code-context">
            {codeSamples.map((code, index) => (
              <CodeBlock
                key={index}
                code={code}
                language={language}
                title={
                  codeSamples.length > 1 ? `Snippet ${index + 1}` : "Given code"
                }
              />
            ))}
          </div>
        )}
        {runnableSnippet && (
          <details className="check-predict-run">
            <summary>
              <Play size={12} />
              <span>Predict & run snippet in sandbox</span>
            </summary>
            <div className="check-predict-run-body">
              <div className="check-predict-input-row">
                <input
                  type="text"
                  value={sandboxPrediction}
                  disabled={sandboxRunning || isBusy}
                  onChange={(e) => setSandboxPrediction(e.target.value)}
                  placeholder="Predict output before running (e.g. 42, or deadlock)…"
                  aria-label="Predicted output"
                />
                <button
                  type="button"
                  className="check-coach-button"
                  disabled={
                    isBusy || sandboxRunning || !sandboxPrediction.trim()
                  }
                  onClick={() => void handleRunSnippet()}
                >
                  {sandboxRunning ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Play size={13} />
                  )}
                  <span>Run snippet</span>
                </button>
              </div>
              {sandboxResult && (
                <div className="check-predict-comparison" role="status">
                  {sandboxResult.prediction && (
                    <div>
                      <small>Your prediction before running</small>
                      <pre>{sandboxResult.prediction}</pre>
                    </div>
                  )}
                  <div>
                    <small>
                      Sandbox{" "}
                      {sandboxResult.exitCode === 0 ? "stdout" : "output"}
                    </small>
                    <pre>
                      {sandboxResult.stdout.trim() ||
                        sandboxResult.stderr.trim() ||
                        "(no output)"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
        <div
          id={`question-${check.id}`}
          className="check-question"
          tabIndex={-1}
          role="heading"
          aria-level={2}
        >
          <MarkdownView content={presentation.stem} languageHint={language} />
        </div>
        <form onSubmit={submit}>
          <fieldset
            className="check-options"
            aria-labelledby={`question-${check.id}`}
            disabled={!!attempt || isBusy}
          >
            {!attempt && (
              <legend className="check-legend-row">
                <span>
                  {check.multiple
                    ? "Select all that apply"
                    : "Choose one answer"}
                </span>
                <button
                  type="button"
                  className="check-recall-toggle"
                  aria-pressed={choicesHidden}
                  onClick={() => setChoicesHidden((v) => !v)}
                >
                  {choicesHidden
                    ? "Show choices"
                    : "Recall before seeing choices"}
                </button>
              </legend>
            )}
            {choicesHidden && !attempt ? (
              <div className="check-recall-gate">
                <label htmlFor={`recall-thinking-${check.id}`}>
                  Formulate your answer in your own words first
                </label>
                <textarea
                  id={`recall-thinking-${check.id}`}
                  rows={2}
                  value={draft.thinking}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      thinking: event.target.value,
                    }))
                  }
                  placeholder="Write your prediction or reasoning before looking at the options…"
                />
                <button
                  type="button"
                  className="check-coach-button"
                  onClick={() => setChoicesHidden(false)}
                >
                  Reveal choices to compare
                </button>
              </div>
            ) : (
              options.map((option, index) => {
                const chosen = selectedIds.includes(option.id);
                const correct =
                  !!attempt && check.correctOptionIds.includes(option.id);
                const wrong = !!attempt && chosen && !correct;
                // A partly correct multi-select answer must remain editable.
                const eliminated =
                  !attempt && !check.multiple && retriedIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`check-option ${chosen ? "is-selected" : ""} ${
                      correct ? "is-right" : ""
                    } ${wrong ? "is-wrong" : ""} ${
                      eliminated ? "is-eliminated" : ""
                    }`}
                  >
                    <input
                      type={check.multiple ? "checkbox" : "radio"}
                      name={`answer-${check.id}`}
                      value={option.id}
                      checked={chosen}
                      disabled={eliminated}
                      onChange={() => select(option.id)}
                    />
                    <span className="check-option-letter">
                      {correct ? (
                        <Check size={13} />
                      ) : (
                        String.fromCharCode(65 + index)
                      )}
                    </span>
                    <span className="check-option-label">
                      <MarkdownView
                        content={option.label}
                        languageHint={language}
                      />
                      {attempt && chosen && (
                        <small>
                          Your answer{wrong ? " · not correct" : ""}
                        </small>
                      )}
                      {eliminated && (
                        <small>First try · try another option</small>
                      )}
                      {correct && !chosen && <small>Correct answer</small>}
                    </span>
                  </label>
                );
              })
            )}
            {!attempt && (
              <label
                className={`check-option check-unknown ${
                  draft.dontKnow ? "is-selected" : ""
                }`}
              >
                <input
                  type={check.multiple ? "checkbox" : "radio"}
                  name={`answer-${check.id}`}
                  checked={draft.dontKnow}
                  onChange={() =>
                    setDraft((previous) => ({
                      ...previous,
                      dontKnow: !previous.dontKnow,
                      selectedIds: [],
                    }))
                  }
                />
                <span className="check-option-letter" aria-hidden="true">
                  ?
                </span>
                <span className="check-option-label">I don’t know yet</span>
              </label>
            )}
          </fieldset>
          {!attempt && (
            <p className="check-key-hints" aria-hidden="true">
              <kbd>{String.fromCharCode(65)}</kbd>–
              <kbd>{String.fromCharCode(64 + Math.max(1, options.length))}</kbd>{" "}
              choose · <kbd>?</kbd> not sure · <kbd>[</kbd>
              <kbd>]</kbd> confidence · <kbd>T</kbd> think out loud ·{" "}
              <kbd>↵</kbd> check answer
            </p>
          )}
          {!attempt && (
            <>
              <details
                className="check-response-detail"
                open={detailOpen}
                onToggle={(e) =>
                  setDetailOpen((e.currentTarget as HTMLDetailsElement).open)
                }
              >
                <summary>
                  Add confidence or reasoning <span>Optional</span>
                </summary>
                <div
                  className="check-confidence"
                  role="group"
                  aria-label="Confidence (optional)"
                >
                  <span>
                    How sure are you? <small>Optional</small>
                  </span>
                  {(["unsure", "somewhat", "confident"] as const).map(
                    (value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={draft.confidence === value}
                        onClick={() =>
                          setDraft((previous) => ({
                            ...previous,
                            confidence:
                              previous.confidence === value ? null : value,
                          }))
                        }
                      >
                        {value === "unsure"
                          ? "Unsure"
                          : value === "somewhat"
                          ? "Somewhat sure"
                          : "Confident"}
                      </button>
                    )
                  )}
                </div>
                <div className="check-reasoning">
                  <div className="check-field-header">
                    <label htmlFor={`thinking-${check.id}`}>
                      Your thinking <span>Optional</span>
                    </label>
                    <VoiceDictationButton
                      label="Dictate your thinking"
                      disabled={isBusy}
                      onTranscript={(chunk) =>
                        setDraft((previous) => ({
                          ...previous,
                          thinking: previous.thinking
                            ? `${previous.thinking.trimEnd()} ${chunk}`
                            : chunk,
                        }))
                      }
                    />
                  </div>
                  <textarea
                    ref={thinkingInputRef}
                    id={`thinking-${check.id}`}
                    rows={2}
                    value={draft.thinking}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        thinking: event.target.value,
                      }))
                    }
                    placeholder="What led you to this answer? A sentence is enough."
                  />
                </div>
              </details>
              {retriedIds.length > 0 && (
                <div
                  className="check-retry-banner"
                  ref={retryRef}
                  tabIndex={-1}
                  role="status"
                >
                  <div className="check-retry-header">
                    <CircleAlert size={15} aria-hidden="true" />
                    <strong>Try the choice again</strong>
                  </div>
                  <p>
                    {check.hint ||
                      (check.multiple
                        ? "That combination doesn’t quite fit. Revise your choices (counts as supported practice), or reveal the explanation."
                        : "That first option doesn’t hold here. Pick another choice to test your reasoning (counts as supported practice), or reveal the full explanation now.")}
                  </p>
                  <button
                    type="button"
                    className="check-coach-button check-reveal-button"
                    onClick={revealSolution}
                  >
                    Show full answer
                  </button>
                </div>
              )}
              <div className="check-submit-row">
                <button
                  className="dialog-primary-button"
                  type="submit"
                  disabled={
                    isBusy || (!draft.dontKnow && !draft.selectedIds.length)
                  }
                >
                  {retriedIds.length > 0 ? "Check retry" : "Check answer"}
                  <ArrowRight size={14} />
                </button>
                {onClarify && (
                  <button
                    className="check-coach-button"
                    type="button"
                    disabled={isBusy}
                    onClick={onClarify}
                  >
                    Clarify question
                  </button>
                )}
                {showCoachLink && (
                  <button
                    className="check-coach-button"
                    type="button"
                    onClick={onAskCoach}
                  >
                    <MessageSquare size={14} />
                    Ask a question first
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      </details>
      {attempt && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          className={`check-feedback ${
            attempt.correct
              ? "is-correct"
              : attempt.dontKnow
              ? "is-review"
              : "is-wrong"
          }`}
          role="status"
        >
          <h3 className="check-feedback-title">
            {attempt.correct ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : attempt.dontKnow ? (
              <CircleHelp size={18} aria-hidden="true" />
            ) : (
              <CircleX size={18} aria-hidden="true" />
            )}
            {attempt.correct
              ? "That’s right"
              : attempt.dontKnow
              ? "Let’s work through it"
              : "Not quite"}
          </h3>
          <dl className="check-answer-lines">
            {!!attempt.retriedOptionIds?.length && (
              <div className="is-chosen">
                <dt>Your first answer</dt>
                <dd>
                  {check.options
                    .filter((option) =>
                      attempt.retriedOptionIds!.includes(option.id)
                    )
                    .map((option) => (
                      <MarkdownView
                        key={option.id}
                        content={option.label}
                        languageHint={language}
                      />
                    ))}
                </dd>
              </div>
            )}
            <div className={attempt.correct ? "is-right" : "is-chosen"}>
              <dt>
                {attempt.retriedOptionIds?.length
                  ? "Your retry · supported practice"
                  : "Your answer"}
              </dt>
              <dd>
                {attempt.dontKnow ? (
                  <p>I don’t know yet</p>
                ) : (
                  check.options
                    .filter((option) => attempt.selectedIds.includes(option.id))
                    .map((option) => (
                      <MarkdownView
                        key={option.id}
                        content={option.label}
                        languageHint={language}
                      />
                    ))
                )}
              </dd>
            </div>
            {!attempt.correct && (
              <div className="is-right">
                <dt>Correct answer</dt>
                <dd>
                  {check.options
                    .filter((option) =>
                      check.correctOptionIds.includes(option.id)
                    )
                    .map((option) => (
                      <MarkdownView
                        key={option.id}
                        content={option.label}
                        languageHint={language}
                      />
                    ))}
                </dd>
              </div>
            )}
          </dl>
          {feedbackTeaching || (
            <div className="check-feedback-explanation">
              <MarkdownView
                content={check.explanation}
                languageHint={language}
              />
            </div>
          )}
          {attempt.assisted && !attempt.retriedOptionIds?.length && (
            <p className="written-grading-note">
              With support · try a fresh case before this counts toward
              readiness.
            </p>
          )}
          {!feedbackTeaching && (
            <p className="check-feedback-pause">
              {isBusy
                ? "Preparing your next step…"
                : continuePending && onContinue
                ? "Your next step is being prepared. Continue whenever you’re ready."
                : onContinue
                ? "Take a moment to review. Continue when you’re ready."
                : "Your answer and this explanation are saved with the lesson."}
            </p>
          )}
          {attempt.thinking && (
            <details>
              <summary>Your thinking</summary>
              <p>{attempt.thinking}</p>
            </details>
          )}
          {(showActions || onContinue) && (
            <div className="check-feedback-actions">
              {onContinue ? (
                <button
                  className="dialog-primary-button"
                  disabled={isBusy}
                  onClick={onContinue}
                >
                  {continueLabel}
                  {continuePending ? (
                    <Loader2
                      size={14}
                      className="animate-spin"
                      aria-label="Preparing"
                    />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                  <kbd className="key-hint" aria-hidden="true">
                    ↵
                  </kbd>
                </button>
              ) : showActions ? (
                <button
                  className="dialog-primary-button"
                  disabled={isBusy}
                  onClick={onNewQuestion}
                >
                  <RefreshCw size={14} />
                  Another question
                </button>
              ) : null}
              {showActions && (
                <button className="check-coach-button" onClick={onAskCoach}>
                  <MessageSquare size={14} />
                  Discuss with coach
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
