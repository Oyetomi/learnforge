import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, CheckAttempt, LearningCheck, LearningPractice, Milestone } from "../../../types";
import { nextTeachingStep, teachingContinuationPrompt } from "../teaching";
import { isIndependentAttempt, learningEvidence, starterLearningCheck, validateLearningCheck } from "../checks";
import { acceptsReadiness, extractRepair } from "../adaptation";
import { answerTutoringPrompt } from "../tutoring";
import { QuestionCard } from "../../../components/learning/QuestionCard";
import { AnswerTutoring } from "../../../components/learning/AnswerTutoring";
import { retentionRating } from "../retention";
import { buildSocraticSystemPrompt } from "../../ai/prompts";

const check: LearningCheck = { id: "q1", milestoneId: "m", practice: "independent",
  question: "Which fraction is greater?", options: [{ id: "a", label: "One half" }, { id: "b", label: "One quarter" }],
  correctOptionIds: ["a"], multiple: false, explanation: "Half of the same whole is larger than a quarter." };
const milestone: Milestone = { id: "m", session_id: "s", title: "Compare fractions", prompt: "Compare parts of the same whole",
  starter_code: "", status: "active", created_at: 0, check };
const attempt = (id: string, practice: LearningPractice = "independent", patch: Partial<CheckAttempt> = {}): ChatMessage => ({
  id, session_id: "s", milestone_id: "m", role: "user", content: "Submitted answer", created_at: 1,
  check_attempt: { checkId: id, milestoneId: "m", practice, selectedIds: ["a"], correct: true, dontKnow: false,
    thinking: "Both parts are from the same whole.", confidence: "confident", submittedAt: 1, ...patch },
});
const review = (ids: string[]) => ({ decision: "ready" as const, rationale: "Independent reasoning in different situations", evidenceCheckIds: ids });
afterEach(() => vi.unstubAllGlobals());

describe("guidance within a concept", () => {
  it("starts with a demonstration, then follows difficulty, supported success and independence with different next steps", () => {
    const history: ChatMessage[] = [];
    expect(nextTeachingStep(history, "m").stage).toBe("learn");
    history.push(attempt("first", "independent", { correct: false }));
    expect(nextTeachingStep(history, "m").stage).toBe("guided");
    history.push(attempt("guided", "guided"));
    expect(nextTeachingStep(history, "m").stage).toBe("independent");
    history.push(attempt("own"));
    expect(nextTeachingStep(history, "m").stage).toBe("transfer");
    history.push(attempt("changed", "transfer"));
    expect(nextTeachingStep(history, "m").stage).toBe("review");
    expect(learningEvidence(history, "m").independentCorrect).toBe(2);
    expect(acceptsReadiness(history, "m", review(["own", "changed"]))).toBe(true);
    // A fresh error reduces the step size even after earlier success.
    history.push(attempt("new-error", "transfer", { correct: false }));
    expect(nextTeachingStep(history, "m").stage).toBe("guided");
    expect(acceptsReadiness(history, "m", review(["own", "changed"]))).toBe(false);
  });

  it("does not diagnose a prerequisite from no answer, no reasoning, low confidence, or disputed grading", () => {
    for (const patch of [{ dontKnow: true, correct: false }, { correct: false, thinking: "" },
      { confidence: "unsure" as const }, { correct: false, grading: { status: "uncertain" as const, feedback: "Unclear", criteria: [] } }]) {
      expect(nextTeachingStep([attempt("q", "independent", patch)], "m").allowRepair).toBe(false);
    }
    expect(nextTeachingStep([attempt("q", "independent", { correct: false })], "m").allowRepair).toBe(true);
    const unresolved = nextTeachingStep([attempt("q", "independent", {
      grading: { status: "correct", reviewRequested: true, feedback: "Disputed", criteria: [] },
    })], "m");
    expect(unresolved.stage).toBe("clarify");
    const unknown = nextTeachingStep([attempt("q", "independent", { dontKnow: true, correct: false,
      grading: { status: "uncertain", feedback: "No answer", criteria: [] } })], "m");
    expect(unknown.stage).toBe("guided");
  });

  it("fades cues at the same difficulty after assisted or unsure success instead of raising difficulty", () => {
    for (const patch of [{ assisted: true }, { confidence: "unsure" as const }, { retriedOptionIds: ["b"] }]) {
      const plan = nextTeachingStep([attempt("q", "independent", patch)], "m");
      expect(plan.stage).toBe("independent");
      expect(plan.practice).toBe("independent");
    }
  });

  it("keeps other concepts, tutor explanations and revisits out of this concept's teaching decision", () => {
    const other = attempt("other", "transfer");
    other.check_attempt!.milestoneId = "another";
    const history: ChatMessage[] = [attempt("q"), other, { id: "teaching", session_id: "s", role: "assistant",
      content: "An explanation", tutoring_for_check_id: "q", created_at: 4 },
      { id: "revisit", session_id: "s", role: "user", content: "Recall", created_at: 5,
        retention_review: { cardId: "card", check, attempt: attempt("q2", "transfer").check_attempt! } }];
    expect(nextTeachingStep(history, "m").stage).toBe("transfer");
    expect(learningEvidence(history, "m").independentCorrect).toBe(1);
    expect(nextTeachingStep(JSON.parse(JSON.stringify(history)), "m")).toEqual(nextTeachingStep(history, "m"));
  });
});

