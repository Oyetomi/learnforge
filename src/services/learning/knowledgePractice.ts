import type { CheckAttempt, LearningCheck, LearningReference, LearningPractice } from "../../types";
import { aiJsonRequest, loadAIConnection, recordUsage } from "../ai/connection";
import { gradeLearningCheck, validateLearningCheck } from "./checks";
import { isAcceptedFreeResponseGrade } from "./freeResponse";
import { hasQuestionReview, questionSnapshot } from "./questionReview";
import { createLearningReference, GROUNDING_INSTRUCTIONS, referenceContext } from "./grounding";
import { answerTutoringPrompt } from "./tutoring";
import { MATH_INSTRUCTIONS, TABLE_INSTRUCTIONS, ILLUSTRATION_INSTRUCTIONS } from "./visualContract";
import { parseChatJson, StructuredResponseError } from "../ai/structuredResponse";
import { practicePrefix, validKnowledgeGraph, type KnowledgeGraph } from "./knowledgeGraph";
export interface PracticeRound {
    id: string;
    targetId: string;
    check: LearningCheck;
    attempt?: CheckAttempt;
    feedback?: string;
}
export interface KnowledgePractice {
    version: 1;
    id: string;
    trackId: string;
    title: string;
    material: KnowledgeGraph;
    targetIds: string[];
    rounds: PracticeRound[];
    status: "active" | "completed";
    createdAt: number;
    updatedAt: number;
}
export function practiceReferences(graph: KnowledgeGraph, targetIds: string[]): LearningReference[] {
    const ids = new Set(graph.propositions.filter(p => targetIds.includes(p.id)).flatMap(p => p.anchors.map(a => a.sourceId)));
    return graph.sources.filter(s => ids.has(s.id)).map(s => createLearningReference(s.title, s.text)!).filter(Boolean);
}
export function startKnowledgePractice(graph: KnowledgeGraph, title: string, targetIds: string[], now = Date.now()): KnowledgePractice {
    const valid = [...new Set(targetIds)].filter(id => graph.propositions.some(p => p.id === id));
    if (!valid.length || valid.length > 3 || valid.length !== targetIds.length)
        throw new Error("Choose one to three ideas from this topic.");
    return { version: 1, id: crypto.randomUUID(), trackId: graph.trackId, title, material: structuredClone(graph), targetIds: valid, rounds: [], status: "active", createdAt: now, updatedAt: now };
}
export function practiceOutcome(round: PracticeRound, references: LearningReference[]): "unanswered" | "unresolved" | "supported" | "independent" | "needs-work" {
    const a = round.attempt;
    if (!a)
        return "unanswered";
    if (a.grading?.reviewRequested || a.grading?.status === "uncertain" || !receiptMatches(round.check, a, references))
        return "unresolved";
    const correct = !a.dontKnow && (round.check.kind === "free-response" ? !!a.response?.trim() && isAcceptedFreeResponseGrade(round.check, a.grading) : gradeLearningCheck(round.check, a.selectedIds, a.dontKnow));
    if (!correct)
        return "needs-work";
    return a.assisted || a.practice === "guided" || round.check.practice === "guided" || a.confidence === "unsure" || (a.retriedOptionIds?.length || 0) > 0 || (a.visualSupportIds?.length || 0) > 0 ? "supported" : "independent";
}
function receiptMatches(check: LearningCheck, attempt: CheckAttempt, references: LearningReference[]) {
    try {
        const receipt = attempt.questionReview;
        if (!receipt?.model || !Number.isFinite(receipt.reviewedAt))
            return false;
        const identity = JSON.parse(receipt.identity);
        return identity[0] === 1 && identity[1] === check.id && identity[2] === check.milestoneId && identity[3] === questionSnapshot(check) && identity[4] === referenceContext(references, check.question);
    }
    catch {
        return false;
    }
}
export function outcomeFor(session: KnowledgePractice, round: PracticeRound) {
    return practiceOutcome(round, practiceReferences(session.material, [round.targetId]));
}
export function saveKnowledgePractice(session: KnowledgePractice) {
    localStorage.setItem(practicePrefix(session.trackId) + session.id, JSON.stringify(session));
}
export function loadKnowledgePractices(trackId: string): KnowledgePractice[] {
    const results: KnowledgePractice[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(practicePrefix(trackId)))
                continue;
            try {
                const v = JSON.parse(localStorage.getItem(key) || "null") as KnowledgePractice;
                if (v?.version === 1 && v.trackId === trackId && typeof v.id === "string" && key === practicePrefix(trackId) + v.id && typeof v.title === "string" && Number.isFinite(v.createdAt) && Number.isFinite(v.updatedAt) && ["active", "completed"].includes(v.status) && Array.isArray(v.targetIds) && v.targetIds.length > 0 && v.targetIds.length <= 3 && new Set(v.targetIds).size === v.targetIds.length && Array.isArray(v.rounds) && v.rounds.length <= 12 && new Set(v.rounds.map(r => r?.id)).size === v.rounds.length && validKnowledgeGraph(v.material, trackId) && v.targetIds.every(id => typeof id === "string" && v.material.propositions.some(p => p.id === id)) && v.rounds.every(r => r && typeof r.id === "string" && validateLearningCheck(r.check) && v.targetIds.includes(r.targetId) && (!r.feedback || typeof r.feedback === "string") && (!r.attempt || validStoredAttempt(r.attempt, r.check))))
                    results.push(v);
            }
            catch { /* Skip a corrupt record without overwriting it. */ }
        }
    }
    catch { /* Storage unavailable: UI exposes save failures. */ }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
}
function validStoredAttempt(a: CheckAttempt, check: LearningCheck): boolean {
    return a.checkId === check.id && a.milestoneId === check.milestoneId && Array.isArray(a.selectedIds) && a.selectedIds.every(id => typeof id === "string") && typeof a.dontKnow === "boolean" && typeof a.thinking === "string" && Number.isFinite(a.submittedAt) && (a.response === undefined || typeof a.response === "string") && [undefined, null, "unsure", "somewhat", "confident"].includes(a.confidence) && [a.retriedOptionIds, a.visualSupportIds].every(ids => ids === undefined || Array.isArray(ids) && ids.every(id => typeof id === "string")) && (!a.grading || ["correct", "needs-work", "uncertain"].includes(a.grading.status) && typeof a.grading.feedback === "string" && Array.isArray(a.grading.criteria) && a.grading.criteria.every(c => c && typeof c.id === "string" && typeof c.met === "boolean"));
}
export function recordPracticeAttempt(session: KnowledgePractice, roundId: string, attempt: CheckAttempt): KnowledgePractice {
    const round = session.rounds.find(r => r.id === roundId);
    if (!round || round.attempt || round.check.id !== attempt.checkId || round.check.milestoneId !== attempt.milestoneId || !hasQuestionReview(round.check, attempt, practiceReferences(session.material, [round.targetId])))
        return session;
    const correct = !attempt.dontKnow && (round.check.kind === "free-response" ? !!attempt.response?.trim() && isAcceptedFreeResponseGrade(round.check, attempt.grading) : gradeLearningCheck(round.check, attempt.selectedIds, attempt.dontKnow));
    return { ...session, updatedAt: Date.now(), rounds: session.rounds.map(r => r.id === roundId ? { ...r, attempt: { ...attempt, correct, practice: round.check.practice } } : r) };
}
export function disputePracticeAttempt(session: KnowledgePractice, roundId: string): KnowledgePractice {
    return { ...session, updatedAt: Date.now(), rounds: session.rounds.map(r => r.id === roundId && r.attempt ? { ...r, feedback: undefined, attempt: { ...r.attempt, correct: false, grading: { status: "uncertain", feedback: "The learner requested a review of this feedback.", criteria: r.attempt.grading?.criteria || [], reviewRequested: true } } } : r) };
}
export function practiceRecommendations(graph: KnowledgeGraph, sessions: KnowledgePractice[]): string[] {
    return graph.propositions.map(p => {
        const attempts = sessions.filter(s => s.trackId === graph.trackId).flatMap(s => s.rounds.filter(r => r.targetId === p.id && r.attempt).map(r => ({ at: r.attempt!.submittedAt, outcome: outcomeFor(s, r) }))).sort((a, b) => b.at - a.at);
        const last = attempts[0];
        return { id: p.id, priority: !last ? 1 : last.outcome === "needs-work" || last.outcome === "unresolved" ? 0 : last.outcome === "supported" ? 2 : 3, at: last?.at || 0 };
    }).sort((a, b) => a.priority - b.priority || a.at - b.at).slice(0, 3).map(p => p.id);
}
async function practiceRequest(messages: {
    role: string;
    content: string;
}[], signal: AbortSignal, allowedFences = ["json"]): Promise<unknown> {
    const response = await aiJsonRequest({ model: loadAIConnection().model, temperature: .3, max_tokens: 3000, response_format: { type: "json_object" }, messages }, { signal });
    if (!response.ok)
        throw new Error("The tutor couldn’t prepare this step. Your saved answer is unchanged.");
    let envelope: unknown;
    try { envelope = await response.json(); }
    catch { throw new StructuredResponseError("malformed"); }
    recordUsage((envelope as { usage?: Parameters<typeof recordUsage>[0] })?.usage);
    return parseChatJson(envelope, allowedFences);
}
const PRACTICE_QUESTION_CONTRACT = `QUESTION JSON CONTRACT:
Return one JSON object, with no surrounding prose or outer code fence. Choose either:
- Written response: {"kind":"free-response","question":"one clear application","expectedAnswer":"a defensible answer","explanation":"why it fits","rubric":[{"id":"meaning","criterion":"one concrete distinction that accepts equivalent correct reasoning"}]}. Commit 1–5 independently checkable criteria; omit options and correctOptionIds. Never assess spoken pronunciation from typed text.
- Choice: {"kind":"choice","question":"one clear application","options":[{"id":"a","label":"an answer"},{"id":"b","label":"another answer"}],"correctOptionIds":["exact correct id"],"multiple":false,"explanation":"why the committed key fits"}. Supply 2–6 balanced options, unique ids, and all defensible correct ids. Set multiple true only for a multi-select question.
An optional context string can contain necessary evidence or code. Keep the answer, explanation and rubric in their committed fields, not the question or context. Use natural wording and equivalent reasoning. Escape newlines, quotes and LaTeX backslashes inside JSON strings. Do not emit a forge-check wrapper.`;

