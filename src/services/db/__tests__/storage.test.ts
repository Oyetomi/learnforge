import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningCheck } from "../../../types";
let LocalDatabase: typeof import("../storage").LocalDatabase;
beforeEach(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.resetModules();
  LocalDatabase = (await import("../storage")).LocalDatabase;
});
afterEach(() => vi.unstubAllGlobals());

describe("durable learning records", () => {
  it("starts without fabricated personal topics or due reviews", () => {
    const db = new LocalDatabase();
    expect(db.getSessions()).toEqual([]);
    expect(db.getDueCardsList()).toEqual([]);
  });
  it("does not mutate a React message snapshot when appending an answer", () => {
    const db = new LocalDatabase();
    db.addMessage({
      session_id: "s1",
      role: "assistant",
      content: "First question",
    });
    const snapshot = db.getMessages("s1");
    const answer = db.addMessage({
      session_id: "s1",
      role: "user",
      content: "My answer",
    });
    expect(snapshot).toHaveLength(1);
    expect([...snapshot, answer]).toHaveLength(2);
    expect(db.getMessages("s1")).toHaveLength(2);
  });
  it("keeps previous milestone status snapshots stable", () => {
    const db = new LocalDatabase();
    const milestone = db.createMilestone({
      session_id: "s1",
      title: "Ownership",
      prompt: "Reason about moves.",
      starter_code: "",
      status: "active",
    });
    const snapshot = db.getMilestones("s1");
    db.updateMilestoneStatus(milestone.id, "completed");
    expect(snapshot[0].status).toBe("active");
    expect(db.getMilestones("s1")[0].status).toBe("completed");
  });
  it("restores questions and attempts, and exports explanations only after an answer", () => {
    const db = new LocalDatabase();
    const session = db.createSession({
      title: "Ownership",
      topic: "Moves",
      language: "rust",
    });
    const check: LearningCheck = {
      id: "q1",
      milestoneId: "m1",
      question: "Which parameter borrows?",
      options: [
        { id: "a", label: "&str" },
        { id: "b", label: "String" },
      ],
      correctOptionIds: ["a"],
      explanation: "Borrowing retains caller ownership.",
      multiple: false,
    };
    db.addMessage({
      session_id: session.id,
      role: "assistant",
      content: "Try a new case.",
      learning_check: check,
    });
    db.addMessage({
      session_id: session.id,
      role: "user",
      content: "PRIVATE ORCHESTRATION",
      internal: true,
    });
    expect(db.exportSessionMarkdown(session.id)).not.toContain(
      check.explanation
    );
    db.addMessage({
      session_id: session.id,
      role: "user",
      content: "My answer: &str",
      check_attempt: {
        checkId: "q1",
        milestoneId: "m1",
        selectedIds: ["a"],
        dontKnow: false,
        correct: true,
        thinking: "The function only reads.",
        confidence: "confident",
        submittedAt: 0,
      },
    });
    const restored = new LocalDatabase();
    expect(restored.getMessages(session.id)[0].learning_check).toEqual(check);
    expect(restored.getMessages(session.id)[2].check_attempt?.thinking).toBe(
      "The function only reads."
    );
    const notes = restored.exportSessionMarkdown(session.id);
    expect(notes).toContain(check.question);
    expect(notes).toContain(check.explanation);
    expect(notes).not.toContain("PRIVATE ORCHESTRATION");
  });
});

it("persists a targeted prerequisite, reconnects the roadmap, and retains the return point", () => {
  const db = new LocalDatabase();
  const parent = db.createMilestone({
    session_id: "s1",
    title: "Channels",
    prompt: "Reason about sends.",
    starter_code: "",
    status: "active",
  });
  const repair = db.addRepairMilestone(parent.id, {
    title: "Concurrency versus storage",
    lesson: "A channel does not start a goroutine.",
    reason: "The learner confused channel creation with execution.",
    check: {
      question: "What starts work?",
      options: [
        { id: "a", label: "go work()" },
        { id: "b", label: "make(chan int)" },
      ],
      correctOptionIds: ["a"],
      multiple: false,
      explanation: "The go statement starts execution.",
    },
  })!;
  expect(db.getMilestones("s1").map((m) => m.id)).toEqual([
    repair.id,
    parent.id,
  ]);
  expect(db.getMilestones("s1")[1].prerequisite_ids).toEqual([repair.id]);
  expect(repair.return_to_milestone_id).toBe(parent.id);
  expect(repair.adaptation_reason).toContain("confused");
  expect(new LocalDatabase().getMilestones("s1")[0].adaptive).toBe(true);
});

