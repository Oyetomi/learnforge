import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateBoundaryProbes,
  summarizeBoundaryProbes,
  validateBoundaryProbes,
} from "../preProbe";
import { generateCurriculumOutline } from "../curriculumOutline";

afterEach(() => vi.unstubAllGlobals());

const sampleProbes = {
  probes: [
    {
      id: "p1",
      tier: "foundation",
      conceptTested: "Term monotonicity",
      question: "What happens when a follower receives an AppendEntries RPC with a lower term?",
      options: [
        { id: "a", label: "It rejects the RPC and replies with its current higher term" },
        { id: "b", label: "It overwrites its local term to match the leader immediately" },
        { id: "c", label: "It buffers the log entry until the next election timeout" },
      ],
      correctOptionId: "a",
    },
    {
      id: "p2",
      tier: "intermediate",
      conceptTested: "Commit safety",
      question: "Why does Raft avoid committing entries from earlier terms by counting replicas alone?",
      options: [
        { id: "a", label: "An elected leader with a newer log term could still overwrite them" },
        { id: "b", label: "Followers delete uncommitted entries from prior terms on heartbeat" },
        { id: "c", label: "Snapshots cannot include entries written by an older leader" },
      ],
      correctOptionId: "a",
    },
  ],
};

describe("Pre-outline adaptive boundary probing", () => {
  it("validates well-formed diagnostic probes and rejects broken option keys", () => {
    const valid = validateBoundaryProbes(sampleProbes);
    expect(valid).toHaveLength(2);
    expect(valid?.[0].tier).toBe("foundation");

    expect(validateBoundaryProbes({ probes: [sampleProbes.probes[0]] })).toBeNull();
    expect(
      validateBoundaryProbes({
        probes: [
          { ...sampleProbes.probes[0], correctOptionId: "missing" },
          sampleProbes.probes[1],
        ],
      })
    ).toBeNull();
  });

  it("summarizes confident passes, low-confidence guesses, and frontier gaps with learner thinking", () => {
    const validated = validateBoundaryProbes(sampleProbes)!;
    const evidence = summarizeBoundaryProbes(validated, {
      p1: {
        selectedOptionId: "a",
        dontKnow: false,
        confidence: "confident",
        thinking: "Stale leaders must step down when seeing a higher term.",
      },
      p2: {
        selectedOptionId: "b",
        dontKnow: false,
        confidence: "unsure",
        thinking: "Not sure about the Figure 8 scenario.",
      },
    });

    expect(evidence.demonstratedBasics).toEqual(["Term monotonicity"]);
    expect(evidence.frontierGaps).toEqual(["Commit safety"]);
    expect(evidence.probes[0].outcome).toBe("correct-confident");
    expect(evidence.probes[0].learnerThinking).toContain("Stale leaders");
    expect(evidence.probes[1].outcome).toBe("incorrect");
    expect(evidence.summary).toContain("Term monotonicity");
    expect(evidence.summary).toContain("Commit safety");
  });

  it("fetches boundary probes and feeds boundaryEvidence into generateCurriculumOutline", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(sampleProbes) } }],
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Raft Safety & Replication",
                    destination: "Verify Raft log commitment invariants",
                    practice_mode: "general",
                    language: null,
                    exclusions: [],
                    modules: [
                      {
                        title: "Log Commitment Rules",
                        outcome: "Reason about Figure 8 commitment safety",
                        units: [
                          {
                            id: "u1",
                            title: "Current-term commitment rule",
                            outcome: "Identify when an entry is safely committed",
                            assessment: "Evaluate a 5-node cluster log state",
                            prerequisite_ids: [],
                          },
                        ],
                      },
                      {
                        title: "Cluster Membership",
                        outcome: "Handle joint consensus",
                        units: [
                          {
                            id: "u2",
                            title: "Configuration transitions",
                            outcome: "Prevent split majorities during reconfiguration",
                            assessment: "Trace a membership change",
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

    const probes = await generateBoundaryProbes({
      goal: "Raft consensus",
      destination: "Verify Raft log commitment invariants",
      startingPoint: "I know the basics and want to apply them",
    });
    expect(probes).toHaveLength(2);

    const boundaryEvidence = summarizeBoundaryProbes(probes, {
      p1: {
        selectedOptionId: "a",
        dontKnow: false,
        confidence: "confident",
        thinking: "",
      },
      p2: {
        selectedOptionId: null,
        dontKnow: true,
        confidence: null,
        thinking: "",
      },
    });

    await generateCurriculumOutline({
      topic: "Raft consensus",
      destination: "Verify Raft log commitment invariants",
      startingPoint: "I know the basics and want to apply them",
      boundaryEvidence,
    });

    const outlinePayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(outlinePayload.messages[0].content).toContain(
      "CALIBRATE TO DEMONSTRATED BOUNDARY"
    );
    expect(outlinePayload.messages[1].content).toContain("boundaryEvidence");
    expect(outlinePayload.messages[1].content).toContain("Term monotonicity");
  });
});