export async function generatePracticeRound(session: KnowledgePractice, targetId: string, practice: LearningPractice, signal: AbortSignal): Promise<PracticeRound> {
    const target = session.material.propositions.find(p => p.id === targetId);
    if (!target || !session.targetIds.includes(targetId) || session.rounds.length >= 12)
        throw new Error("This practice run has reached its limit. Finish it to review your work.");
    const prior = session.rounds.filter(r => r.targetId === targetId).map(r => ({ question: r.check.question, response: r.attempt?.response, selectedAnswers: r.check.options.filter(o => r.attempt?.selectedIds.includes(o.id)).map(o => o.label), thinking: r.attempt?.thinking, outcome: r.attempt ? outcomeFor(session, r) : "unanswered" }));
    const value = await practiceRequest([{ role: "system", content: `Create ONE fresh practice question for the selected idea, in the original subject and language. Never introduce unrelated prerequisites or turn a nontechnical subject into programming. Do not repeat a previous question. ${practice === "guided" ? "Give a smaller observable example with one useful initial cue, then ask ONE remaining decision. Do not solve that remaining decision." : practice === "transfer" ? "Change a relevant condition so applying the same principle requires reasoning, not just replacing names or numbers. Do not teach the answer before asking." : "Ask a concrete unaided application at the same difficulty as the material. Do not disclose the answer in the introduction."} Prefer a short written explanation unless answer choices suit the task better. ${PRACTICE_QUESTION_CONTRACT} ${MATH_INSTRUCTIONS} ${TABLE_INSTRUCTIONS} ${GROUNDING_INSTRUCTIONS} Return only the check JSON object; do not emit a lesson, readiness assessment, roadmap update or mastery label. Use balanced answer choices if present.` }, { role: "user", content: JSON.stringify({ topic: session.title, idea: target.statement, sourceExcerpts: referenceContext(practiceReferences(session.material, [targetId]), target.statement), previousWork: prior }) }], signal, ["json", "forge-check"]);
    const spec = validateLearningCheck(value);
    if (!spec || prior.some(p => p.question.trim() === spec.question.trim()))
        throw new Error("A fresh, answerable question wasn’t ready. Try again.");
    const id = crypto.randomUUID();
    return { id, targetId, check: { ...spec, id: `practice:${session.id}:${id}`, milestoneId: `practice:${session.id}:${targetId}`, practice } };
}
export async function generatePracticeExplanation(session: KnowledgePractice, round: PracticeRound, signal: AbortSignal): Promise<string> {
    if (!round.attempt)
        throw new Error("Answer the question before asking for feedback.");
    const result = await practiceRequest([{ role: "system", content: `${answerTutoringPrompt(round.check, round.attempt)} ${GROUNDING_INSTRUCTIONS} Return JSON {"explanation":"Markdown tutoring in 2–3 concise sections"}.` }, { role: "user", content: referenceContext(practiceReferences(session.material, [round.targetId]), round.check.question) }], signal) as {
        explanation?: unknown;
    };
    if (typeof result?.explanation !== "string" || result.explanation.trim().length < 40 || result.explanation.length > 12000)
        throw new Error("A useful explanation wasn’t ready. Your answer is saved; try again.");
    return result.explanation.trim();
}
export async function generatePracticeHelp(session: KnowledgePractice, round: PracticeRound, kind: "hint" | "visual" | "walkthrough", signal: AbortSignal): Promise<string> {
    const { correctOptionIds, expectedAnswer, explanation, rubric, hint, ...question } = round.check;
    const result = await practiceRequest([{ role: "system", content: `Help with ONE pending practice question without changing it, submitting an answer or revealing its committed answer. ${kind === "hint" ? "Offer one short concrete hint, without giving the final decision." : kind === "walkthrough" ? "Work through a smaller analogous case, explain its causal steps, and leave the pending question for the learner." : `Use a meaningful visual representation of the idea. ${ILLUSTRATION_INSTRUCTIONS} Prefer a small labelled SVG or typeset relationship over decorative boxes. Explain what to notice. Never claim a static illustration is interactive.`} ${MATH_INSTRUCTIONS} ${TABLE_INSTRUCTIONS} ${GROUNDING_INSTRUCTIONS} Return JSON {"help":"Markdown explanation"}.` }, { role: "user", content: JSON.stringify({ question, sourceExcerpts: referenceContext(practiceReferences(session.material, [round.targetId]), round.check.question) }) }], signal) as {
        help?: unknown;
    };
    if (typeof result?.help !== "string" || result.help.trim().length < 12 || result.help.length > 14000)
        throw new Error("This explanation wasn’t ready. Try again or return to your question.");
    return result.help;
}