it("persists the original learning intent through sessions, lessons, and inserted repair steps", () => {
  const db = new LocalDatabase();
  const intent = {
    interest: "Learn Yoruba for conversation",
    goal: "Greetings",
    practiceMode: "general" as const,
  };
  const session = db.createSession({
    title: "Yoruba",
    topic: "Greetings",
    language: null,
    track_id: "yoruba-custom",
    learning_intent: intent,
  });
  const lesson = db.createMilestone({
    session_id: session.id,
    title: "A greeting",
    prompt: "Use a greeting",
    starter_code: "",
    status: "active",
  });
  const repair = db.addRepairMilestone(lesson.id, {
    title: "Who are you greeting?",
    lesson: "One example.",
    reason: "Choose the greeting for this person.",
    check: {
      question: "Who?",
      options: [
        { id: "a", label: "One person" },
        { id: "b", label: "A group" },
      ],
      correctOptionIds: ["a"],
      multiple: false,
      explanation: "The example has one person.",
    },
  });
  expect(repair?.learning_intent).toEqual(intent);
  const reloaded = new LocalDatabase();
  expect(reloaded.getSession(session.id)?.language).toBeNull();
  expect(reloaded.getSession(session.id)?.learning_intent).toEqual(intent);
  expect(
    reloaded
      .getMilestones(session.id)
      .every((m) => m.learning_intent?.interest === intent.interest)
  ).toBe(true);
  expect(reloaded.exportSessionMarkdown(session.id)).toContain(
    "Learn Yoruba for conversation"
  );
  expect(reloaded.exportSessionMarkdown(session.id)).not.toContain(
    "**Programming language:**"
  );
});

it("restores visual examples and their support evidence, and exports a text equivalent", async () => {
  const visual = {
    kind: "parts" as const,
    title: "A greeting",
    summary: "A respectful morning greeting.",
    items: [
      { id: "a", label: "Ẹ", description: "Respectful form." },
      { id: "b", label: "káàárọ̀", description: "The morning greeting." },
    ],
    takeaway: "Use the phrase in the morning.",
  };
  const db = new LocalDatabase();
  const session = db.createSession({
    title: "Yoruba",
    topic: "Greetings",
    language: null,
  });
  db.addMessage({
    session_id: session.id,
    role: "assistant",
    content: "Explore this greeting.",
    visual_example: visual,
    visual_requested: true,
  });
  const restored = new LocalDatabase();
  expect(restored.getMessages(session.id)[0].visual_example).toEqual(visual);
  expect(restored.exportSessionMarkdown(session.id)).toContain("Ẹ");
  expect(restored.exportSessionMarkdown(session.id)).toContain(
    visual.items[1].description
  );
});

it("deduplicates session references across seeded milestones while hydrating them on read and reload", () => {
  const db = new LocalDatabase();
  const ref = {
    id: "ref-1",
    name: "notes.md",
    content: "A".repeat(12000),
    truncated: false,
  };
  const session = db.createSession({
    title: "Distributed Systems",
    topic: "Consensus",
    language: "go",
    references: [ref],
  });
  const seeded = db.seedMilestonePlan(
    session.id,
    Array.from({ length: 12 }, (_, idx) => ({
      sourceId: `u-${idx}`,
      title: `Unit ${idx + 1}`,
      prompt: "Reason about quorum.",
      starter_code: "",
      status: idx === 0 ? ("active" as const) : ("pending" as const),
      references: [ref],
    }))
  );
  expect(seeded).toHaveLength(12);
  expect(seeded.every((m) => m.references?.[0].id === "ref-1")).toBe(true);

  const rawMilestonesJson = localStorage.getItem("learnforge:milestones")!;
  expect(rawMilestonesJson).toBeTruthy();
  // 12 units * 12 KB would exceed 144 KB if duplicated; deduplicated JSON is < 4 KB
  expect(rawMilestonesJson.length).toBeLessThan(8000);
  expect(rawMilestonesJson).not.toContain("AAAA");

  const reloaded = new LocalDatabase();
  const restoredUnits = reloaded.getMilestones(session.id);
  expect(restoredUnits).toHaveLength(12);
  expect(restoredUnits.every((m) => m.references?.[0].content.length === 12000)).toBe(
    true
  );
});

it("writes only mutated collections and tracks quota failures until pending writes flush cleanly", () => {
  const writes: string[] = [];
  const store = new Map<string, string>();
  let failMilestones = false;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failMilestones && key === "learnforge:milestones") {
        throw new Error("QuotaExceededError");
      }
      writes.push(key);
      store.set(key, value);
    },
  });

  const db = new LocalDatabase();
  const session = db.createSession({
    title: "Rust",
    topic: "Lifetimes",
    language: "rust",
  });
  writes.length = 0;

  db.addMessage({
    session_id: session.id,
    role: "user",
    content: "How does elision work?",
  });
  expect(writes).toContain("learnforge:messages");
  expect(writes).toContain("learnforge:sessions");
  expect(writes).not.toContain("learnforge:milestones");
  expect(writes).not.toContain("learnforge:srs_cards");

  failMilestones = true;
  const unit = db.createMilestone({
    session_id: session.id,
    title: "Lifetime Elision",
    prompt: "Trace borrowed references.",
    starter_code: "",
    status: "active",
  });
  expect(unit.title).toBe("Lifetime Elision");
  expect(db.isPersisted()).toBe(false);
  expect(db.getPersistenceError()).toContain("QuotaExceededError");

  // While milestones still exceed quota, unrelated writes do not falsely clear the warning
  db.addMessage({
    session_id: session.id,
    role: "assistant",
    content: "Let us inspect input lifetimes.",
  });
  expect(db.isPersisted()).toBe(false);

  // Once space is available, the next write flushes pending milestones and clears the error
  failMilestones = false;
  db.addMessage({
    session_id: session.id,
    role: "user",
    content: "Show an example.",
  });
  expect(db.isPersisted()).toBe(true);
  expect(db.getPersistenceError()).toBe("");
  expect(new LocalDatabase().getMilestones(session.id)[0].title).toBe(
    "Lifetime Elision"
  );
});
