import { describe, expect, it } from "vitest";
import type { Milestone } from "../../../types";
import { interpretAssistantReply, readinessCard } from "../assistantReply";

const milestone = {
  id: "m1",
  session_id: "s1",
  title: "Halves",
  prompt: "Compare halves",
  lesson: "Two equal parts.",
  starter_code: "",
  status: "active",
  created_at: 1,
} as Milestone;
const context = {
  activeMilestone: milestone,
  milestones: [milestone],
  history: [],
  language: null,
  plannerDecidedStay: false,
  now: 10,
  newCheckId: () => "check-fixed",
};
const fence = (kind: string, body: unknown) => "```" + kind + "\n" + JSON.stringify(body) + "\n```";
const question = {
  question: "Which is larger?",
  options: [{ id: "a", label: "One half" }, { id: "b", label: "One quarter" }],
  correctOptionIds: ["a"],
  multiple: false,
  explanation: "Fewer equal parts are larger.",
};

describe("interpretAssistantReply", () => {
  it("attaches a valid question to the active lesson and hides its block", () => {
    const reply = interpretAssistantReply(`Try this.\n\n${fence("forge-check", question)}`, {}, context);
    expect(reply.learningCheck).toMatchObject({ id: "check-fixed", milestoneId: "m1", question: "Which is larger?" });
    expect(reply.content).toBe("Try this.");
    expect(reply.content).not.toContain("forge-check");
  });

  it("explains a question block that could not be shown instead of dropping it silently", () => {
    const reply = interpretAssistantReply("Intro\n```forge-check\nnot json\n```", {}, context);
    expect(reply.learningCheck).toBeUndefined();
    expect(reply.content).toContain("This question could not be displayed");
  });

  it("keeps teach-only turns free of questions and readiness decisions", () => {
    const text = `Lesson.\n\n${fence("forge-check", question)}\n\n${fence("forge-assessment", { decision: "ready", rationale: "x", evidenceCheckIds: [] })}`;
    const reply = interpretAssistantReply(text, { teachOnly: true }, context);
    expect(reply.learningCheck).toBeUndefined();
    expect(reply.acceptedReview).toBeUndefined();
    expect(reply.content).not.toContain("could not be displayed");
  });

  it("refuses an unsupported readiness claim and says so", () => {
    const reply = interpretAssistantReply(
      `Well done.\n\n${fence("forge-assessment", { decision: "ready", rationale: "Looks good", evidenceCheckIds: ["missing"] })}`,
      {},
      context
    );
    expect(reply.acceptedReview).toBeUndefined();
    expect(reply.content).toContain("readiness evidence could not be verified");
  });

  it("marks empty answer tutoring as a failed generation", () => {
    expect(interpretAssistantReply("   ", { answerTutoringFor: "q1" }, context).generationError).toBe(true);
    expect(interpretAssistantReply("Here is why.", { answerTutoringFor: "q1" }, context).generationError).toBe(false);
  });

  it("reports a requested visual that could not be prepared", () => {
    expect(interpretAssistantReply("Plain text.", { visual: true }, context).content).toContain("couldn’t prepare the visual example");
  });
});

describe("readinessCard", () => {
  it("uses the question and its correct answer, or falls back to the lesson", () => {
    const check = { ...question, id: "q", milestoneId: "m1", context: "Same cake." };
    expect(readinessCard(milestone, check)).toEqual({
      prompt: "Same cake.\n\nWhich is larger?",
      answer: "One half\n\nFewer equal parts are larger.",
    });
    expect(readinessCard(milestone, null)).toEqual({
      prompt: "What did you learn about Halves?",
      answer: "Two equal parts.",
    });
  });
});
