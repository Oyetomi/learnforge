import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CourseTrack } from "../../ai/types";
import type { Milestone } from "../../../types";
import { approveLearningPlan, nextLearningMilestone, plannedMilestoneFields, recordPlacementAttempt, replacePlacementAttempt } from "../placement";
import { isLessonUnlocked, acceptsReadiness } from "../adaptation";
import { PlanApproval } from "../../../components/curriculum/PlanApproval";
import { buildSocraticSystemPrompt } from "../../ai/prompts";

const check = {
  question: "Which greetings fit this situation?",
  context: "You are greeting two friends.",
  options: [{ id: "a", label: "First greeting" }, { id: "b", label: "Second greeting" }, { id: "c", label: "Goodbye" }],
  correctOptionIds: ["a", "b"], multiple: true, explanation: "Both greet friends.",
};
const track: CourseTrack = {
  id: "yoruba", title: "Everyday Yoruba", language: null, tagline: "Greet friends", description: "Use everyday greetings.",
  difficulty: "Beginner", estimatedHours: 1, concepts: ["Greetings", "Replies"], initialPrompt: "Welcome",
  learningIntent: { interest: "Yoruba", goal: "Talk to friends", practiceMode: "general" },
  milestones: [
    { id: "greetings", title: "Greetings", concept: "Greetings", prompt: "Say hello", starter_code: "", test_code: "", prerequisite_ids: [], check },
    { id: "replies", title: "Replies", concept: "Replies", prompt: "Reply to a friend", starter_code: "", test_code: "", prerequisite_ids: ["greetings"], check },
    { id: "names", title: "Names", concept: "Names", prompt: "Say your name", starter_code: "", test_code: "", prerequisite_ids: [], check },
  ],
};
const attempt = (id = "greetings", selected = ["a", "b"]) => recordPlacementAttempt(id, check, selected, "confident");
const seed = (t: CourseTrack): Milestone[] => t.milestones.map((m) => ({
  ...m, ...plannedMilestoneFields(t, m.id), session_id: "session", created_at: 0,
}));
afterEach(() => vi.unstubAllGlobals());

