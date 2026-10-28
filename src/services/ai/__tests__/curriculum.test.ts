import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCustomTrack } from "../curriculum";

const milestone = {
  title: "Build a component",
  prompt: "Implement the component.",
  starter_code: "const value = 1;",
  test_code: "assert(value === 1);",
};
const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }));
afterEach(() => vi.unstubAllGlobals());

describe("custom track creation", () => {
  it("preserves the selected topic and cancellation signal in its request", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue(
      reply(
        JSON.stringify({
          title: "A test track",
          language: "typescript",
          practice_mode: "coding",
          milestones: [milestone, milestone, milestone],
        })
      )
    );
    vi.stubGlobal("fetch", fetch);
    const track = await generateCustomTrack({
      topic: "Build a queue",
      signal: controller.signal,
    });
    expect(track.milestones).toHaveLength(3);
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
    expect(
      JSON.parse(fetch.mock.calls[0][1].body).messages[1].content
    ).toContain("Build a queue");
  });
  it("accepts question-first lessons without mandatory code and validates their keys", async () => {
    const check = {
      question: "Which update is valid?",
      options: [
        { id: "a", label: "Increment" },
        { id: "b", label: "Reset" },
      ],
      correctOptionIds: ["a"],
      explanation: "The invariant requires increasing state.",
      multiple: false,
    };
    const lesson = {
      title: "State transitions",
      prompt: "Understand the invariant.",
      lesson: "A short explanation.",
      check,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          reply(JSON.stringify({ milestones: [lesson, lesson, lesson] }))
        )
    );
    const track = await generateCustomTrack({ topic: "State machines" });
    expect(track.milestones[0].check?.question).toBe(check.question);
    expect(track.milestones[0].starter_code).toBe("");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reply(
          JSON.stringify({
            milestones: [
              lesson,
              lesson,
              {
                ...lesson,
                check: { ...check, correctOptionIds: ["missing"] },
              },
            ],
          })
        )
      )
    );
    await expect(
      generateCustomTrack({ topic: "State machines" })
    ).rejects.toThrow("a complete learning plan");
  });
  it("rejects an incomplete plan instead of opening an empty workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply(JSON.stringify({ milestones: [] })))
    );
    await expect(generateCustomTrack({ topic: "Queues" })).rejects.toThrow(
      "a complete learning plan"
    );
  });
  it("reports an incomplete response without exposing JSON parser internals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply('{"milestones":')));
    await expect(generateCustomTrack({ topic: "Queues" })).rejects.toThrow(
      "incomplete learning plan"
    );
  });
  it("propagates cancellation so a closed dialog cannot create a track", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))
    );
    await expect(
      generateCustomTrack({ topic: "Queues", signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("preserves authored prerequisite branches and rejects a cyclic generated course", async () => {
  const lessons = [
    { ...milestone, id: "root", prerequisite_ids: [] },
    { ...milestone, id: "left", prerequisite_ids: ["root"] },
    { ...milestone, id: "right", prerequisite_ids: ["root"] },
  ];
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        reply(
          JSON.stringify({
            practice_mode: "coding",
            language: "typescript",
            milestones: lessons,
          })
        )
      )
  );
  const track = await generateCustomTrack({ topic: "Dependency graph" });
  expect(track.milestones[1].prerequisite_ids).toEqual([
    track.milestones[0].id,
  ]);
  expect(track.milestones[2].prerequisite_ids).toEqual([
    track.milestones[0].id,
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      reply(
        JSON.stringify({
          practice_mode: "coding",
          language: "typescript",
          milestones: [
            { ...lessons[0], prerequisite_ids: ["left"] },
            lessons[1],
            lessons[2],
          ],
        })
      )
    )
  );
  await expect(generateCustomTrack({ topic: "Invalid plan" })).rejects.toThrow(
    "invalid prerequisite"
  );
});

it("preserves a nontechnical original interest and disables programming even if the response includes stray code metadata", async () => {
  const fetch = vi.fn().mockResolvedValue(
    reply(
      JSON.stringify({
        title: "Everyday Yoruba greetings",
        practice_mode: "general",
        language: "go",
        milestones: [
          {
            title: "A first greeting",
            prompt: "Greet someone in Yoruba.",
            lesson: "A small exchange.",
            starter_code: "package main",
            test_code: "func TestGreeting() {}",
            check: {
              question: "Which greeting fits?",
              options: [
                { id: "a", label: "A greeting" },
                { id: "b", label: "A farewell" },
              ],
              correctOptionIds: ["a"],
              multiple: false,
              explanation: "This phrase starts an exchange.",
            },
          },
        ],
      })
    )
  );
  vi.stubGlobal("fetch", fetch);
  const track = await generateCustomTrack({
    topic: "Everyday greetings",
    interest: "I want to learn Yoruba language",
  });
  expect(track.language).toBeNull();
  expect(track.difficulty).toBe("Beginner");
  expect(track.learningIntent).toMatchObject({
    interest: "I want to learn Yoruba language",
    goal: "Everyday greetings",
    practiceMode: "general",
  });
  expect(track.milestones[0].starter_code).toBe("");
  expect(track.milestones[0].test_code).toBe("");
  const request = JSON.parse(fetch.mock.calls[0][1].body);
  expect(JSON.parse(request.messages[1].content).originalInterest).toBe(
    "I want to learn Yoruba language"
  );
  expect(request.messages[0].content).not.toContain(
    "systems programming courses for technical engineers"
  );
  expect(request.messages[0].content).toContain(
    "Do not recast ordinary learning as engineering"
  );
});


it.each([['C++', 'cpp'], ['SQL', 'sql'], ['Lua', 'lua'], ['Kotlin', 'kotlin']])(
  "preserves %s coding plans beyond the original five editor languages", async (generated, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(JSON.stringify({
      practice_mode: "coding", language: generated, milestones: [milestone],
    }))));
    const track = await generateCustomTrack({ topic: `Learn ${generated}` });
    expect(track.language).toBe(expected);
    expect(track.learningIntent?.programmingLanguage).toBe(expected);
  }
);
