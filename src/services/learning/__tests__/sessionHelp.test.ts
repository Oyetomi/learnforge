import { afterEach, describe, expect, it, vi } from "vitest";
import { helpRequest, readHelp, saveHelp } from "../sessionHelp";
import { canRestorePosition, readSessionPosition, saveSessionPosition } from "../sessionPosition";
import { splitLessonIntoActivities } from "../steps";
import type { LearningCheck } from "../../../types";
afterEach(() => vi.unstubAllGlobals());
const storage = () => { const data = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }); return data; };
describe("help remains outside learning progression", () => {
  it("sends only the visible question and context, withholding answer keys and authored explanations", () => {
    const check = { id: "q", question: "Which grouping fits?", context: "Two equal groups.", options: [{ id: "secret", label: "answer" }], correctOptionIds: ["secret"], explanation: "PRIVATE_KEY", multiple: false, milestoneId: "m" } as LearningCheck;
    for (const kind of ["hint", "walkthrough", "visual"] as const) {
      const request = helpRequest(kind, null, check, 'Current idea\n```forge-check\n{"explanation":"PRIVATE_KEY"}\n```', false);
      expect(request[0].content).toContain("Never start a new lesson");
      expect(request[0].content).toContain("Do not reveal the answer");
      expect(request[1].content).toContain("Which grouping fits?");
      expect(request[1].content).not.toContain("PRIVATE_KEY");
      expect(request[1].content).not.toContain("correctOptionIds");
    }
  });
  it("keeps generated help scoped to its activity and kind and rejects malformed cached content", () => {
    const data = storage(); saveHelp("lesson:q1:hint", { content: "Consider the grouping." });
    expect(readHelp("lesson:q1:hint")?.content).toBe("Consider the grouping.");
    expect(readHelp("lesson:q2:hint")).toBeNull(); expect(readHelp("lesson:q1:visual")).toBeNull();
    data.set("learnforge:help:bad", JSON.stringify({ content: 123 })); expect(readHelp("bad")).toBeNull();
    data.set("learnforge:help:huge", JSON.stringify({ content: "x".repeat(60001) })); expect(readHelp("huge")).toBeNull();
  });
  it("restores reading and help positions without modifying a question draft", () => {
    const data = storage(); data.set("learnforge:check-draft:q", "selected-answer");
    const position = { activity: "check" as const, stepIndex: 2, replyIndex: 1, replyId: "r", questionId: "q", scrollTop: 275, helpKind: "walkthrough" as const, helpOpen: true };
    saveSessionPosition("track:lesson", position); expect(readSessionPosition("track:lesson")).toEqual(position);
    expect(canRestorePosition(position, { hasLesson: true, hasVisual: false, questionId: "q" })).toBe(true);
    expect(canRestorePosition(position, { hasLesson: true, hasVisual: false, questionId: "new-question" })).toBe(false);
    expect(canRestorePosition({ ...position, activity: "visual" }, { hasLesson: true, hasVisual: false })).toBe(false);
    expect(readSessionPosition("other:lesson")).toBeNull(); expect(data.get("learnforge:check-draft:q")).toBe("selected-answer");
    data.set("learnforge:session-position:bad", '{"activity":"execute-script"}'); expect(readSessionPosition("bad")).toBeNull();
  });
  it("keeps a brief introductory sentence with the first teaching idea", () => {
    const intro = "Greetings depend on who you are speaking to.";
    expect(splitLessonIntoActivities(intro + "\n\n## The greeting\n\nA concrete example.\n\n## Apply it\n\nTry a new situation.")).toEqual([
      intro + "\n\n## The greeting\n\nA concrete example.", "## Apply it\n\nTry a new situation."
    ]);
    const long = "A substantial introduction with its own explanation. ".repeat(10);
    expect(splitLessonIntoActivities(long + "\n\n## Next idea\n\nContinue.")).toHaveLength(2);
  });
  it("groups a concept's prose, code and explanation together rather than paginating paragraphs", () => {
    const first = "## One idea\n\nIntroduce it.\n\n```text\nexample\n\nmore\n```\n\nExplain the result.";
    expect(splitLessonIntoActivities(first + "\n\n---\n\n## Apply it\n\nA new task.")).toEqual([first, "## Apply it\n\nA new task."]);
    expect(splitLessonIntoActivities("**Understand it**\n\nFirst paragraph.\n\nSecond paragraph.\n\n**Apply it**\n\nTry the idea.")).toEqual(["**Understand it**\n\nFirst paragraph.\n\nSecond paragraph.", "**Apply it**\n\nTry the idea."]);
  });
});
