import { afterEach, describe, expect, it, vi } from "vitest";
import {
  proposeLearningScope,
  generateCurriculumOutline,
  prepareCurriculumUnit,
  trackFromOutline,
} from "../curriculumOutline";
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    })
  );
const check = {
  question: "Which opening fits this situation?",
  options: [
    { id: "a", label: "A familiar opening" },
    { id: "b", label: "An unrelated response" },
  ],
  correctOptionIds: ["a"],
  multiple: false,
  explanation: "The opening fits the stated situation.",
};
afterEach(() => vi.unstubAllGlobals());
describe("scope and on-demand teaching", () => {
  it("preserves a broad nontechnical goal when recommending scope and propagates cancellation", async () => {
    const controller = new AbortController(),
      fetch = vi.fn().mockResolvedValue(
        response({
          scope: "curriculum",
          reason: "This goal spans several connected abilities.",
        })
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await proposeLearningScope(
          "Everyday Yoruba for my family",
          controller.signal
        )
      ).scope
    ).toBe("curriculum");
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.messages[1].content).toContain(
      "Everyday Yoruba for my family"
    );
    expect(payload.messages[0].content).not.toContain("Suggest 3");
  });
  it("repairs one invalid outline and revalidates it before approval", async () => {
    const valid = {
      title: "A bounded path",
      destination: "Use the idea in a new situation",
      practice_mode: "general",
      language: null,
      exclusions: [],
      modules: [
        {
          title: "Foundation",
          outcome: "Explain the first distinction",
          units: [
            {
              id: "a",
              title: "First distinction",
              outcome: "Identify the first distinction",
              assessment: "Identify it in a new case",
              prerequisite_ids: [],
            },
          ],
        },
        {
          title: "Application",
          outcome: "Apply the distinction",
          units: [
            {
              id: "b",
              title: "Apply it",
              outcome: "Choose a useful application",
              assessment: "Explain a new choice",
              prerequisite_ids: ["a"],
            },
          ],
        },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ title: "Incomplete" }))
      .mockResolvedValueOnce(response(valid));
    vi.stubGlobal("fetch", fetch);
    const status = vi.fn();
    const result = await generateCurriculumOutline(
      {
        topic: "A broad goal",
        destination: "Apply it",
        startingPoint: "Beginning",
      },
      status
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith(expect.stringContaining("Correcting"));
    expect(result.curriculum?.originalGoal).toBe("A broad goal");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => response({ title: "Still incomplete" }))
    );
    await expect(
      generateCurriculumOutline({
        topic: "A broad goal",
        destination: "Apply it",
        startingPoint: "Beginning",
      })
    ).rejects.toThrow("incomplete");
  });
  it("rejects malformed scope recommendations", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ scope: "catalog", reason: "Some topics" })
        )
    );
    await expect(proposeLearningScope("One question")).rejects.toThrow(
      "incomplete"
    );
  });
  it("prepares only the requested outcome and retains approved scope in the tutor context", async () => {
    const t = trackFromOutline(
      {
        title: "Communication",
        destination: "Handle an everyday exchange",
        practice_mode: "general",
        exclusions: ["Specialist analysis"],
        modules: [
          {
            title: "Begin",
            outcome: "Understand the situation",
            units: [
              {
                id: "a",
                title: "Identify a purpose",
                outcome: "Identify the purpose of an exchange",
                assessment: "Identify it in a new exchange",
                prerequisite_ids: [],
              },
            ],
          },
          {
            title: "Respond",
            outcome: "Choose a useful reply",
            units: [
              {
                id: "b",
                title: "Reply",
                outcome: "Respond to a familiar opening",
                assessment: "Choose a reply in a new situation",
                prerequisite_ids: ["a"],
              },
            ],
          },
        ],
      },
      {
        topic: "Everyday Yoruba",
        startingPoint: "Beginning",
        destination: "Speak with family",
      }
    );
    const fetch = vi.fn().mockResolvedValue(
      response({
        title: "One unit",
        practice_mode: "general",
        language: null,
        milestones: [
          {
            id: "only",
            title: "Identify a purpose",
            prompt: "Identify the purpose",
            lesson: "Start with one short familiar exchange.",
            check,
            prerequisite_ids: [],
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetch);
    const prepared = await prepareCurriculumUnit(
      t,
      t.milestones[0].id,
      new AbortController().signal
    );
    expect(prepared.id).toBe(t.milestones[0].id);
    expect(prepared.title).toBe(t.milestones[0].title);
    expect(prepared.contentStatus).toBe("ready");
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.messages[0].content).toContain("EXACTLY ONE");
    expect(payload.messages[0].content).toContain("Specialist analysis");
    expect(t.milestones[0].contentStatus).toBe("outline");
  });
  it("propagates cancellation rather than silently substituting a fabricated lesson", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      proposeLearningScope("A goal", new AbortController().signal)
    ).rejects.toThrow("Aborted");
  });
});