describe("support and advancement boundaries", () => {
  it("does not accept guided practice as independent even when its assisted flag is missing", () => {
    const history = [attempt("a", "guided"), attempt("b", "guided")];
    expect(learningEvidence(history, "m").independentCorrect).toBe(0);
    const q: ChatMessage = { id: "question", session_id: "s", role: "assistant", content: "A cue", created_at: 0,
      learning_check: { ...check, id: "a", practice: "guided" } };
    const legacyAttempt = attempt("a").check_attempt!;
    delete legacyAttempt.practice;
    expect(isIndependentAttempt(legacyAttempt, [q])).toBe(false);
    expect(retentionRating({ ...check, practice: "guided" }, { ...legacyAttempt, checkId: "q1" })).toBe(2);
  });

  it("requires a successful independent changed-situation task in the new flow and in the cited review evidence", () => {
    const history = [attempt("a"), attempt("b")];
    expect(learningEvidence(history, "m").readyToAdvance).toBe(false);
    history.push(attempt("changed", "transfer", { assisted: true }));
    expect(learningEvidence(history, "m").readyToAdvance).toBe(false);
    history.push(attempt("changed-again", "transfer"));
    expect(learningEvidence(history, "m").readyToAdvance).toBe(true);
    expect(acceptsReadiness(history, "m", review(["a", "b"]))).toBe(false);
    expect(acceptsReadiness(history, "m", review(["a", "changed-again"]))).toBe(true);
  });

  it("retains the evidence contract of saved legacy lessons and does not revoke it for an unanswered new question", () => {
    const history = [attempt("a"), attempt("b")];
    history.forEach(m => delete m.check_attempt!.practice);
    expect(acceptsReadiness(history, "m", review(["a", "b"]))).toBe(true);
    history.push({ id: "new", session_id: "s", role: "assistant", content: "Optional practice", created_at: 5,
      learning_check: { ...check, id: "new", practice: "transfer" } });
    expect(acceptsReadiness(history, "m", review(["a", "b"]))).toBe(true);
  });

  it("does not trust generated practice labels and gives a prerequisite's first task supported status", () => {
    expect(validateLearningCheck({ ...check, practice: "transfer" })).not.toHaveProperty("practice");
    expect(starterLearningCheck("custom", { ...milestone, adaptive: true }, 0)?.practice).toBe("guided");
    expect(starterLearningCheck("custom", milestone, 0)?.practice).toBe("independent");
  });

  it("refuses generated prerequisite detours for unknown or disputed outcomes", () => {
    const proposal = '```forge-repair\n' + JSON.stringify({ beforeMilestoneId: "m", triggerCheckId: "q", title: "Smaller idea",
      reason: "We'll work through the next step", lesson: "A tiny example", check }) + '\n```';
    for (const patch of [{ dontKnow: true }, { grading: { status: "uncertain" as const, feedback: "Unclear", criteria: [] } }]) {
      expect(extractRepair(proposal, [attempt("q", "independent", { correct: false, ...patch })], milestone, [milestone])).toBeNull();
    }
  });
});

describe("visible guidance without another mode", () => {
  const handlers = { onSubmit: vi.fn(), onAskCoach: vi.fn(), onNewQuestion: vi.fn(), isBusy: false };
  it("shows guided and transfer status inside the existing choice and written panels", () => {
    for (const kind of ["choice", "free-response"] as const) {
      for (const [practice, label] of [["guided", "Guided practice"], ["transfer", "New situation"]] as const) {
        const html = renderToStaticMarkup(<QuestionCard check={{ ...check, kind, practice }} {...handlers} />);
        expect(html).toContain(label);
        expect(html).not.toContain(check.explanation);
      }
    }
  });

  it("explains the next activity on the final teaching part and does not invoke continuation on render", () => {
    const plan = nextTeachingStep([attempt("q", "independent", { correct: false })], "m");
    const onContinue = vi.fn();
    const html = renderToStaticMarkup(<AnswerTutoring check={check} teaching={{ id: "t", session_id: "s", role: "assistant",
      content: "### One worked example\n\nCompare two pieces from the same whole.", created_at: 1 }}
      loading={false} failed={false} busy={false} onRetry={vi.fn()} onContinue={onContinue}
      continueLabel={plan.label} nextStepReason={plan.reason} />);
    expect(html).toContain("Try a guided step");
    expect(html).toContain(plan.reason.replace(/'/g, "&#x27;"));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("preserves substantive post-answer teaching and its no-assessment boundary for supported, independent and disputed work", () => {
    for (const a of [attempt("q", "guided").check_attempt!, attempt("q").check_attempt!,
      attempt("q", "independent", { grading: { status: "uncertain", feedback: "Unclear", criteria: [] } }).check_attempt!]) {
      const prompt = answerTutoringPrompt(check, a);
      expect(prompt).toContain("a worked example");
      expect(prompt).toContain("Do not emit forge-check");
    }
    const guided = nextTeachingStep([attempt("q", "independent", { correct: false })], "m");
    expect(teachingContinuationPrompt(guided)).toContain("check.context");
    expect(teachingContinuationPrompt(guided)).toContain("explicitly chose");
  });

  it("allows complete demonstrations in conceptual lessons while protecting active assignments and pending assessment answers", () => {
    const conceptual = buildSocraticSystemPrompt(milestone);
    expect(conceptual).toContain("There is no active coding assignment");
    expect(conceptual).toContain("Complete worked examples are allowed");
    const coding = buildSocraticSystemPrompt({ ...milestone, starter_code: "An incomplete exercise" });
    expect(coding).toContain("There is an optional coding assignment");
    expect(coding).toContain("complete smaller analogous examples");
    expect(coding).toContain("pending assessment's answer private");
  });
});
