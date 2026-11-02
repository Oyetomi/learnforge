import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { CheckAttempt, LearningCheck } from "../../../types";
import { parseKnowledgeExtraction, practicePrefix, type KnowledgeGraph } from "../knowledgeGraph";
import { disputePracticeAttempt, loadKnowledgePractices, outcomeFor, practiceRecommendations, practiceReferences, recordPracticeAttempt, saveKnowledgePractice, startKnowledgePractice } from "../knowledgePractice";
import { questionReviewIdentity } from "../questionReview";
let values: Map<string, string>;
let graph: KnowledgeGraph;
beforeEach(() => {
    values = new Map();
    vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k), key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; } });
    graph = parseKnowledgeExtraction({ propositions: [{ id: "p", statement: "Two equal groups of three contain six objects.", anchors: [{ sourceId: "s", quote: "Two groups of three contain six objects." }] }], arguments: [] }, "topic", [{ id: "s", title: "Groups", kind: "lesson", text: "Two groups of three contain six objects." }])!;
});
afterEach(() => vi.unstubAllGlobals());
function fixture(practice: "independent" | "guided" = "independent") {
    const session = startKnowledgePractice(graph, "Equal groups", [graph.propositions[0].id]);
    const check: LearningCheck = { id: `practice:${session.id}:q`, milestoneId: `practice:${session.id}:idea`, question: "How many objects are in two groups of three?", options: [{ id: "six", label: "Six" }, { id: "nine", label: "Nine" }], correctOptionIds: ["six"], multiple: false, explanation: "Combine the groups.", practice };
    const round = { id: "round", targetId: session.targetIds[0], check };
    session.rounds = [round];
    const attempt: CheckAttempt = { checkId: check.id, milestoneId: check.milestoneId, selectedIds: ["six"], thinking: "Three and three", correct: true, confidence: "confident", dontKnow: false, submittedAt: 1, questionReview: { identity: questionReviewIdentity(check, practiceReferences(graph, session.targetIds)), model: "fixture", reviewedAt: 1 } };
    return { session, round, attempt };
}
it("snapshots selected material, saves and resumes a question and its original answer", () => {
    const { session, attempt } = fixture();
    const next = recordPracticeAttempt(session, "round", attempt);
    saveKnowledgePractice(next);
    expect(loadKnowledgePractices("topic")[0]).toEqual(next);
    expect(loadKnowledgePractices("other")).toEqual([]);
    expect(outcomeFor(next, next.rounds[0])).toBe("independent");
    expect(recordPracticeAttempt(next, "round", { ...attempt, response: "second overwrite" })).toBe(next);
});
it("rejects unreviewed or mismatched attempts and recomputes a false correctness flag", () => {
    const { session, attempt } = fixture();
    expect(recordPracticeAttempt(session, "round", { ...attempt, questionReview: undefined })).toBe(session);
    expect(recordPracticeAttempt(session, "round", { ...attempt, checkId: "different" })).toBe(session);
    const wrong = recordPracticeAttempt(session, "round", { ...attempt, selectedIds: ["nine"], correct: true });
    expect(wrong.rounds[0].attempt?.correct).toBe(false);
    expect(outcomeFor(wrong, wrong.rounds[0])).toBe("needs-work");
});
it("keeps hints, retries, uncertainty and guided success separate from unaided correct applications", () => {
    for (const patch of [{ assisted: true }, { confidence: "unsure" as const }, { retriedOptionIds: ["nine"] }, { visualSupportIds: ["source"] }]) {
        const { session, attempt } = fixture();
        const next = recordPracticeAttempt(session, "round", { ...attempt, ...patch });
        expect(outcomeFor(next, next.rounds[0])).toBe("supported");
    }
    const { session, attempt } = fixture("guided");
    const next = recordPracticeAttempt(session, "round", attempt);
    expect(outcomeFor(next, next.rounds[0])).toBe("supported");
});
it("removes disputed credit immediately and after reload, without touching curriculum records", () => {
    const { session, attempt } = fixture();
    const next = recordPracticeAttempt(session, "round", attempt);
    next.rounds[0].feedback = "Old explanation";
    const disputed = disputePracticeAttempt(next, "round");
    saveKnowledgePractice(disputed);
    expect(outcomeFor(disputed, disputed.rounds[0])).toBe("unresolved");
    expect(disputed.rounds[0].feedback).toBeUndefined();
    const restored = loadKnowledgePractices("topic")[0];
    expect(outcomeFor(restored, restored.rounds[0])).toBe("unresolved");
    expect([...values.keys()]).toEqual([practicePrefix("topic") + session.id]);
});
it("retains historical review bindings when the selected provider changes", () => {
    const { session, attempt } = fixture();
    const next = recordPracticeAttempt(session, "round", attempt);
    const identity = JSON.parse(attempt.questionReview!.identity);
    identity[5] = "earlier-provider";
    identity[6] = "https://earlier.invalid/v1";
    identity[7] = "earlier-model";
    next.rounds[0].attempt!.questionReview!.identity = JSON.stringify(identity);
    expect(outcomeFor(next, next.rounds[0])).toBe("independent");
    next.rounds[0].check.question = "A changed question?";
    expect(outcomeFor(next, next.rounds[0])).toBe("unresolved");
});
it("prioritizes difficulty and does not mix records from another topic", () => {
    const { session, attempt } = fixture();
    const wrong = recordPracticeAttempt(session, "round", { ...attempt, selectedIds: ["nine"] });
    expect(practiceRecommendations(graph, [wrong])).toEqual(session.targetIds);
    expect(() => startKnowledgePractice(graph, "Topic", ["unknown"])).toThrow();
});
it("ignores corrupt stored practice without deleting it", () => {
    const key = practicePrefix("topic") + "bad";
    values.set(key, JSON.stringify({ version: 1, trackId: "topic", status: "active", targetIds: ["p"], rounds: [], material: { trackId: "topic" } }));
    expect(loadKnowledgePractices("topic")).toEqual([]);
    expect(values.has(key)).toBe(true);
});
it("rejects damaged attempt metadata and grades during hydration without destroying saved records", () => {
    const { session, attempt } = fixture();
    const next = recordPracticeAttempt(session, "round", attempt);
    const key = practicePrefix("topic") + next.id;
    for (const damage of [(s: any) => s.rounds[0].attempt.milestoneId = "elsewhere", (s: any) => s.rounds[0].attempt.grading = { status: "correct", feedback: "ok", criteria: "bad" }, (s: any) => s.updatedAt = "invalid", (s: any) => s.targetIds.push(s.targetIds[0])]) {
        const broken = JSON.parse(JSON.stringify(next));
        damage(broken);
        values.set(key, JSON.stringify(broken));
        expect(loadKnowledgePractices("topic")).toEqual([]);
        expect(values.has(key)).toBe(true);
    }
});
it("freezes the run's material independently of later map changes", () => {
    const { session } = fixture();
    const original = session.material.propositions[0].statement;
    graph.propositions[0].statement = "A later edited statement should not replace practice material.";
    expect(session.material.propositions[0].statement).toBe(original);
});
