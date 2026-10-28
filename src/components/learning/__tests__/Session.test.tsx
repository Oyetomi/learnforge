import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatPane } from "../../chat/ChatPane";
import type { Milestone } from "../../../types";

const milestone: Milestone = {
  id: "m1",
  session_id: "s1",
  title: "Worker Pool",
  prompt: "Use channels.",
  starter_code: "package main",
  status: "active",
  created_at: 0,
};
describe("one guided session", () => {
  it("keeps questions, explanation access, and the composer in one surface without teaching mode tabs", () => {
    const request = vi.fn();
    const html = renderToStaticMarkup(
      <ChatPane
        trackId="go-concurrency"
        activeMilestone={milestone}
        milestoneIndex={0}
        milestoneCount={3}
        messages={[]}
        isRequestingCheck={false}
        isStreaming={false}
        isCodeWorkspaceOpen={false}
        onToggleCode={vi.fn()}
        onRequestCheck={request}
        onSubmitCheck={vi.fn()}
        onContinueCheck={vi.fn()}
        onSendMessage={vi.fn()}
        onStopStreaming={vi.fn()}
        onOpenEditor={vi.fn()}
      />
    );
    expect(html).toContain("Guided learning session");
    expect(html).toContain("A worker pool reads jobs");
    expect(html).toContain("Continue to question");
    expect(html).toContain("Message your AI coach");
    expect(html).toContain("Saved explanations");
    expect(html).toContain("Coding practice");
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain("Private explanation");
    expect(request).not.toHaveBeenCalled();
  });
});

it("does not offer coding tools for a nontechnical lesson", () => {
  const html = renderToStaticMarkup(
    <ChatPane
      trackId="yoruba"
      allowCoding={false}
      activeMilestone={{
        ...milestone,
        title: "Everyday greetings",
        starter_code: "",
      }}
      milestoneIndex={0}
      milestoneCount={1}
      messages={[]}
      isRequestingCheck={false}
      isStreaming={false}
      isCodeWorkspaceOpen={false}
      onToggleCode={vi.fn()}
      onRequestCheck={vi.fn()}
      onSubmitCheck={vi.fn()}
      onContinueCheck={vi.fn()}
      onSendMessage={vi.fn()}
      onStopStreaming={vi.fn()}
      onOpenEditor={vi.fn()}
    />
  );
  expect(html).toContain("Everyday greetings");
  expect(html).toContain("Message your AI coach");
  expect(html).not.toContain("Coding practice");
  expect(html).not.toContain("Optional coding practice");
  expect(html).not.toContain("Open code workspace");
});

const props = {
  trackId: "custom-topic",
  activeMilestone: milestone,
  milestoneIndex: 0,
  milestoneCount: 1,
  messages: [],
  isRequestingCheck: false,
  isStreaming: false,
  isCodeWorkspaceOpen: false,
  onToggleCode: vi.fn(),
  onRequestCheck: vi.fn(),
  onSubmitCheck: vi.fn(),
  onContinueCheck: vi.fn(),
  onSendMessage: vi.fn(),
  onStopStreaming: vi.fn(),
  onOpenEditor: vi.fn(),
};
it("shows one explanation step instead of stacking the entire lesson and question", () => {
  const html = renderToStaticMarkup(
    <ChatPane
      {...props}
      activeMilestone={{
        ...milestone,
        lesson:
          "### First idea\n\nA small starting example.\n\n### Later idea\n\nA later explanation.",
        check: {
          question: "A future assessment",
          options: [
            { id: "a", label: "One" },
            { id: "b", label: "Two" },
          ],
          correctOptionIds: ["a"],
          multiple: false,
          explanation: "Hidden until submission.",
        },
      }}
    />
  );
  expect(html).toContain("A small starting example");
  expect(html).not.toContain("A later explanation");
  expect(html).not.toContain("A future assessment");
  expect(html).toContain("Continue");
});
it("opens a saved visual as its own activity without previous turns or the pending question below it", () => {
  const html = renderToStaticMarkup(
    <ChatPane
      {...props}
      messages={[
        {
          id: "old",
          session_id: "s1",
          milestone_id: "m1",
          role: "assistant",
          content: "An earlier long explanation.",
          created_at: 1,
        },
        {
          id: "current",
          session_id: "s1",
          milestone_id: "m1",
          role: "assistant",
          content: "An introduction to this visual.",
          created_at: 2,
          visual_example: {
            kind: "parts",
            title: "Current visual",
            summary: "One focused example.",
            items: [
              { id: "a", label: "A", description: "One part." },
              { id: "b", label: "B", description: "Another part." },
            ],
            takeaway: "A small distinction.",
          },
          learning_check: {
            id: "q",
            milestoneId: "m1",
            question: "The pending question",
            options: [
              { id: "a", label: "One" },
              { id: "b", label: "Two" },
            ],
            correctOptionIds: ["a"],
            multiple: false,
            explanation: "Hidden",
          },
        },
      ]}
    />
  );
  expect(html).toContain("Current visual");
  expect(html).toContain("Back to question");
  expect(html).not.toContain("An earlier long explanation");
  expect(html).not.toContain("The pending question");
  expect(html).not.toContain("An introduction to this visual");
});

