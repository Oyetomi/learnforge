import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckAttempt, LearningCheck } from "../../../types";
import { createLearningReference } from "../grounding";
import { evaluateQuestionReview, hasQuestionReview, questionReviewCachePrefix, questionReviewIdentity, questionReviewRequest, readQuestionReview, reviewQuestion, saveQuestionReview } from "../questionReview";
import { QuestionReviewStatus, ReviewedQuestionCard } from "../../../components/learning/ReviewedQuestionCard";
import { QuestionCard } from "../../../components/learning/QuestionCard";
import { learningEvidence } from "../checks";
import { retentionRating } from "../retention";
import { deleteTopicData } from "../topicDeletion";
import { approvedLessonIds } from "../adaptation";
import { formatConversationMessages } from "../../ai/prompts";
import { answerTutoringPrompt } from "../tutoring";
import { buildStudySheet, buildAnkiTsv } from "../studySheet";

const check: LearningCheck = { id: "sum", milestoneId: "lesson", question: "What is 2 + 2?", options: [{ id: "four", label: "4" }, { id: "five", label: "5" }], correctOptionIds: ["four"], explanation: "PRIVATE_AUTHOR_EXPLANATION", hint: "PRIVATE_AUTHOR_HINT", multiple: false };
const independent = { answerable: true, confidence: "high", correctOptionIds: ["four"], rubricValid: true, reasoning: "Two pairs make four." };
const attempt: CheckAttempt = { checkId: check.id, milestoneId: check.milestoneId, selectedIds: ["four"], correct: true, dontKnow: false, thinking: "Two pairs", confidence: "confident", submittedAt: 1 };
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k), key: (i: number) => [...stored.keys()][i] ?? null, get length() { return stored.size; } });
});
afterEach(() => vi.unstubAllGlobals());

