import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { QuestionCardProps } from "./QuestionCard";
import type { CheckAttempt, FreeResponseGrade } from "../../types";
import { gradeFreeResponse } from "../../services/learning/freeResponse";
import { MarkdownView } from "../chat/MarkdownView";

export const FreeResponseCard: React.FC<QuestionCardProps> = ({ check, attempt, references, language, hideContext,
  isBusy, assistedSoFar, onSubmit, onDispute, onAskCoach, onContinue, continueLabel = "Continue", continuePending, showCoachLink = true }) => {
  const key = `learnforge:check-draft:${check.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      return { response: typeof saved?.response === "string" ? saved.response.slice(0, 6000) : "",
        confidence: ["unsure", "somewhat", "confident"].includes(saved?.confidence) ? saved.confidence as CheckAttempt["confidence"] : null };
    } catch { return { response: "", confidence: null as CheckAttempt["confidence"] }; }
  });
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const committed = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    if (!attempt) { try { localStorage.setItem(key, JSON.stringify(draft)); } catch {} }
    else if (focusResult.current) {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      focusResult.current = false;
    }
  }, [draft, attempt, key]);
  const save = (grading: FreeResponseGrade, dontKnow = false) => {
    if (committed.current || attempt) return;
    committed.current = true;
    focusResult.current = true;
    onSubmit(check, { checkId: check.id, milestoneId: check.milestoneId, selectedIds: [], dontKnow,
      thinking: "", confidence: draft.confidence, response: dontKnow ? "" : draft.response.trim(), grading,
      correct: grading.status === "correct", assisted: assistedSoFar || undefined, submittedAt: Date.now() });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (checking || isBusy || attempt || !draft.response.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    setChecking(true); setError("");
    try {
      const grade = await gradeFreeResponse(check, draft.response, references, controller.signal);
      if (!controller.signal.aborted) save(grade);
    } catch (reason) {
      if (request.current === controller) setError(controller.signal.aborted
        ? "Checking timed out. Your answer is saved; retry or continue without a grade."
        : reason instanceof Error ? reason.message : "Couldn’t check the answer. Your draft is saved.");
    } finally { clearTimeout(timeout); if (request.current === controller) setChecking(false); }
  };
  const uncertain = (feedback: string): FreeResponseGrade => ({ status: "uncertain", feedback,
    criteria: (check.rubric || []).map((r) => ({ id: r.id, met: false })) });
  return <section className="knowledge-check free-response-check" aria-label="Written answer check">
    <div className="check-kicker"><span>Explain it in your own words</span>
      {!attempt && <span className="check-mode-pill">{assistedSoFar ? "Supported practice" : "Written response"}</span>}</div>
    {!attempt ? <form onSubmit={(event) => void submit(event)}>
      {!hideContext && check.context && <MarkdownView content={check.context} languageHint={language} />}
      <div id={`written-question-${check.id}`} className="check-question"><MarkdownView content={check.question} languageHint={language} /></div>
      <label htmlFor={`written-answer-${check.id}`}>Your answer</label>
      <textarea id={`written-answer-${check.id}`} aria-describedby={`written-question-${check.id}`} rows={4} maxLength={6000}
        value={draft.response} disabled={checking || isBusy} placeholder="A short explanation is enough."
        onChange={(event) => setDraft((d) => ({ ...d, response: event.target.value }))} />
      <fieldset className="placement-confidence"><legend>How sure are you? (optional)</legend>
        {([['unsure','Not sure'],['somewhat','Somewhat sure'],['confident','Confident']] as const).map(([value,label]) =>
          <label key={value}><input type="radio" name={`written-confidence-${check.id}`} checked={draft.confidence === value} disabled={checking || isBusy}
            onChange={() => setDraft((d) => ({ ...d, confidence: value }))} />{label}</label>)}
      </fieldset>
      <p className="written-grading-note">Feedback uses a rubric for this question. If the judgment is unclear, it won’t count toward readiness.</p>
      {error && <div className="continuation-error" role="alert"><p>{error}</p>
        <button type="button" className="check-coach-button" onClick={() => save(uncertain("No grade recorded. Let’s use a fresh case to check the idea."))}>Continue without a grade</button>
      </div>}
      <div className="check-submit-row">
        <button type="submit" className="dialog-primary-button" disabled={checking || isBusy || !draft.response.trim()}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}{checking ? "Checking your reasoning…" : "Check answer"}
        </button>
        <button type="button" className="check-coach-button" disabled={checking || isBusy} onClick={() => save(uncertain("We’ll work through one small example together."), true)}>I don’t know yet</button>
        {showCoachLink && <button type="button" className="check-coach-button" disabled={checking || isBusy} onClick={onAskCoach}>Ask a question first</button>}
      </div>
    </form> : <div ref={resultRef} tabIndex={-1} role="status" className={`check-feedback ${attempt.correct ? "is-correct" : "is-review"}`}>
      <h3>{attempt.grading?.status === "uncertain" ? "Let’s check this feedback" : attempt.correct ? "That reasoning fits" : "One distinction to work on"}</h3>
      <dl className="check-answer-lines"><div><dt>Your answer</dt><dd><p className="written-answer-text">{attempt.dontKnow ? "I don’t know yet" : attempt.response}</p></dd></div></dl>
      <MarkdownView content={attempt.grading?.feedback || "This answer needs a fresh check."} languageHint={language} />
      {attempt.assisted && <p className="written-grading-note">With support · a fresh independent case is still needed for readiness.</p>}
      <details className="written-rubric"><summary>Review the question and grading</summary>
        <MarkdownView content={check.question} languageHint={language} />
        <ul>{check.rubric?.map((r) => <li key={r.id}><span>{attempt.grading?.status === "uncertain" ? "Unresolved" : attempt.grading?.criteria.find((c) => c.id === r.id)?.met ? "Shown" : "Not shown yet"}</span>{r.criterion}</li>)}</ul>
        <MarkdownView content={check.expectedAnswer || check.explanation} languageHint={language} />
      </details>
      {attempt.grading?.reviewRequested ? <p className="written-grading-note">Marked for review. This result won’t count toward readiness. A fresh case can help check the idea.</p>
        : onDispute && <button type="button" className="check-coach-button" onClick={() => { onDispute(check); onAskCoach(); }}>This feedback missed something</button>}
      <p className="check-feedback-pause">Your answer is saved. Continue when you’re ready.</p>
      {onContinue && <button type="button" className="dialog-primary-button" disabled={isBusy || continuePending} onClick={onContinue}>{continuePending ? "Preparing…" : continueLabel}<ArrowRight size={14} /></button>}
    </div>}
  </section>;
};