describe("tentative placement and durable planning", () => {
  it("grades complete sets, not whether any correct option was selected", () => {
    expect(attempt("greetings", ["a"]).correct).toBe(false);
    expect(attempt("greetings", ["a", "b", "c"]).correct).toBe(false);
    expect(attempt("greetings", ["a", "b", "unknown"]).correct).toBe(false);
    expect(attempt("greetings", ["b", "a"]).correct).toBe(true);
  });
  it("snapshots the question and replaces a past pass on an unsure revisit", () => {
    const original = attempt();
    expect(original.check).not.toBe(check);
    const unsure = recordPlacementAttempt("greetings", check, [], "unsure", true);
    const revised = replacePlacementAttempt([original], unsure);
    expect(revised).toHaveLength(1);
    expect(revised[0]).toMatchObject({ correct: false, dontKnow: true, selectedIds: [], confidence: "unsure", helpUsed: [] });
    expect(approveLearningPlan(track, revised, new Set()).placement?.attempts[0]).toEqual(unsure);
  });
  it("never deletes prerequisites, marks mastery, or seeds a previously seen check as fresh", () => {
    const approved = approveLearningPlan(track, [attempt(), attempt("replies")], new Set(["greetings"]));
    expect(approved.milestones).toEqual(track.milestones);
    expect(approved.learningIntent).toEqual(track.learningIntent);
    const milestones = seed(approved);
    expect(milestones.every((m) => m.status !== "completed")).toBe(true);
    expect(milestones[0].placement_attempt?.check).toEqual(check);
    expect(milestones[0].check).toBeUndefined();
    expect(isLessonUnlocked(milestones[1], milestones, new Set())).toBe(false);
    expect(acceptsReadiness([], "greetings", { decision: "ready", rationale: "Probe passed", evidenceCheckIds: ["greetings", "replies"] })).toBe(false);
  });
  it("selects an independent root when the learner defers the first branch", () => {
    const approved = approveLearningPlan(track, [], new Set(["greetings", "replies"]));
    expect(approved.placement?.startMilestoneId).toBe("names");
    expect(seed(approved).map((m) => m.status)).toEqual(["pending", "pending", "active"]);
  });
  it("starts on a prerequisite when a later probe shows uncertainty, even after an earlier pass", () => {
    const approved = approveLearningPlan(track, [attempt(), attempt("replies", ["c"])], new Set());
    expect(approved.placement?.startMilestoneId).toBe("greetings");
    expect(approved.placement?.reason).toContain("before working toward Replies");
    expect(seed(approved)[1].prerequisite_ids).toEqual(["greetings"]);
  });
  it("keeps every concept when all are deferred and offers a safe starting point", () => {
    const approved = approveLearningPlan(track, [], new Set(track.milestones.map((m) => m.id)));
    expect(approved.milestones).toHaveLength(3);
    expect(approved.placement?.startMilestoneId).toBe("greetings");
  });
  it("recomputes grades and discards stale checks or foreign topic ids", () => {
    const approved = approveLearningPlan(track, [
      { ...attempt("greetings", ["c"]), correct: true },
      { ...attempt("replies"), check: { ...check, question: "Old question" } },
      attempt("another-topic"),
    ], new Set(["unknown"]));
    expect(approved.placement?.attempts).toHaveLength(1);
    expect(approved.placement?.attempts[0].correct).toBe(false);
    expect(approved.placement?.deferredMilestoneIds).toEqual([]);
  });
  it("retains sequence prerequisites in legacy plans and can return to an earlier deferred branch", () => {
    const legacy = { ...track, milestones: track.milestones.map((m) => ({ ...m, prerequisite_ids: undefined })) };
    expect(approveLearningPlan(legacy, [attempt()], new Set(["greetings"])).placement?.startMilestoneId).toBe("greetings");
    const milestones = seed(approveLearningPlan(track, [], new Set(["greetings", "replies"])));
    milestones[2].status = "completed";
    expect(nextLearningMilestone(milestones, "names", new Set(["names"]))?.id).toBe("greetings");
    expect(nextLearningMilestone(milestones, "greetings", new Set())?.id).toBeUndefined();
    expect(nextLearningMilestone(milestones, "greetings", new Set(["greetings"]))?.id).toBe("replies");
  });
  it("persists planning snapshots across database reload without creating lesson attempts", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
    const { LocalDatabase } = await import("../../db/storage");
    const db = new LocalDatabase();
    const approved = approveLearningPlan(track, [attempt()], new Set(["names"]));
    const session = db.createSession({ title: track.title, topic: track.tagline, language: null, learning_intent: track.learningIntent, placement: approved.placement });
    for (const m of seed(approved)) db.createMilestone({ ...m, session_id: session.id });
    const restored = new LocalDatabase();
    expect(restored.getSession(session.id)?.placement).toEqual(approved.placement);
    expect(restored.getMessages(session.id)).toEqual([]);
    expect(restored.getMilestones(session.id)[0].placement_attempt).toEqual(approved.placement!.attempts[0]);
  });
  it("instructs the tutor to use new cases and not treat placement as readiness evidence", () => {
    const approved = approveLearningPlan(track, [attempt()], new Set());
    const prompt = buildSocraticSystemPrompt(seed(approved)[0]);
    expect(prompt).toContain("STARTING-POINT CHECK — NOT MASTERY EVIDENCE");
    expect(prompt).toContain("do not repeat the placement question");
    expect(prompt).toContain("It cannot approve this concept or its prerequisites");
  });
  it("offers optional checks for a single-concept plan and no promise of fixed duration", () => {
    const html = renderToStaticMarkup(<PlanApproval track={{ ...track, milestones: [track.milestones[0]] }} onApprove={vi.fn()} onRevise={vi.fn()} />);
    expect(html).toContain("Find my starting point");
    expect(html).toContain("Approve plan &amp; start");
    expect(html).not.toContain("60s");
    expect(html).not.toContain("Skipped (know this)");
    expect(html).not.toContain(check.explanation);
  });
});

