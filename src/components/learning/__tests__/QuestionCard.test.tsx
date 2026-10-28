import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuestionCard } from "../QuestionCard";
import type { CheckAttempt, LearningCheck } from "../../../types";

const check: LearningCheck = {
  id: "q1",
  milestoneId: "m1",
  question: "What happens next?",
  options: [
    { id: "a", label: "Blocks the sender" },
    { id: "b", label: "Stores the value" },
  ],
  correctOptionIds: ["a"],
  multiple: false,
  explanation: "No receiver is ready, so the send waits.",
};
const render = (attempt?: CheckAttempt) =>
  renderToStaticMarkup(
    <QuestionCard
      check={check}
      attempt={attempt}
      isBusy={false}
      onSubmit={vi.fn()}
      onAskCoach={vi.fn()}
      onNewQuestion={vi.fn()}
      onContinue={vi.fn()}
    />
  );
const attempt: CheckAttempt = {
  checkId: "q1",
  milestoneId: "m1",
  selectedIds: ["b"],
  dontKnow: false,
  correct: false,
  thinking: "It has a buffer.",
  confidence: "confident",
  submittedAt: 0,
};
describe("question disclosure and feedback", () => {
  it("keeps partly correct multi-select choices editable during a supported retry", () => {
    const html = renderToStaticMarkup(<QuestionCard check={{ ...check, multiple: true,
      correctOptionIds: ["a", "b"], options: [...check.options, { id: "c", label: "Drops it" }] }}
      initialRetryIds={["a", "c"]} isBusy={false} onSubmit={vi.fn()} onAskCoach={vi.fn()} onNewQuestion={vi.fn()} />);
    expect(html).toContain("That combination");
    expect(html).not.toContain("is-eliminated");
    expect(html).toContain("Supported practice");
  });
  it("keeps the first answer and corrected retry distinct in saved feedback", () => {
    const html = render({ ...attempt, selectedIds: ["a"], retriedOptionIds: ["b"], correct: true, assisted: true });
    expect(html).toContain("Your first answer");
    expect(html).toContain("Your retry · supported practice");
    expect(html).toContain("Stores the value");
    expect(html).toContain("Blocks the sender");
  });
  it("keeps declarations in highlighted code panels rather than the question heading", () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        check={{
          ...check,
          question:
            "Given `type User struct{ name string }` with method `func (u *User) SetName(n string)`, which assignment compiles?",
        }}
        language="go"
        isBusy={false}
        onSubmit={vi.fn()}
        onAskCoach={vi.fn()}
        onNewQuestion={vi.fn()}
      />
    );
    const heading = html.split('role="heading"')[1].split("</div>")[0];
    expect(heading).toContain("SetName");
    expect(heading).not.toContain("struct");
    expect(html).toContain("snippet-editor");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("Given code");
    expect(html).not.toContain(check.explanation);
  });

  it("automatically syntax highlights raw unfenced code in check.context", () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        check={{
          ...check,
          context:
            'mux := http.NewServeMux() mux.HandleFunc("GET /posts/{$}", postsListHandler)\nmux.HandleFunc("GET /posts/{id}", postDetailHandler)',
          question: "Which handler executes for a request to 'GET /posts/'?",
        }}
        language="go"
        isBusy={false}
        onSubmit={vi.fn()}
        onAskCoach={vi.fn()}
        onNewQuestion={vi.fn()}
      />
    );
    expect(html).toContain("check-context");
    expect(html).toContain("snippet-editor");
    expect(html).toContain("hljs language-go");
    expect(html).toContain("postsListHandler");
  });

  it("shows choices and coach access without revealing the answer before submission", () => {
    const html = render();
    expect(html).toContain("What happens next?");
    expect(html).toContain("Ask a question first");
    expect(html).not.toContain(check.explanation);
    expect(html).not.toContain("Correct answer");
    expect(html).toContain('type="radio"');
    expect(html).toContain("Check answer");
  });
  it("keeps the submitted choice and explanation visible until explicit continuation", () => {
    const html = render(attempt);
    expect(html).toContain("Not quite");
    expect(html).toContain(check.explanation);
    expect(html).toContain("Correct answer");
    expect(html).toContain("Your answer · not correct");
    expect(html).toContain("Take a moment to review");
    expect(html).toContain("check-answer-lines");
    expect(html).toContain(">Continue<");
    expect(html).not.toContain("Continue lesson");
  });
  it("also pauses for review after a correct answer", () => {
    const html = render({ ...attempt, selectedIds: ["a"], correct: true });
    expect(html).toContain("That’s right");
    expect(html).toContain(">Continue<");
  });
  it("shows one feedback block with the correct answer after a wrong choice", () => {
    const html = render(attempt);
    expect(html).not.toContain("check-result-banner");
    expect(html).toContain("Correct answer");
    expect(html).toContain("Blocks the sender");
    expect(html.match(/Not quite/g)?.length).toBe(1);
  });
  it("shows keyboard hints only before answering", () => {
    expect(render()).toContain("check-key-hints");
    expect(render(attempt)).not.toContain("check-key-hints");
  });
  it("keeps Continue available while the next step is prepared in the background", () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        check={check}
        attempt={{ ...attempt, selectedIds: ["a"], correct: true }}
        isBusy={false}
        continuePending
        onSubmit={vi.fn()}
        onAskCoach={vi.fn()}
        onNewQuestion={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(html).toContain("being prepared");
    expect(html).toContain("animate-spin");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Continue/);
  });
  it("treats an explicit unknown as a learning attempt", () => {
    expect(render({ ...attempt, dontKnow: true, selectedIds: [] })).toContain(
      "Let’s work through it"
    );
  });

  it("offers a feedback-first retry before revealing the committed answer (#237)", () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        check={{
          ...check,
          hint: "Check whether any concurrent receiver is waiting on the channel.",
          options: [
            ...check.options,
            { id: "c", label: "Drops the value silently" },
          ],
        }}
        initialRetryIds={["b"]}
        isBusy={false}
        onSubmit={vi.fn()}
        onAskCoach={vi.fn()}
        onNewQuestion={vi.fn()}
      />
    );
    expect(html).toContain("check-retry-banner");
    expect(html).toContain("Repair your choice before seeing the committed answer");
    expect(html).toContain(
      "Check whether any concurrent receiver is waiting on the channel."
    );
    expect(html).toContain("is-eliminated");
    expect(html).toContain("Check retry");
    expect(html).toContain("Show full answer");
    expect(html).toContain("Supported practice");
    expect(html).not.toContain(check.explanation);
    expect(html).not.toContain("Correct answer");
  });

  it("supports recall-first mode and open-book vs closed-book status pills (#99, #176, #235)", () => {
    const closedBookHtml = renderToStaticMarkup(
      <QuestionCard
        check={check}
        assistedSoFar={false}
        isBusy={false}
        onSubmit={vi.fn()}
        onAskCoach={vi.fn()}
        onNewQuestion={vi.fn()}
      />
    );
    expect(closedBookHtml).toContain("is-closed-book");
    expect(closedBookHtml).toContain("Closed-book · mastery eligible");

    const recallHtml = renderToStaticMarkup(
      <QuestionCard
        check={check}
        assistedSoFar={true}
        initialChoicesHidden={true}
        isBusy={false}
        onSubmit={vi.fn()}
        onAskCoach={vi.fn()}
        onNewQuestion={vi.fn()}
      />
    );
    expect(recallHtml).toContain("is-open-book");
    expect(recallHtml).toContain("Supported practice");
    expect(recallHtml).toContain("check-recall-gate");
    expect(recallHtml).toContain("Reveal choices to compare");
    expect(recallHtml).not.toContain("Blocks the sender");
  });

  it("shows the Predict & Run sandbox check bar when a coding check includes a runnable snippet", () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        check={{
          ...check,
          context: '```go\npackage main\nimport "fmt"\nfunc main() { fmt.Println(42) }\n```',
        }}
        language="go"
        isBusy={false}
        onSubmit={vi.fn()}
        onAskCoach={vi.fn()}
        onNewQuestion={vi.fn()}
      />
    );
    expect(html).toContain("check-predict-run");
    expect(html).toContain("Predict &amp; run snippet in sandbox");
    expect(html).toContain("Run snippet");
  });
});
