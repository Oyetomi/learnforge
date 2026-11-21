import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { asksForCode, validateLearningCheck } from "../checks";
import { FreeResponseCard } from "../../../components/learning/FreeResponseCard";

const goTask = {
  kind: "free-response",
  question: "Write a complete, minimal Go program that declares `package main`, imports the `fmt` package, and prints a formatted message showing that a basketball player named Maya scored 24 points.",
  expectedAnswer: "```go\npackage main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Printf(\"%s scored %d points\\n\", \"Maya\", 24)\n}\n```",
  explanation: "Printf fills the verbs in order.",
  rubric: [{ id: "printf", criterion: "Uses fmt.Printf with a format verb" }],
};

describe("code answers", () => {
  it("recognises a write-the-program task, and keeps an explicit response kind", () => {
    expect(asksForCode(validateLearningCheck(goTask)!)).toBe(true);
    expect(validateLearningCheck({ ...goTask, response: "code" })!.response).toBe("code");
    expect(asksForCode(validateLearningCheck({ ...goTask, response: "text" })!)).toBe(false);
  });
  it("leaves prose questions alone", () => {
    const prose = { ...goTask, question: "Explain why the program prints a newline at the end.", expectedAnswer: "Because \\n ends the line." };
    expect(asksForCode(validateLearningCheck(prose)!)).toBe(false);
  });
  it("shows a code box without dictation", () => {
    const check = { ...validateLearningCheck(goTask)!, id: "c1", milestoneId: "m1" };
    const html = renderToStaticMarkup(
      <FreeResponseCard check={check} onSubmit={vi.fn()} onAskCoach={vi.fn()} onNewQuestion={vi.fn()} isBusy={false} language="go" />
    );
    expect(html).toContain("Write the code");
    expect(html).toContain("free-response-code");
    expect(html).toContain("Write your code here.");
    expect(html).not.toContain("Dictate your answer");
    expect(html).not.toContain("A short explanation is enough.");
  });
});
