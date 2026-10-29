import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteTopicData } from "../topicDeletion";
import { tutoringReadingKey } from "../tutoring";
let Database: typeof import("../../db/storage").LocalDatabase;
beforeEach(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
    key: (i: number) => [...values.keys()][i] ?? null,
    get length() {
      return values.size;
    },
  });
  vi.resetModules();
  Database = (await import("../../db/storage")).LocalDatabase;
});
afterEach(() => vi.unstubAllGlobals());
it("permanently deletes owned records, drafts, progress and review cards while preserving another topic", () => {
  const db = new Database();
  const a = db.createSession({
      title: "Topic A",
      topic: "A",
      language: null,
      track_id: "a",
    }),
    b = db.createSession({
      title: "Topic B",
      topic: "B",
      language: null,
      track_id: "b",
    });
  const m = db.createMilestone({
    session_id: a.id,
    title: "Greeting",
    prompt: "Try a phrase",
    starter_code: "",
    status: "active",
  });
  const other = db.createMilestone({
    session_id: b.id,
    title: "Other",
    prompt: "Keep",
    starter_code: "",
    status: "active",
  });
  const ownedMessage = db.addMessage({
    session_id: a.id,
    milestone_id: m.id,
    role: "user",
    content: "Private saved response.",
    check_attempt: {
      checkId: "q-a",
      milestoneId: m.id,
      selectedIds: [],
      correct: false,
      dontKnow: true,
      thinking: "My thought.",
      confidence: null,
      submittedAt: 0,
    },
  });
  const otherMessage = db.addMessage({
    session_id: b.id,
    role: "user",
    content: "Keep this message.",
  });
  db.createCard({
    session_id: a.id,
    milestone_id: m.id,
    topic: "Topic A: Greeting",
    prompt: "Delete this owned card.",
  });
  db.createCard({
    topic: "Topic A: Greeting",
    prompt: "Delete this legacy card.",
  });
  db.createCard({
    session_id: b.id,
    topic: "Topic B: Other",
    prompt: "Keep this card.",
  });
  const keys = [
    `learnforge:active-milestone:${a.id}`,
    `learnforge:lesson-step:${m.id}`,
    `learnforge:lesson-progress:${m.id}`,
    "learnforge:check-draft:q-a",
    "learnforge:visual-support:q-a",
    `learnforge:composer-draft:a:${m.id}`,
    tutoringReadingKey(ownedMessage.id),
  ];
  for (const key of keys) localStorage.setItem(key, "private data");
  localStorage.setItem(tutoringReadingKey(otherMessage.id), "keep this reading position");
  localStorage.setItem(
    "learnforge:code-drafts",
    JSON.stringify({ [m.id]: "delete", [other.id]: "keep" })
  );
  localStorage.setItem("learnforge:learning-preferences", "keep preferences");
  localStorage.setItem("learnforge:active-track", "a");
  expect(deleteTopicData(db, { id: "a", title: "Topic A" })).toEqual([m.id]);
  const restored = new Database();
  expect(restored.getSessions().map((s) => s.id)).toEqual([b.id]);
  expect(restored.getMessages(a.id)).toEqual([]);
  expect(restored.getMilestones(a.id)).toEqual([]);
  expect(restored.getMessages(b.id)[0].content).toBe("Keep this message.");
  expect(restored.getDueCardsList().map((c) => c.prompt)).toEqual([
    "Keep this card.",
  ]);
  for (const key of keys) expect(localStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem("learnforge:active-track")).toBeNull();
  expect(JSON.parse(localStorage.getItem("learnforge:code-drafts")!)).toEqual({
    [other.id]: "keep",
  });
  expect(localStorage.getItem("learnforge:learning-preferences")).toBe(
    "keep preferences"
  );
  expect(localStorage.getItem(tutoringReadingKey(otherMessage.id))).toBe("keep this reading position");
});
it("does not delete a different track with the same display title or its owned review cards", () => {
  const db = new Database();
  const a = db.createSession({
      title: "Shared name",
      topic: "A",
      language: null,
      track_id: "a",
    }),
    b = db.createSession({
      title: "Shared name",
      topic: "B",
      language: null,
      track_id: "b",
    });
  const m = db.createMilestone({
    session_id: b.id,
    title: "Keep",
    prompt: "Keep",
    starter_code: "",
    status: "active",
  });
  db.createCard({
    session_id: b.id,
    milestone_id: m.id,
    topic: "Shared name: Keep",
    prompt: "Keep",
  });
  deleteTopicData(db, { id: "a", title: "Shared name" });
  expect(db.getSessions().map((s) => s.id)).toEqual([b.id]);
  expect(db.getDueCardsList()).toHaveLength(1);
  expect(db.getMessages(a.id)).toEqual([]);
});
it("also removes the legacy title-matched session that an old starter track could open", () => {
  const db = new Database();
  const s = db.createSession({
    title: "Old course",
    topic: "Old",
    language: "go",
  });
  deleteTopicData(db, { id: "old", title: "Old course" });
  expect(db.getSessions()).toEqual([]);
  expect(new Database().getSessions()).toEqual([]);
});
