import React, { useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  CheckAttempt,
  LearningCheck,
  LearningSession,
  Milestone,
  SRSCard,
} from "../../types";
import type { LocalDatabase } from "../../services/db/storage";
import {
  createRetentionCheck,
  eligibleRetentionCards,
} from "../../services/learning/retention";
import { visualSupportFor } from "../../services/learning/preferences";
import { useLearningPreferences } from "./useLearningPreferences";
import { isAcceptedFreeResponseGrade } from "../../services/learning/freeResponse";
import { gradeLearningCheck } from "../../services/learning/checks";
import { recordDemonstratedConcept } from "../../services/learning/conceptLedger";
import { QuestionCard } from "./QuestionCard";
import { ReferenceShelf } from "./ReferenceShelf";
import "./retention-flow.css";

interface Props {
  session: LearningSession;
  milestones: Milestone[];
  cards: SRSCard[];
  database: LocalDatabase;
  onActiveChange: (active: boolean) => void;
  onSaved: () => void;
}
export const RetentionFlow: React.FC<Props> = ({
  session,
  milestones,
  cards,
  database,
  onActiveChange,
  onSaved,
}) => {
  const preferences = useLearningPreferences();
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
  const dismissKey = `learnforge:retention-dismissed:${session.id}`;
  const [dismissedOn, setDismissedOn] = useState(() => {
    try {
      return localStorage.getItem(dismissKey);
    } catch {
      return null;
    }
  });
  const dismissed = dismissedOn === day;
  const [active, setActive] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SRSCard | null>(null);
  const [check, setCheck] = useState<LearningCheck | null>(null);
  const [reviewMessage, setReviewMessage] = useState<ChatMessage | null>(null);
  const [repair, setRepair] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const eligible = eligibleRetentionCards(cards, session, milestones);
  const card = selectedCard || eligible[0];
  const milestone = milestones.find((m) => m.id === card?.milestone_id);
  useEffect(() => {
    onActiveChange(active && preferences.retention);
    return () => onActiveChange(false);
  }, [active, preferences.retention]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (preferences.retention) return;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setActive(false);
  }, [preferences.retention]);
  useEffect(() => {
    if (!active) return;
    const target =
      check && !busy
        ? document.getElementById(`question-${check.id}`) ||
          document.getElementById(`written-question-${check.id}`)
        : heading.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [active, check?.id, busy]);
  const dismiss = () => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setError("");
    setActive(false);
    setDismissedOn(day);
    requestAnimationFrame(() => {
      const target = previousFocus.current?.isConnected
        ? previousFocus.current
        : document.querySelector<HTMLElement>(
            "#lesson-workspace .session-slot h1, #lesson-workspace .session-slot [role='heading']"
          );
      target?.focus({ preventScroll: true });
    });
    try {
      localStorage.setItem(dismissKey, day);
    } catch {}
  };
  const prepare = async (smaller = false) => {
    if (!card || !milestone || busy || request.current) return;
    if (!active)
      previousFocus.current = document.activeElement as HTMLElement | null;
    setSelectedCard(card);
    setActive(true);
    setError("");
    setRepair(smaller);
    if (!smaller) {
      const saved = [...database.getMessages(session.id)]
        .reverse()
        .find(
          (m) =>
            m.retention_review?.cardId === card.id &&
            m.retention_review.finishedAt === undefined
        );
      if (saved?.retention_review) {
        setCheck(saved.retention_review.check);
        setReviewMessage(saved);
        return;
      }
    }
    setCheck(null);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    setBusy(true);
    try {
      const next = await createRetentionCheck(
        card,
        milestone,
        controller.signal,
        smaller
      );
      if (controller.signal.aborted) return;
      setRepair(smaller);
      setCheck(next);
      setReviewMessage(null);
      saving.current = false;
    } catch (reason) {
      if (request.current === controller)
        setError(
          controller.signal.aborted
            ? "Preparing this revisit timed out. Your lesson is saved."
            : reason instanceof Error
            ? reason.message
            : "Couldn’t prepare this revisit."
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  const record = (question: LearningCheck, attempt: CheckAttempt) => {
    if (
      !card ||
      !milestone ||
      saving.current ||
      reviewMessage ||
      question.id !== check?.id
    )
      return;
    saving.current = true;
    const support = visualSupportFor(question.id);
    const result = {
      ...attempt,
      assisted: Boolean(attempt.assisted || repair || support.length),
      visualSupportIds: support,
      correct:
        question.kind === "free-response"
          ? !attempt.dontKnow &&
            isAcceptedFreeResponseGrade(question, attempt.grading)
          : gradeLearningCheck(question, attempt.selectedIds, attempt.dontKnow),
    };
    const answer = result.dontKnow
      ? "I don’t know yet"
      : result.response ||
        question.options
          .filter((o) => result.selectedIds.includes(o.id))
          .map((o) => o.label)
          .join("; ");
    const message = database.addMessage({
      session_id: session.id,
      role: "user",
      content: `Revisit: ${milestone.title}\nMy answer: ${answer}\nOutcome: ${
        result.grading?.status || (result.correct ? "correct" : "needs work")
      }`,
      retention_review: { cardId: card.id, check: question, attempt: result },
    });
    setReviewMessage(message);
    onSaved();
  };
  const finish = (close = true) => {
    const review = reviewMessage?.retention_review;
    if (!review || !reviewMessage) return;
    database.finishRetentionReview(session.id, reviewMessage.id);
    if (review.attempt.correct && milestone) {
      recordDemonstratedConcept({
        title: milestone.title,
        outcome: milestone.prompt || milestone.title,
        trackId: session.track_id || session.id,
        trackTitle: session.title,
        milestoneId: milestone.id,
        language: session.language,
        source: "retention",
      });
    }
    onSaved();
    if (close) dismiss();
  };
  if (!preferences.retention || (!active && (dismissed || !card || !milestone)))
    return null;
  if (!active)
    return (
      <aside className="retention-offer" aria-label="Optional revisit">
        <div>
          <strong>Try one from last time</strong>
          <p>
            A fresh case for {milestone?.title}. Your current lesson stays
            saved.
          </p>
        </div>
        <button
          type="button"
          className="check-coach-button"
          onClick={() => void prepare()}
        >
          Try a quick revisit
        </button>
        <button type="button" className="check-coach-button" onClick={dismiss}>
          Not now
        </button>
      </aside>
    );
  return (
    <section
      className="workspace-panel retention-session"
      aria-label="Revisit an earlier idea"
    >
      <header>
        <div>
          <h2 ref={heading} tabIndex={-1}>
            Revisit · {milestone?.title}
          </h2>
          <p>A fresh application, kept separate from roadmap readiness.</p>
        </div>
        <button type="button" className="check-coach-button" onClick={dismiss}>
          Back to current lesson
        </button>
      </header>
      <div className="retention-body">
        {busy && <p role="status">Preparing one small case…</p>}
        {error && (
          <div className="continuation-error" role="alert">
            <p>{error}</p>
            <button
              className="check-coach-button"
              onClick={() => void prepare(repair)}
            >
              Try again
            </button>
          </div>
        )}
        {check && !busy && (
          <>
            <ReferenceShelf
              references={milestone?.references}
              pendingCheckId={!reviewMessage ? check.id : undefined}
            />
            <QuestionCard
              key={check.id}
              check={check}
              references={milestone?.references}
              language={session.language || undefined}
              attempt={reviewMessage?.retention_review?.attempt}
              isBusy={false}
              assistedSoFar={repair || visualSupportFor(check.id).length > 0}
              onSubmit={record}
              onAskCoach={() => {}}
              onNewQuestion={() => void prepare()}
              onContinue={() => finish()}
              continueLabel="Finish revisit"
              onDispute={() => {
                if (!reviewMessage) return;
                const review = database.disputeRetentionReview(
                  session.id,
                  reviewMessage.id
                );
                if (review) {
                  setReviewMessage({
                    ...reviewMessage,
                    retention_review: review,
                  });
                  onSaved();
                }
              }}
              showCoachLink={false}
            />
            {reviewMessage?.retention_review &&
              !reviewMessage.retention_review.attempt.correct && (
                <button
                  className="check-coach-button"
                  type="button"
                  onClick={() => {
                    finish(false);
                    void prepare(true);
                  }}
                >
                  Try a smaller example
                </button>
              )}
          </>
        )}
      </div>
    </section>
  );
};
