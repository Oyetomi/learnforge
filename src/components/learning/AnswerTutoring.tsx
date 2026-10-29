import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Loader2 } from "lucide-react";
import type { ChatMessage, LearningCheck } from "../../types";
import { splitLessonIntoSteps } from "../../services/learning/steps";
import {
  readTutoringPosition,
  saveTutoringPosition,
} from "../../services/learning/tutoring";
import { MarkdownView } from "../chat/MarkdownView";
import "./answer-tutoring.css";

interface Props {
  check: LearningCheck;
  teaching?: ChatMessage;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  language?: string;
  onRetry: () => void;
  onContinue: () => void;
  onApplyCode?: (code: string) => void;
  continueLabel?: string;
  initialTogether?: boolean;
  feedbackChanged?: boolean;
}

export function AnswerTutoring({
  check,
  teaching,
  loading,
  failed,
  busy,
  language,
  onRetry,
  onContinue,
  onApplyCode,
  continueLabel = "Practise with a fresh case",
  initialTogether = false,
  feedbackChanged = false,
}: Props) {
  // Headings define teaching stages. Paragraphs inside a worked example stay together.
  const steps = splitLessonIntoSteps(
    teaching?.content,
    Number.POSITIVE_INFINITY
  );
  const [position, setPosition] = useState(() =>
    readTutoringPosition(teaching?.id, initialTogether)
  );
  const { index, together } = position;
  const step = Math.min(index, Math.max(0, steps.length - 1));
  const contentRef = useRef<HTMLDivElement>(null);
  const userNavigated = useRef(false);
  useEffect(
    () => setPosition(readTutoringPosition(teaching?.id, initialTogether)),
    [teaching?.id]
  );
  useEffect(() => {
    // Generation never moves focus. Only the learner's step navigation does.
    if (!userNavigated.current) return;
    contentRef.current?.focus({ preventScroll: true });
    contentRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    userNavigated.current = false;
  }, [step]);
  const updatePosition = (next: typeof position) => {
    setPosition(next);
    saveTutoringPosition(teaching?.id, next);
  };
  const move = (next: number) => {
    userNavigated.current = true;
    updatePosition({ ...position, index: next });
  };
  const nextTitle = steps[step + 1]
    ?.match(/^#{1,6}\s+(.+)$/m)?.[1]
    .replace(/[*_`]/g, "")
    .slice(0, 70);
  return (
    <section className="answer-tutoring" aria-label="Tutoring for your answer">
      <header>
        <span>
          <BookOpen size={14} aria-hidden="true" />
          Work through the idea
        </span>
        {steps.length > 0 && (
          <small>
            {together
              ? "Complete explanation"
              : `Part ${step + 1} of ${steps.length}`}
          </small>
        )}
      </header>
      {steps.length ? (
        <>
          {steps.length > 1 && (
            <div
              className="answer-reading-options"
              role="group"
              aria-label="Explanation layout"
            >
              <button
                type="button"
                aria-pressed={!together}
                onClick={() => updatePosition({ index: step, together: false })}
              >
                One part at a time
              </button>
              <button
                type="button"
                aria-pressed={together}
                onClick={() => updatePosition({ index: step, together: true })}
              >
                Read together
              </button>
            </div>
          )}
          <div
            ref={contentRef}
            tabIndex={-1}
            className="answer-tutoring-step"
            key={`${teaching?.id}:${step}`}
          >
            <MarkdownView
              content={together ? steps.join("\n\n") : steps[step]}
              languageHint={language}
              onApplyCode={onApplyCode}
            />
          </div>
          <nav aria-label="Tutoring steps">
            {!together && step > 0 && (
              <button
                type="button"
                className="check-coach-button"
                onClick={() => move(step - 1)}
              >
                <ArrowLeft size={14} />
                Previous part
              </button>
            )}
            <button
              type="button"
              className="dialog-primary-button"
              disabled={busy && (together || step === steps.length - 1)}
              onClick={() =>
                !together && step < steps.length - 1
                  ? move(step + 1)
                  : onContinue()
              }
            >
              {!together && step < steps.length - 1
                ? nextTitle
                  ? `Next: ${nextTitle}`
                  : "Next part"
                : busy
                ? "Preparing next step…"
                : continueLabel}
              {busy && (together || step === steps.length - 1) ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
            </button>
          </nav>
        </>
      ) : (
        <>
          {feedbackChanged ? (
            <p className="answer-tutoring-status">
              Your feedback is under review. We can work through the idea again
              without treating that judgment as settled.
            </p>
          ) : (
            <MarkdownView content={check.explanation} languageHint={language} />
          )}
          {loading ? (
            <p className="answer-tutoring-status" role="status">
              <Loader2 size={14} className="animate-spin" />
              Your tutor is preparing a worked explanation. Your answer stays
              here.
            </p>
          ) : (
            <div
              className="answer-tutoring-status"
              role={failed ? "alert" : undefined}
            >
              <p>
                {failed
                  ? "The tutoring couldn’t finish. Your answer is saved; you can try again."
                  : feedbackChanged
                  ? "We’ll compare your reasoning with a small example."
                  : "Work through why this answer fits, with a small example."}
              </p>
              <button
                type="button"
                className="dialog-primary-button"
                disabled={busy}
                onClick={onRetry}
              >
                {failed ? "Retry tutoring" : "Work through my answer"}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
