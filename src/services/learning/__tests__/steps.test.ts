import { describe, expect, it } from "vitest";
import { splitLessonIntoSteps } from "../steps";

describe("splitLessonIntoSteps", () => {
  it("returns no steps for empty lessons", () => {
    expect(splitLessonIntoSteps(undefined)).toEqual([]);
    expect(splitLessonIntoSteps("   ")).toEqual([]);
  });

  it("groups prose into steps of two paragraphs", () => {
    const steps = splitLessonIntoSteps("A.\n\nB.\n\nC.\n\nD.\n\nE.");
    expect(steps).toEqual(["A.\n\nB.", "C.\n\nD.", "E."]);
  });

  it("keeps fenced code intact, including blank lines inside it", () => {
    const md =
      "Intro.\n\n```go\nfunc a() {}\n\nfunc b() {}\n```\n\nNext.\n\nMore.";
    const steps = splitLessonIntoSteps(md);
    expect(steps[0]).toContain("func a() {}\n\nfunc b() {}");
    expect(steps[0].startsWith("Intro.")).toBe(true);
    expect(steps).toHaveLength(2);
  });

  it("attaches lists to the introducing paragraph and starts a step at headings", () => {
    const md = "One.\n\nTwo.\n\n- x\n- y\n\n## Part 2\n\nThree.";
    const steps = splitLessonIntoSteps(md);
    expect(steps[0]).toBe("One.\n\nTwo.\n\n- x\n- y");
    expect(steps[1]).toBe("## Part 2\n\nThree.");
  });
});

it("paginates prose, code and the following explanation into separate slides without splitting a code fence", async () => {
  const { splitLessonIntoSlides } = await import("../steps");
  const code =
    "```go\nswitch {\ncase n > 2:\n    score = 3\n\ndefault:\n    score = 0\n}\n```";
  expect(
    splitLessonIntoSlides(
      "## First match wins\n\nCheck the cases from top to bottom.\n\n" +
        code +
        "\n\nOnly the first true branch runs."
    )
  ).toEqual([
    "## First match wins\n\nCheck the cases from top to bottom.",
    code,
    "Only the first true branch runs.",
  ]);
});