describe("bounded question preflight", () => {
  it("withholds the author key, explanation and hints from an independently solved choice review", () => {
    const request = questionReviewRequest(check);
    const data = JSON.parse(request[1].content);
    expect(data.options).toEqual(check.options);
    expect(request[1].content).not.toContain("correctOptionIds");
    expect(request[1].content).not.toContain("PRIVATE_AUTHOR");
    expect(request[0].content).toContain("ALL defensible correct option IDs");
  });
  it("approves agreement but blocks the known wrong-key and ambiguous-single-select benchmark cases", () => {
    expect(evaluateQuestionReview(independent, check, "test")?.status).toBe("approved");
    expect(evaluateQuestionReview(independent, { ...check, correctOptionIds: ["five"] }, "test")?.status).toBe("revise");
    expect(evaluateQuestionReview({ ...independent, correctOptionIds: ["four", "five"] }, check, "test")?.status).toBe("revise");
    expect(evaluateQuestionReview({ ...independent, answerable: false }, check, "test")?.status).toBe("revise");
    expect(evaluateQuestionReview({ ...independent, confidence: "low" }, check, "test")?.status).toBe("revise");
  });
  it("requires exact multi-select agreement, rejecting unknown and duplicated reviewer IDs", () => {
    const multiple = { ...check, multiple: true, correctOptionIds: ["four", "five"] };
    expect(evaluateQuestionReview({ ...independent, correctOptionIds: ["five", "four"] }, multiple, "test")?.status).toBe("approved");
    expect(evaluateQuestionReview(independent, multiple, "test")?.status).toBe("revise");
    for (const ids of [["four", "four"], ["unknown"]]) expect(evaluateQuestionReview({ ...independent, correctOptionIds: ids }, check, "test")).toBeNull();
  });
  it("does not accept malformed review payloads or an invalid original question", () => {
    for (const value of [null, { correct: true }, { ...independent, confidence: "certain" }, { ...independent, reasoning: "" }, { ...independent, rubricValid: "true" }])
      expect(evaluateQuestionReview(value, check, "test")).toBeNull();
    expect(evaluateQuestionReview(independent, { ...check, correctOptionIds: ["missing"] }, "test")).toBeNull();
  });
  it("checks the expected answer and rubric for written work without turning it into a choice grade", () => {
    const written: LearningCheck = { ...check, kind: "free-response", options: [], correctOptionIds: [], expectedAnswer: "Four", rubric: [{ id: "sum", criterion: "Combines both pairs" }] };
    expect(questionReviewRequest(written)[1].content).toContain("Combines both pairs");
    expect(evaluateQuestionReview({ ...independent, correctOptionIds: [] }, written, "test")?.status).toBe("approved");
    expect(evaluateQuestionReview({ ...independent, correctOptionIds: [], rubricValid: false }, written, "test")?.status).toBe("revise");
  });
  it("binds cached approval to question, key, references, model settings and exact identity", () => {
    const identity = questionReviewIdentity(check);
    const review = evaluateQuestionReview(independent, check, "test")!;
    saveQuestionReview(identity, review);
    expect(readQuestionReview(identity)).toEqual(review);
    for (const changed of [{ ...check, question: "Different?" }, { ...check, correctOptionIds: ["five"] }, { ...check, context: "New context" }])
      expect(readQuestionReview(questionReviewIdentity(changed))).toBeNull();
    expect(readQuestionReview(questionReviewIdentity(check, [createLearningReference("Rules", "Different premise")!]))).toBeNull();
    const key = [...stored.keys()][0];
    stored.set(key, JSON.stringify({ identity: "other", review }));
    expect(readQuestionReview(identity)).toBeNull();
  });
  it("accepts a memory-backed receipt without relying on cache writes, and rejects stale receipts", () => {
    const reviewed = { ...attempt, questionReview: { identity: questionReviewIdentity(check), model: "test", reviewedAt: 1 } };
    expect(hasQuestionReview(check, reviewed)).toBe(true);
    expect(hasQuestionReview(check, attempt)).toBe(false);
    expect(hasQuestionReview({ ...check, explanation: "Changed" }, reviewed)).toBe(false);
    const privateAttempt = { ...reviewed, questionReview: { ...reviewed.questionReview, identity: "PRIVATE_CONNECTION_AND_CACHE_IDENTITY" } };
    expect(answerTutoringPrompt(check, privateAttempt)).not.toContain("PRIVATE_CONNECTION_AND_CACHE_IDENTITY");
    expect(formatConversationMessages([{ id: "answer", session_id: "s", role: "user", content: "My answer", check_attempt: privateAttempt, created_at: 1 }], "Tutor")[1].content).not.toContain("PRIVATE_CONNECTION_AND_CACHE_IDENTITY");
  });
  it("uses a single selected-model call, a bounded response, and no automatic fallback on failure", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(independent) } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect((await reviewQuestion(check, undefined, signal)).status).toBe("approved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1];
    const body = JSON.parse(String(init.body));
    expect(body.max_tokens).toBe(1400);
    expect(init.signal).toBe(signal);
    fetchMock.mockImplementation(async () => new Response("", { status: 503 }));
    await expect(reviewQuestion(check, undefined, signal)).rejects.toThrow("draft are saved");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects a malformed model response rather than approving or rewriting the question", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"correct":true}' } }] }))));
    const before = JSON.stringify(check);
    await expect(reviewQuestion(check, undefined, new AbortController().signal)).rejects.toThrow("incomplete");
    expect(JSON.stringify(check)).toBe(before);
  });
});