it("restores the saved answer review rather than reopening an earlier visual", () => {
  const check = {
    id: "q",
    milestoneId: "m1",
    question: "A saved question",
    options: [
      { id: "a", label: "One" },
      { id: "b", label: "Two" },
    ],
    correctOptionIds: ["a"],
    multiple: false,
    explanation: "A concise explanation.",
  };
  const html = renderToStaticMarkup(
    <ChatPane
      {...props}
      messages={[
        {
          id: "question",
          session_id: "s1",
          milestone_id: "m1",
          role: "assistant",
          content: "A previous introduction.",
          created_at: 1,
          learning_check: check,
        },
        {
          id: "answer",
          session_id: "s1",
          milestone_id: "m1",
          role: "user",
          content: "My answer.",
          created_at: 2,
          check_attempt: {
            checkId: "q",
            milestoneId: "m1",
            selectedIds: ["a"],
            dontKnow: false,
            correct: true,
            thinking: "",
            confidence: "confident",
            submittedAt: 2,
          },
        },
      ]}
    />
  );
  expect(html).toContain("Review your answer");
  expect(html).toContain("A concise explanation.");
  expect(html).not.toContain("A previous introduction.");
  expect(html).toContain("check-answer-lines");
});

it("restores saved feedback after a failed follow-up instead of replacing it with an error reply", () => {
  const check = {
    id: "q-failure", milestoneId: "m1", question: "Which action fits?",
    options: [{ id: "a", label: "Wait for a receiver" }, { id: "b", label: "Drop the value" }],
    correctOptionIds: ["a"], multiple: false, explanation: "The sender waits for a receiver.",
  };
  const html = renderToStaticMarkup(<ChatPane {...props} onOpenSettings={vi.fn()} messages={[
    { id: "question", role: "assistant", session_id: "s1", milestone_id: "m1", created_at: 1, content: "Previous teaching.", learning_check: check },
    { id: "attempt", role: "user", session_id: "s1", milestone_id: "m1", created_at: 2, content: "My answer", check_attempt: {
      checkId: check.id, milestoneId: "m1", selectedIds: ["a"], dontKnow: false, thinking: "", confidence: null, correct: true, submittedAt: 2,
    } },
    { id: "error", role: "assistant", session_id: "s1", milestone_id: "m1", created_at: 3, content: "Connection details should stay in history.", generation_error: true },
  ]} />);
  expect(html).toContain("Review your answer");
  expect(html).toContain("Your answer is saved. Try Continue again.");
  expect(html).toContain("Check AI connection");
  expect(html).toContain("Wait for a receiver");
  expect(html).toContain("The sender waits for a receiver.");
  expect(html).not.toContain("Previous teaching.");
  expect(html).not.toContain("Connection details should stay in history.");
});
