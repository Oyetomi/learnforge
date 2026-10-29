import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, CheckAttempt, LearningCheck } from "../../../types";
import { answerTutoring, answerTutoringPrompt, readTutoringPosition, saveTutoringPosition, tutoringAttemptKey, tutoringReadingKey } from "../tutoring";
import { formatConversationMessages } from "../../ai/prompts";
import { learningEvidence } from "../checks";
import { AnswerTutoring } from "../../../components/learning/AnswerTutoring";
import { QuestionCard } from "../../../components/learning/QuestionCard";

const check: LearningCheck = { id: "q", milestoneId: "m", question: "Which greeting fits this situation?", options: [
  { id: "a", label: "A morning greeting" }, { id: "b", label: "An evening greeting" }], correctOptionIds: ["a"], multiple: false, explanation: "This encounter happens in the morning." };
const attempt: CheckAttempt = { checkId: "q", milestoneId: "m", selectedIds: ["a"], dontKnow: false, correct: true, thinking: "", confidence: "confident", submittedAt: 1 };
const teaching: ChatMessage = { id: "t", session_id: "s", milestone_id: "m", role: "assistant", tutoring_for_check_id: "q", content: "### Why it fits\n\nThe time of day helps you choose.\n\n### An example\n\nYou meet a friend before breakfast.\n\n### Carry it forward\n\nMatch the greeting to the time.", created_at: 3 };
const handlers = { onRetry: vi.fn(), onContinue: vi.fn() };
afterEach(() => vi.unstubAllGlobals());

