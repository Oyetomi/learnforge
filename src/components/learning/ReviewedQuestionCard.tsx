import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import type { QuestionCardProps } from "./QuestionCard";
import type { LearningCheck, LearningReference } from "../../types";
import { QuestionCard } from "./QuestionCard";
import { questionReviewIdentity, readQuestionReview, reviewQuestion, saveQuestionReview, type QuestionReview } from "../../services/learning/questionReview";
import "./question-review.css";

export function QuestionReviewStatus({ busy, error, needsRevision, disabled, onRetry, onReplace, onReturn }: {
  busy: boolean; error?: string; needsRevision?: boolean; disabled?: boolean; onRetry: () => void; onReplace: () => void; onReturn?: () => void;
}) {
  return <section className="question-review" aria-label="Preparing your question" aria-busy={busy}>
    <span className="question-review-kicker">Your next question</span>
    <h2>{busy ? "Checking the question before you answer" : needsRevision ? "Let’s use a clearer question" : "Your lesson is still here"}</h2>
    <p role={error ? "alert" : "status"}>{busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking the answer and whether the question is clear…</> :
      needsRevision ? "The question and its answer didn’t agree clearly enough. You haven’t been graded. We can try a different example." : error}</p>
    <div className="question-review-actions">
      {!busy && <button className={needsRevision ? "check-coach-button" : "dialog-primary-button"} disabled={disabled} onClick={onRetry}><RefreshCw size={14} /> Retry check</button>}
      <button className={needsRevision ? "dialog-primary-button" : "check-coach-button"} disabled={busy || disabled} onClick={onReplace}>Try a different question <ArrowRight size={14} /></button>
      {onReturn && <button className="check-coach-button" onClick={onReturn}>Back to the explanation</button>}
    </div>
  </section>;
}

/** Can run while the learner reads, rather than adding a wait to every question. */
export function useQuestionReview(check: LearningCheck | null, references?: LearningReference[], enabled = true) {
  const identity = check ? questionReviewIdentity(check, references) : "";
  const [state, setState] = useState<{ identity: string; review?: QuestionReview; error?: string }>(() => ({ identity, review: readQuestionReview(identity) || undefined }));
  const [retry, setRetry] = useState({ identity: "", count: 0 });
  const review = state.identity === identity ? state.review : undefined;
  const error = state.identity === identity ? state.error : undefined;
  useEffect(() => {
    if (!enabled || !check) return;
    const cached = readQuestionReview(identity);
    if (cached && retry.identity !== identity) { setState({ identity, review: cached }); return; }
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      controller.abort();
      if (active) setState({ identity, error: "The check took too long. Your lesson and answer draft are saved. You can retry." });
    }, 20000);
    setState({ identity });
    void reviewQuestion(check, references, controller.signal).then(result => {
      if (!controller.signal.aborted) { saveQuestionReview(identity, result); setState({ identity, review: result }); }
    }).catch(() => {
      if (active) setState({ identity, error: controller.signal.aborted ? "The check took too long. Your lesson and answer draft are saved. You can retry." : "We couldn’t finish checking this question. Your lesson and answer draft are saved." });
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [identity, retry.count, enabled]);
  return { identity, review, error, retry: () => setRetry(previous => ({ identity, count: previous.count + 1 })) };
}

/** Production gate for session/revisit checks. Existing submitted work is never hidden. */
export function ReviewedQuestionCard(props: QuestionCardProps & { onReturn?: () => void; reviewState?: ReturnType<typeof useQuestionReview> }) {
  const ownState = useQuestionReview(props.check, props.references, !props.attempt && !props.reviewState);
  const state = props.reviewState || ownState;
  const identity = questionReviewIdentity(props.check, props.references);
  const review = state.identity === identity ? state.review : undefined;
  const error = state.identity === identity ? state.error : undefined;
  const slot = useRef<HTMLDivElement>(null);
  const gated = !props.attempt && review?.status !== "approved";
  const wasGated = useRef(gated);
  useEffect(() => {
    if (wasGated.current && !gated && !props.attempt && slot.current &&
      (document.activeElement === document.body || slot.current.contains(document.activeElement))) {
      slot.current.querySelector<HTMLElement>(".check-question")?.focus({ preventScroll: true });
    }
    wasGated.current = gated;
  }, [gated, !!props.attempt]);
  return <div ref={slot} className="reviewed-question-slot">{!gated ? <QuestionCard {...props} onSubmit={(check, attempt) => {
    if (review?.status === "approved") props.onSubmit(check, { ...attempt,
      questionReview: { identity, model: review.model, reviewedAt: review.reviewedAt } });
  }} /> : <QuestionReviewStatus busy={!review && !error} needsRevision={review?.status === "revise"} error={error}
    disabled={props.isBusy}
    onRetry={state.retry} onReplace={props.onNewQuestion} onReturn={props.onReturn} />}</div>;
}
