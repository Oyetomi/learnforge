import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearConceptLedger,
  importNotesIntoLedger,
  loadConceptLedger,
  recordDemonstratedConcept,
  relevantPriorConcepts,
  removeTrackConcepts,
} from "../conceptLedger";
import { generateCurriculumOutline } from "../../ai/curriculumOutline";
import { buildSocraticSystemPrompt } from "../../ai/prompts";

beforeEach(() => {
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
});

afterEach(() => vi.unstubAllGlobals());

describe("Cross-topic ConceptLedger", () => {
  it("records, deduplicates by milestone, and matches relevant prior concepts across topics", () => {
    recordDemonstratedConcept({
      title: "Unbuffered Go channels",
      outcome: "Predict synchronization when sender and receiver meet",
      trackId: "track-go-basics",
      trackTitle: "Go Concurrency Foundations",
      milestoneId: "m-chan-1",
      language: "go",
      source: "readiness",
      demonstratedAt: 100,
    });
    // Re-verifying in retention updates the same milestone entry instead of duplicating
    recordDemonstratedConcept({
      title: "Unbuffered Go channels",
      outcome: "Predict synchronization when sender and receiver meet",
      trackId: "track-go-basics",
      trackTitle: "Go Concurrency Foundations",
      milestoneId: "m-chan-1",
      language: "go",
      source: "retention",
      demonstratedAt: 200,
    });
    recordDemonstratedConcept({
      title: "Respectful morning greetings",
      outcome: "Use Ẹ káàárọ̀ appropriately with elders",
      trackId: "track-yoruba",
      trackTitle: "Everyday Yoruba",
      milestoneId: "m-yoruba-1",
      source: "readiness",
      demonstratedAt: 150,
    });

    const all = loadConceptLedger();
    expect(all).toHaveLength(2);
    expect(all[0].source).toBe("retention");

    const goMatches = relevantPriorConcepts(
      "Build a Go worker pool with channels and cancellation"
    );
    expect(goMatches.map((m) => m.milestoneId)).toEqual(["m-chan-1"]);

    const yorubaMatches = relevantPriorConcepts(
      "Yoruba family greetings and polite requests"
    );
    expect(yorubaMatches.map((m) => m.milestoneId)).toEqual(["m-yoruba-1"]);
  });

  it("imports structured Markdown study notes and distinguishes them from practice-verified concepts", () => {
    const added = importNotesIntoLedger(
      "Distributed Systems Notes.md",
      `# Consensus Basics
- **Quorum intersection**: Any two majority quorums share at least one node.
- **Leader lease**: Time-bounded authority requires bounded clock drift assumptions.
`
    );
    expect(added).toBe(2);
    const matches = relevantPriorConcepts("Raft quorum leader election");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].source).toBe("imported");
  });

  it("removes only the deleted topic's concepts on removeTrackConcepts and supports full clear", () => {
    recordDemonstratedConcept({
      title: "Concept A",
      outcome: "Apply concept A",
      trackId: "topic-a",
      trackTitle: "Topic A",
      source: "readiness",
    });
    recordDemonstratedConcept({
      title: "Concept B",
      outcome: "Apply concept B",
      trackId: "topic-b",
      trackTitle: "Topic B",
      source: "readiness",
    });

    removeTrackConcepts("topic-a");
    expect(loadConceptLedger().map((e) => e.trackId)).toEqual(["topic-b"]);

    clearConceptLedger();
    expect(loadConceptLedger()).toEqual([]);
  });

  it("injects matching prior concepts into curriculum outline generation and Socratic system prompts", async () => {
    recordDemonstratedConcept({
      title: "Gradient descent step size",
      outcome: "Explain why oversized learning rates oscillate across a convex valley",
      trackId: "track-ml-1",
      trackTitle: "Optimization Basics",
      milestoneId: "m-opt-1",
      source: "readiness",
    });

    const prompt = buildSocraticSystemPrompt({
      id: "m-adam-1",
      session_id: "s2",
      title: "Adaptive learning rates in Adam",
      prompt: "Compare momentum and per-parameter step size scaling",
      starter_code: "",
      status: "active",
      created_at: 0,
    });
    expect(prompt).toContain("PRIOR DEMONSTRATED CONCEPTS ACROSS SESSIONS");
    expect(prompt).toContain("Gradient descent step size");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Modern Optimizers",
                  destination: "Tune adaptive optimizers",
                  practice_mode: "general",
                  language: null,
                  exclusions: [],
                  modules: [
                    {
                      title: "Momentum",
                      outcome: "Dampen oscillation",
                      units: [
                        {
                          id: "u1",
                          title: "Velocity accumulation",
                          outcome: "Predict momentum updates",
                          assessment: "Trace two steps",
                          prerequisite_ids: [],
                        },
                      ],
                    },
                    {
                      title: "Adam",
                      outcome: "Combine first and second moments",
                      units: [
                        {
                          id: "u2",
                          title: "Bias correction",
                          outcome: "Explain early-step bias correction",
                          assessment: "Compare corrected vs uncorrected",
                          prerequisite_ids: ["u1"],
                        },
                      ],
                    },
                  ],
                }),
              },
            },
          ],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateCurriculumOutline({
      topic: "Adaptive learning rates and Adam optimization",
      destination: "Choose and debug optimizer hyperparameters",
      startingPoint: "I know the basics and want to apply them",
    });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages[1].content).toContain("priorDemonstratedConcepts");
    expect(sentBody.messages[1].content).toContain("Gradient descent step size");
  });
});