describe("question and dispute surfaces", () => {
  const handlers = { onSubmit: vi.fn(), onAskCoach: vi.fn(), onNewQuestion: vi.fn(), isBusy: false };
  it("keeps an unanswered question and its key out of the UI until review completes", () => {
    const html = renderToStaticMarkup(<ReviewedQuestionCard check={check} {...handlers} />);
    expect(html).toContain("Checking the question before you answer");
    expect(html).not.toContain(check.question);
    expect(html).not.toContain(check.explanation);
    expect(html).not.toContain('type="radio"');
  });
  it("offers clear recovery without displaying the reviewer solution", () => {
    const html = renderToStaticMarkup(<QuestionReviewStatus busy={false} needsRevision onRetry={vi.fn()} onReplace={vi.fn()} />);
    expect(html).toContain("You haven’t been graded");
    expect(html).toContain("Try a different question");
    expect(html).not.toContain(independent.reasoning);
  });
  it("renders an approved question and preserves existing submitted feedback without a new review", () => {
    saveQuestionReview(questionReviewIdentity(check), evaluateQuestionReview(independent, check, "test")!);
    expect(renderToStaticMarkup(<ReviewedQuestionCard check={check} {...handlers} />)).toContain("What is 2 + 2?");
    stored.clear();
    const html = renderToStaticMarkup(<ReviewedQuestionCard check={check} attempt={attempt} {...handlers} />);
    expect(html).toContain("Your answer");
    expect(html).not.toContain("Checking the question before");
  });
  it("supports choice disputes without reasserting the disputed key or explanation", () => {
    const html = renderToStaticMarkup(<QuestionCard check={check} attempt={{ ...attempt, correct: false, grading: { status: "uncertain", reviewRequested: true, feedback: "Review", criteria: [] } }} onDispute={vi.fn()} {...handlers} />);
    expect(html).toContain("Let’s review this feedback");
    expect(html).toContain("won’t count toward readiness");
    expect(html).not.toContain("Correct answer");
    expect(html).not.toContain(check.explanation);
    expect(html).not.toContain("is-right");
  });
  it("durably revokes disputed choice credit and invalidates old readiness", async () => {
    const { LocalDatabase } = await import("../../db/storage");
    const db = new LocalDatabase();
    const session = db.createSession({ title: "Sums", topic: "Combining", language: null });
    db.addMessage({ session_id: session.id, role: "user", content: "Saved answer", check_attempt: attempt });
    db.addMessage({ session_id: session.id, role: "user", content: "A fresh case", check_attempt: { ...attempt, checkId: "fresh", submittedAt: 2 } });
    db.addMessage({ session_id: session.id, role: "assistant", content: "Ready", competency_assessment: { milestoneId: check.milestoneId, decision: "ready", rationale: "Two independent applications", evidenceCheckIds: [check.id, "fresh"], createdAt: 3 } });
    expect(learningEvidence(db.getMessages(session.id), check.milestoneId).independentCorrect).toBe(2);
    expect(approvedLessonIds(db.getMessages(session.id)).has(check.milestoneId)).toBe(true);
    expect(db.disputeCheckAttempt(session.id, check.id)).toBe(true);
    expect(db.disputeCheckAttempt(session.id, check.id)).toBe(false);
    const restored = new LocalDatabase().getMessages(session.id);
    expect(restored[0].check_attempt?.selectedIds).toEqual(["four"]);
    expect(learningEvidence(restored, check.milestoneId).independentCorrect).toBe(1);
    expect(approvedLessonIds(restored).has(check.milestoneId)).toBe(false);
    const exportedMessages = [{ id: "question", session_id: session.id, role: "assistant" as const, content: "", learning_check: check, created_at: 0 }, restored[0]];
    const sheet = buildStudySheet([], exportedMessages);
    expect(sheet.verifiedChecks).toEqual([]);
    expect(sheet.repairedMistakes).toEqual([]);
    expect(buildAnkiTsv("Sums", [], exportedMessages)).not.toContain(check.explanation);
    expect(retentionRating(check, { ...attempt, dontKnow: true, grading: { status: "uncertain", reviewRequested: true, feedback: "Review", criteria: [] } })).toBeNull();
  });
  it("deletes even unsubmitted preflight caches with their topic, preserving another topic", async () => {
    const { LocalDatabase } = await import("../../db/storage");
    const db = new LocalDatabase();
    const session = db.createSession({ title: "Sums", topic: "Combining", track_id: "sums", language: null });
    const milestone = db.createMilestone({ session_id: session.id, title: "Sums", prompt: "Learn", starter_code: "", status: "active" });
    const identity = questionReviewIdentity({ ...check, milestoneId: milestone.id });
    const other = questionReviewIdentity({ ...check, milestoneId: "other" });
    const review = evaluateQuestionReview(independent, check, "test")!;
    saveQuestionReview(identity, review); saveQuestionReview(other, review);
    expect([...stored.keys()].some(key => key.startsWith(questionReviewCachePrefix(milestone.id)))).toBe(true);
    deleteTopicData(db, { id: "sums", title: "Sums" });
    expect(readQuestionReview(identity)).toBeNull();
    expect(readQuestionReview(other)).toEqual(review);
  });
});
