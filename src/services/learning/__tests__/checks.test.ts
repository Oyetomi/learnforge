import { describe, expect, it } from "vitest";
import {
  extractLearningCheck,
  gradeLearningCheck,
  learningEvidence,
  hideLearningCheckBlocks,
  orderedCheckOptions,
  starterLearningCheck,
  validateLearningCheck,
} from "../checks";
import { topicsInWorkspace } from "../topics";
import {
  buildSocraticSystemPrompt,
  formatConversationMessages,
} from "../../ai/prompts";
import type { LearningCheck, Milestone } from "../../../types";

export const check: LearningCheck = {
  id: "check-17",
  milestoneId: "m1",
  question: "Which operations preserve this invariant?",
  options: [
    { id: "first", label: "First operation" },
    { id: "second", label: "Second operation" },
    { id: "third", label: "Third operation" },
  ],
  correctOptionIds: ["first", "third"],
  multiple: true,
  explanation: "Private explanation until submission.",
};
const milestone: Milestone = {
  id: "m1",
  session_id: "s1",
  title: "Worker Pool",
  prompt: "Learn channels.",
  starter_code: "",
  test_code: "",
  status: "active",
  created_at: 0,
};

describe("interactive checks", () => {
  it("suppresses echoed internal question metadata in complete and partial responses", () => {
    for (const suffix of [
      '{"question":"Example","correctOptionIds":["a"]}',
      '{"question":',
    ]) {
      expect(
        hideLearningCheckBlocks(
          "One small example.\n\nKnowledge check presented in lesson UI: " +
            suffix
        )
      ).toBe("One small example.");
    }
  });

  it("grades an exact set of stable option ids regardless of order", () => {
    expect(gradeLearningCheck(check, ["third", "first"])).toBe(true);
    for (const selected of [
      [],
      ["first"],
      ["first", "second", "third"],
      ["first", "third", "unknown"],
    ])
      expect(gradeLearningCheck(check, selected)).toBe(false);
    expect(gradeLearningCheck(check, ["first", "third"], true)).toBe(false);
  });
  it("shuffles display order deterministically without mutating options or the answer key", () => {
    const before = JSON.stringify(check);
    expect(orderedCheckOptions(check)).toEqual(
      orderedCheckOptions(JSON.parse(before))
    );
    expect(
      orderedCheckOptions(check)
        .map((option) => option.id)
        .sort()
    ).toEqual(["first", "second", "third"]);
    expect(JSON.stringify(check)).toBe(before);
  });
  it("rejects answer keys and option sets that cannot be graded", () => {
    for (const invalid of [
      { ...check, correctOptionIds: ["missing"] },
      { ...check, multiple: false },
      { ...check, options: [check.options[0], check.options[0]] },
      { ...check, options: [check.options[0]] },
      { ...check, explanation: "" },
    ])
      expect(validateLearningCheck(invalid)).toBeNull();
    expect(validateLearningCheck(check)?.correctOptionIds).toEqual([
      "first",
      "third",
    ]);
  });
  it("extracts a validated JSON question and removes its key from conversational content", () => {
    const result = extractLearningCheck(
      `Here is a question.\n\n\`\`\`forge-check\n${JSON.stringify(
        check
      )}\n\`\`\``
    );
    expect(result.check?.question).toBe(check.question);
    expect(result.text).toBe("Here is a question.");
    expect(result.hasBlock).toBe(true);
  });
  it("hides partially streamed, indented, and malformed question blocks", () => {
    for (const block of [
      '```forge-check\n{"explanation":"SECRET',
      "  ```forge-check\nSECRET\n  ```",
      "```forge-check\r\nSECRET",
    ])
      expect(hideLearningCheckBlocks(`Intro\n${block}`)).toBe("Intro");
    const invalid = extractLearningCheck(
      "Intro\n```forge-check\ninvalid json\n```"
    );
    expect(invalid).toEqual({ check: null, text: "Intro", hasBlock: true });
    expect(hideLearningCheckBlocks("```go\nordinary code\n```")).toContain(
      "ordinary code"
    );
  });
  it("keeps later conversational text while removing multiple answer blocks", () => {
    expect(
      hideLearningCheckBlocks(
        "Before\n```forge-check\nSECRET\n```\nAfter\n```forge-check\nMORE SECRET\n```"
      )
    ).toBe("Before\n\nAfter");
  });
  it("does not substitute a starter question into unrelated or later lessons", () => {
    expect(starterLearningCheck("custom-queues", milestone, 0)).toBeNull();
    expect(starterLearningCheck("go-concurrency", milestone, 1)).toBeNull();
    expect(
      starterLearningCheck("go-concurrency", milestone, 0)?.question
    ).toContain("Workers");
    expect(
      starterLearningCheck("custom-queues", { ...milestone, check }, 0)
        ?.question
    ).toBe(check.question);
  });
  it("provides current question context to coaching and retains generated questions in history", () => {
    expect(
      buildSocraticSystemPrompt(milestone, "", undefined, check)
    ).toContain(check.question);
    const messages = formatConversationMessages(
      [
        {
          id: "q1",
          session_id: "s1",
          created_at: 0,
          role: "assistant",
          content: "Try this question.",
          learning_check: check,
        },
      ],
      "system"
    );
    expect(messages[1].content).toContain(check.question);
    expect(messages[1].content).toContain(check.explanation);
  });
});