describe("post-answer teaching", () => {
  it("associates only completed teaching with the exact submitted question, and adds no mastery evidence", () => {
    const history: ChatMessage[] = [
      { ...teaching, id: "request", role: "user", internal: true },
      { ...teaching, id: "stopped", generation_error: true },
      { ...teaching, id: "other", tutoring_for_check_id: "other" },
    ];
    expect(answerTutoring(history, "q")).toBeUndefined();
    expect(answerTutoring([...history, teaching], "q")).toBe(teaching);
    expect(learningEvidence([...history, teaching], "m").independentCorrect).toBe(0);
  });
  it("preserves teaching association through serialization and does not auto-generate on restoration", () => {
    const restored = JSON.parse(JSON.stringify([teaching]));
    const html = renderToStaticMarkup(<AnswerTutoring check={check} teaching={answerTutoring(restored, "q")} loading={false} failed={false} busy={false} {...handlers} />);
    expect(html).toContain("The time of day helps you choose");
    expect(html).toContain("Part 1 of 3");
    expect(html).toContain("Read together");
    expect(html).not.toContain("You meet a friend before breakfast");
    expect(handlers.onRetry).not.toHaveBeenCalled();
    expect(handlers.onContinue).not.toHaveBeenCalled();
  });
  it("keeps the selected answer and a useful committed explanation visible during automatic tutoring", () => {
    const html = renderToStaticMarkup(<QuestionCard check={check} attempt={attempt} isBusy={false} onSubmit={vi.fn()} onAskCoach={vi.fn()} onNewQuestion={vi.fn()} showActions={false}
      feedbackTeaching={<AnswerTutoring check={check} loading failed={false} busy {...handlers} />} />);
    expect(html).toContain("Your answer");
    expect(html).toContain("A morning greeting");
    expect(html).toContain("This encounter happens in the morning");
    expect(html).toContain("Your tutor is preparing a worked explanation");
    expect(html).not.toContain("Another question");
  });
  it("offers recovery after failed tutoring instead of losing the answer or proceeding", () => {
    const html = renderToStaticMarkup(<AnswerTutoring check={check} loading={false} failed busy={false} {...handlers} />);
    expect(html).toContain("Retry tutoring");
    expect(html).toContain("Your answer is saved");
    expect(html).not.toContain("Practise with a fresh case");
  });
  it("teaches from correct, wrong and unresolved attempts without issuing a new assessment", () => {
    expect(answerTutoringPrompt(check, attempt)).toContain("A correct selection alone does not tell you their reasoning");
    expect(answerTutoringPrompt(check, { ...attempt, correct: false })).toContain("Make the next example simpler");
    expect(answerTutoringPrompt(check, { ...attempt, correct: false, grading: { status: "uncertain", feedback: "Unclear", criteria: [] } })).toContain("Do not call this answer wrong");
    expect(answerTutoringPrompt(check, { ...attempt, dontKnow: true })).toContain("Do not invent a misconception");
    expect(answerTutoringPrompt(check, attempt)).toContain("Do not emit forge-check");
    expect(answerTutoringPrompt(check, attempt)).toContain("never force code or a particular programming language");
  });
  it("shows even a short saved teaching response rather than treating it as a new question", () => {
    const html = renderToStaticMarkup(<AnswerTutoring check={check} teaching={{ ...teaching, content: "A greeting changes with the time of day. For example, breakfast is a morning encounter." }} loading={false} failed={false} busy={false} {...handlers} />);
    expect(html).toContain("breakfast is a morning encounter");
    expect(html).toContain("Practise with a fresh case");
  });
  it("keeps a whole worked example together and allows continuous reading without serial Next clicks", () => {
    const example = { ...teaching, content: "### Worked example\n\nPass a buffer.\n\n```go\nGreet(&output)\n```\n\nThe supplied buffer receives the text.\n\n### Takeaway\n\nThe caller chooses the destination." };
    const html = renderToStaticMarkup(<AnswerTutoring check={check} teaching={example} loading={false} failed={false} busy={false} {...handlers} />);
    expect(html).toContain("Part 1 of 2");
    expect(html).toContain("The supplied buffer receives the text");
    expect(html).toContain("Next: Takeaway");
    const together = renderToStaticMarkup(<AnswerTutoring check={check} teaching={example} initialTogether loading={false} failed={false} busy={false} {...handlers} />);
    expect(together).toContain("The caller chooses the destination");
    expect(together).toContain("Complete explanation");
    expect(together).not.toContain("Next: Takeaway");
  });
  it("rejects old tutoring after a written grade is disputed and accepts a new neutral teaching turn", () => {
    const original: CheckAttempt = { ...attempt, grading: { status: "correct", feedback: "Fits", criteria: [] } };
    const disputed: CheckAttempt = { ...original, correct: false, grading: { ...original.grading!, status: "uncertain", reviewRequested: true } };
    const old = { ...teaching, tutoring_attempt_key: tutoringAttemptKey(original) };
    expect(answerTutoring([old], check.id, original)).toBe(old);
    expect(answerTutoring([old], check.id, disputed)).toBeUndefined();
    expect(answerTutoring([teaching], check.id, disputed)).toBeUndefined(); // Legacy teaching cannot claim a disputed result either.
    const neutral = { ...teaching, id: "neutral", tutoring_attempt_key: tutoringAttemptKey(disputed) };
    expect(answerTutoring([old, neutral], check.id, disputed)).toBe(neutral);
    const history: ChatMessage[] = [{ ...teaching, id: "answer", role: "user", check_attempt: disputed }, old];
    expect(formatConversationMessages(history, "Tutor")[2].content).toContain("feedback that has since changed");
  });
  it("restores the exact reading part/layout and safely ignores malformed saved positions", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    saveTutoringPosition(teaching.id, { index: 1, together: false });
    const html = renderToStaticMarkup(<AnswerTutoring check={check} teaching={teaching} loading={false} failed={false} busy={false} {...handlers} />);
    expect(html).toContain("Part 2 of 3");
    expect(html).toContain("You meet a friend before breakfast");
    expect(html).not.toContain("The time of day helps you choose");
    saveTutoringPosition(teaching.id, { index: 2, together: true });
    expect(readTutoringPosition(teaching.id, false)).toEqual({ index: 2, together: true });
    data.set(tutoringReadingKey(teaching.id), '{"index":-1,"together":"false"}');
    expect(readTutoringPosition(teaching.id, true)).toEqual({ index: 0, together: true });
    expect(readTutoringPosition("other-teaching", false)).toEqual({ index: 0, together: false });
  });
  it("starts with an accessible example for an unknown written answer rather than disputing a grade", () => {
    expect(answerTutoringPrompt(check, { ...attempt, dontKnow: true, grading: { status: "uncertain", feedback: "No answer", criteria: [] } })).toContain("Start from an observable example");
    const html = renderToStaticMarkup(<AnswerTutoring check={check} feedbackChanged loading={false} failed={false} busy={false} {...handlers} />);
    expect(html).toContain("Your feedback is under review");
    expect(html).not.toContain(check.explanation);
  });
});
