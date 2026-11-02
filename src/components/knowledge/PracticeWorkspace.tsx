import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import type { CheckAttempt, LearningCheck, LearningPractice } from "../../types";
import { useQuestionReview, ReviewedQuestionCard } from "../learning/ReviewedQuestionCard";
import { MarkdownView } from "../chat/MarkdownView";
import { recordVisualSupport, visualSupportFor } from "../../services/learning/preferences";
import { disputePracticeAttempt, generatePracticeExplanation, generatePracticeHelp, generatePracticeRound, outcomeFor, practiceReferences, recordPracticeAttempt, saveKnowledgePractice, type KnowledgePractice, type PracticeRound } from "../../services/learning/knowledgePractice";
export const OUTCOME_LABELS = { unanswered: "Not answered", unresolved: "Needs review", supported: "Correct with support", independent: "Unaided correct", 'needs-work': "Needs more practice" };
export function PracticeWorkspace({ initial, onBack, onSaved }: {
    initial: KnowledgePractice;
    onBack: () => void;
    onSaved: () => void;
}) {
    const [session, setSession] = useState(initial), [busy, setBusy] = useState(""), [error, setError] = useState(""), [unsaved, setUnsaved] = useState(false);
    const [failedPreparation, setFailedPreparation] = useState<{targetId:string;practice:LearningPractice}|null>(null);
    const errorPanel = useRef<HTMLDivElement>(null);
    const [help, setHelp] = useState<{
        title: string;
        text: string;
    } | null>(null);
    const request = useRef<AbortController | null>(null), alive = useRef(true), heading = useRef<HTMLHeadingElement>(null), helpHeading = useRef<HTMLHeadingElement>(null), helpTrigger = useRef<HTMLElement | null>(null);
    const round = session.rounds.at(-1);
    const references = round ? practiceReferences(session.material, [round.targetId]) : [];
    const reviewState = useQuestionReview(round?.check || null, references, session.status === "active" && !round?.attempt);
    const reviewReady = reviewState.review?.status === "approved";
    useEffect(() => { alive.current = true; heading.current?.focus(); return () => { alive.current = false; request.current?.abort(); }; }, []);
    useEffect(() => { if (help)
        helpHeading.current?.focus({ preventScroll: true }); }, [help]);
    useEffect(() => { if (error) { errorPanel.current?.focus({preventScroll:true}); errorPanel.current?.scrollIntoView({block:"nearest"}); } }, [error]);
    const closeHelp = () => { setHelp(null); requestAnimationFrame(() => helpTrigger.current?.focus({ preventScroll: true })); };
    useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape" && help) {
        e.preventDefault();
        closeHelp();
    } }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [help]);
    const commit = (next: KnowledgePractice) => {
        setSession(next);
        try {
            saveKnowledgePractice(next);
            setUnsaved(false);
            onSaved();
            return true;
        }
        catch {
            setUnsaved(true);
            setError("This practice run could not be saved. Your current answer remains here. Free some storage, then Save again before continuing.");
            return false;
        }
    };
    const perform = async <T,>(label: string, action: (signal: AbortSignal) => Promise<T>, done: (result: T) => void, onFailure?: () => void) => {
        if (request.current)
            return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(label);
        setError("");
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const result = await action(controller.signal);
            if (alive.current && !controller.signal.aborted)
                done(result);
        }
        catch (e) {
            if (alive.current) {
                setError(controller.signal.aborted ? "Preparation paused. Your saved question and answer are unchanged." : e instanceof Error ? e.message : "The tutor could not finish this step. Try again.");
                onFailure?.();
            }
        }
        finally {
            clearTimeout(timeout);
            if (request.current === controller) {
                request.current = null;
                if (alive.current)
                    setBusy("");
            }
        }
    };
    const explain = (next: KnowledgePractice, r: PracticeRound) => void perform("explanation", signal => generatePracticeExplanation(next, r, signal), feedback => commit({ ...next, updatedAt: Date.now(), rounds: next.rounds.map(x => x.id === r.id ? { ...x, feedback } : x) }));
    const prepare = (targetId: string, practice: LearningPractice = "independent") => {
        if (request.current || unsaved || session.status!=="active") return;
        setFailedPreparation(null);
        void perform("question", signal => generatePracticeRound(session, targetId, practice, signal), next => {
            if (commit({ ...session, updatedAt: Date.now(), rounds: [...session.rounds, next] })) {
                setHelp(null);
                requestAnimationFrame(() => heading.current?.scrollIntoView({ block: "start" }));
            }
        }, () => setFailedPreparation({targetId,practice}));
    };
    const record = (check: LearningCheck, attempt: CheckAttempt) => {
        if (!round || unsaved)
            return;
        const support = visualSupportFor(check.id);
        const next = recordPracticeAttempt(session, round.id, { ...attempt, assisted: attempt.assisted || support.length > 0, visualSupportIds: support });
        if (next === session)
            return;
        if (commit(next))
            explain(next, next.rounds.at(-1)!);
    };
    const dispute = (id: string) => { request.current?.abort(); commit(disputePracticeAttempt(session, id)); };
    const askHelp = (kind: "hint" | "walkthrough" | "visual") => {
        if (!round || round.attempt || unsaved)
            return;
        helpTrigger.current = document.activeElement as HTMLElement;
        recordVisualSupport(round.check.id, `knowledge-practice:${kind}`);
        void perform("help", signal => generatePracticeHelp(session, round, kind, signal), text => setHelp({ title: kind === "hint" ? "A small hint" : kind === "visual" ? "Visual explanation" : "A smaller worked example", text }));
    };
    const attempted = new Set(session.rounds.filter(r => r.attempt && r.check.practice !== "guided").map(r => r.targetId));
    const nextTarget = session.targetIds.find(id => !attempted.has(id));
    const currentIdea = round && session.material.propositions.find(p => p.id === round.targetId);
    const finish = () => { request.current?.abort(); setFailedPreparation(null); setError(""); commit({ ...session, status: "completed", updatedAt: Date.now() }); setHelp(null); };
    return <section className="knowledge-practice" aria-label="Practice workspace">
    <header className="knowledge-practice-heading"><div><span className="knowledge-eyebrow">Saved practice · {session.title}</span><h1 ref={heading} tabIndex={-1}>{session.status === "completed" ? "Your practice review" : "Try the idea in a fresh situation"}</h1><p>{attempted.size} of {session.targetIds.length} selected ideas tried · help is always available</p></div><div className="knowledge-actions"><button className="check-coach-button" disabled={unsaved} onClick={onBack}><ArrowLeft size={14}/> Back to knowledge</button>{session.status === "active" && <button className="check-coach-button" disabled={unsaved} onClick={finish}>End run and review</button>}</div></header>
    <p className="knowledge-note">Practice results stay separate from curriculum readiness. A correct answer or a map node is not proof of mastery.</p>
    {error && <div ref={errorPanel} tabIndex={-1} className="continuation-error knowledge-recovery" role="alert">{failedPreparation&&<h2>Question preparation paused</h2>}<p>{error}</p>{failedPreparation&&!unsaved&&<button className="dialog-primary-button" disabled={!!busy} onClick={()=>prepare(failedPreparation.targetId,failedPreparation.practice)}>Retry question</button>}{unsaved && <button onClick={() => commit(session)} className="dialog-secondary-button">Save again</button>}</div>}
    {busy && <div className="knowledge-busy" role="status"><Loader2 size={15} className="animate-spin"/> {busy === "question" ? "Preparing one fresh question…" : busy === "help" ? "Preparing your explanation…" : "Your answer is saved. Preparing tutoring…"}<button className="check-coach-button" onClick={() => request.current?.abort()}>Cancel preparation</button></div>}
    {session.status === "completed" ? <div className="knowledge-run-summary"><h2>What happened</h2>{session.targetIds.map(id => {
                const idea = session.material.propositions.find(p => p.id === id)!;
                const rounds = session.rounds.filter(r => r.targetId === id);
                return <article key={id}><h3>{idea.statement}</h3>{rounds.length ? rounds.map(r => <details key={r.id}><summary>{OUTCOME_LABELS[outcomeFor(session, r)]} · {new Date(r.attempt?.submittedAt || session.createdAt).toLocaleDateString()}</summary>{r.attempt ? <ReviewedQuestionCard check={r.check} attempt={r.attempt} references={practiceReferences(session.material, [r.targetId])} isBusy={false} onSubmit={() => { }} onAskCoach={() => { }} onNewQuestion={() => { }} onDispute={r.attempt ? () => dispute(r.id) : undefined} showActions={false} showCoachLink={false}/> : <p>Question saved without an answer.</p>}{r.feedback && <MarkdownView content={r.feedback} compactFigures/>}</details>) : <p>Not tried in this run.</p>}</article>;
            })}</div> : <>
      {!round && !busy && !failedPreparation && <section className="knowledge-start"><h2>A short practice run</h2><p>One fresh application for each selected idea. After a miss, you can work through a smaller example. Finish whenever you need to; your work stays saved.</p><button className="dialog-primary-button" disabled={unsaved} onClick={() => prepare(session.targetIds[0])}>Start first question</button></section>}
      {round && <div className={`knowledge-practice-body ${help ? "has-help" : ""}`}><div>
        <p className="knowledge-target">{round.attempt ? currentIdea?.statement : `Selected idea ${session.targetIds.indexOf(round.targetId) + 1} · apply it without reopening the source`}</p>
        <ReviewedQuestionCard key={round.check.id} check={round.check} attempt={round.attempt} references={references} reviewState={reviewState} isBusy={!!busy || unsaved} onSubmit={record} onAskCoach={() => askHelp("hint")} onNewQuestion={() => prepare(round.targetId, round.check.practice)} showCoachLink={false} onDispute={() => dispute(round.id)} onReturn={onBack} feedbackTeaching={round.attempt ? <section className="knowledge-tutoring" aria-label="Tutoring for your answer">{round.feedback ? <MarkdownView content={round.feedback} compactFigures/> : <><p>{busy === "explanation" ? "Your response stays saved while the explanation is prepared." : "Review the answer, then work through why it fits."}</p>{!busy && <button className="dialog-secondary-button" disabled={unsaved} onClick={() => explain(session, round)}>Explain this answer</button>}</>}</section> : undefined} onContinue={() => { if (round.check.practice === "guided")
                prepare(round.targetId, "independent");
            else if (nextTarget)
                prepare(nextTarget);
            else
                finish(); }} continueLabel={round.check.practice === "guided" ? "Try without the cue" : nextTarget ? "Next idea" : "Finish and review"}/>
        {!round.attempt && <div className="knowledge-actions"><button className="check-coach-button" disabled={!!busy || unsaved || !reviewReady} onClick={() => askHelp("hint")}>Hint</button><button className="check-coach-button" disabled={!!busy || unsaved || !reviewReady} onClick={() => askHelp("walkthrough")}>Worked example</button><button className="check-coach-button" disabled={!!busy || unsaved || !reviewReady} onClick={() => askHelp("visual")}>Visual</button><button className="check-coach-button" disabled={!!busy || unsaved || !reviewReady} onClick={() => { recordVisualSupport(round.check.id, "knowledge-practice:source"); setHelp({ title: "Saved source material", text: currentIdea?.anchors.map(a => `> ${a.quote}\n\n— ${session.material.sources.find(s => s.id === a.sourceId)?.title}`).join("\n\n") || "" }); }}>Read source (uses support)</button></div>}
        {round.attempt && outcomeFor(session, round) !== "independent" && session.rounds.length < 12 && <button className="dialog-secondary-button" disabled={!!busy || unsaved} onClick={() => prepare(round.targetId, "guided")}>Work through a smaller case</button>}
        {round.attempt && round.feedback && session.rounds.length < 12 && <button className="check-coach-button" disabled={!!busy || unsaved} onClick={() => prepare(round.targetId, "transfer")}>Try a changed situation</button>}
        {session.rounds.length >= 12 && <p>This run has reached 12 questions. End the run to review your work; you can start another later.</p>}
      </div>{help && <aside className="knowledge-help" aria-label="Practice help"><header><h2 ref={helpHeading} tabIndex={-1}>{help.title}</h2><button className="icon-button" onClick={closeHelp} aria-label="Close practice help"><X size={17}/></button></header><p className="knowledge-note">This question now counts as supported practice.</p><MarkdownView content={help.text} compactFigures/></aside>}</div>}
    </>}
    {session.status === "active" && session.rounds.length > 1 && <section className="knowledge-earlier" aria-label="Earlier answers in this run"><h2>Earlier answers</h2><p className="knowledge-note">Reviewing earlier tutoring counts as support for the current question.</p>{session.rounds.slice(0, -1).map(r => <details key={r.id} onToggle={e => { if (e.currentTarget.open && round && !round.attempt)
        recordVisualSupport(round.check.id, "knowledge-practice:earlier-answer"); }}><summary>{OUTCOME_LABELS[outcomeFor(session, r)]} · {r.check.question}</summary>{r.attempt ? <ReviewedQuestionCard check={r.check} attempt={r.attempt} references={practiceReferences(session.material, [r.targetId])} isBusy={false} onSubmit={() => { }} onAskCoach={() => { }} onNewQuestion={() => { }} onDispute={() => dispute(r.id)} showActions={false} showCoachLink={false}/> : <p>Question saved without an answer.</p>}{r.feedback && <MarkdownView content={r.feedback} compactFigures/>}</details>)}</section>}
  </section>;
}