describe("topic membership", () => {
  const tracks = [{ id: "starter-a" }, { id: "starter-b" }, { id: "custom-1" }];
  it("keeps starter courses opt-in and puts user topics first", () => {
    expect(
      topicsInWorkspace(tracks, ["starter-a", "starter-b"], [], [])
    ).toEqual([{ id: "custom-1" }]);
    expect(
      topicsInWorkspace(tracks, ["starter-a", "starter-b"], ["starter-a"], [])
    ).toEqual([{ id: "custom-1" }, { id: "starter-a" }]);
  });
  it("removes any topic without destroying the source used to restore it", () => {
    const before = JSON.stringify(tracks);
    expect(
      topicsInWorkspace(
        tracks,
        ["starter-a", "starter-b"],
        ["starter-a"],
        ["starter-a", "custom-1"]
      )
    ).toEqual([]);
    expect(
      topicsInWorkspace(tracks, ["starter-a", "starter-b"], ["starter-a"], [])
    ).toHaveLength(2);
    expect(JSON.stringify(tracks)).toBe(before);
  });
});

describe("evidence before advancement", () => {
  const attemptMessage = (id: string, overrides = {}) => ({
    id,
    session_id: "s1",
    role: "user" as const,
    content: "Attempt",
    created_at: 0,
    check_attempt: {
      checkId: id,
      milestoneId: "m1",
      selectedIds: ["a"],
      dontKnow: false,
      thinking: "",
      confidence: null,
      correct: true,
      submittedAt: 0,
      ...overrides,
    },
  });
  it("does not treat one correct answer, retries of it, or assisted success as enough evidence", () => {
    expect(learningEvidence([attemptMessage("one")], "m1").readyToAdvance).toBe(
      false
    );
    expect(
      learningEvidence([attemptMessage("one"), attemptMessage("one")], "m1")
        .readyToAdvance
    ).toBe(false);
    expect(
      learningEvidence(
        [attemptMessage("one"), attemptMessage("two", { assisted: true })],
        "m1"
      ).readyToAdvance
    ).toBe(false);
    expect(
      learningEvidence(
        [
          attemptMessage("one"),
          attemptMessage("two", { confidence: "unsure" }),
        ],
        "m1"
      ).readyToAdvance
    ).toBe(false);
  });
  it("requires a successful latest attempt and keeps other lesson evidence separate", () => {
    const messages = [attemptMessage("one"), attemptMessage("two")];
    expect(learningEvidence(messages, "m1").readyToAdvance).toBe(true);
    expect(learningEvidence(messages, "m2").independentCorrect).toBe(0);
    expect(
      learningEvidence(
        [...messages, attemptMessage("three", { correct: false })],
        "m1"
      ).readyToAdvance
    ).toBe(false);
  });
});

it("keeps a nontechnical goal in the tutor context and does not inject a programming language or stale editor code", () => {
  const prompt = buildSocraticSystemPrompt(
    {
      ...milestone,
      learning_intent: {
        interest: "Learn Yoruba for conversation",
        goal: "Everyday greetings",
        practiceMode: "general",
      },
    },
    "package main",
    "go"
  );
  expect(prompt).toContain("Learn Yoruba for conversation");
  expect(prompt).toContain("This is a non-coding course");
  expect(prompt).not.toContain("## PRIMARY LANGUAGE");
  expect(prompt).not.toContain("package main");
});
