import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import {
  contextLevel,
  contextWindowFor,
  rememberContextWindow,
} from "../connection";
import {
  estimatePromptTokens,
  formatConversationMessages,
} from "../prompts";
import type { ChatMessage, Milestone } from "../../../types";

const store = new Map<string, string>();

describe("context window telemetry", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses static sizes for known model families", () => {
    expect(contextWindowFor("gpt-6.1-sol")).toBe(500_000);
    expect(contextWindowFor("gpt-6-luna")).toBe(272_000);
    expect(contextWindowFor("claude-opus-5-5")).toBe(200_000);
    expect(contextWindowFor("google/gemini-4-argon")).toBe(1_000_000);
    expect(contextWindowFor("some-unknown-model")).toBe(128_000);
  });

  it("prefers live metadata when remembered", () => {
    rememberContextWindow("gpt-6-astra", 300_000);
    expect(contextWindowFor("gpt-6-astra")).toBe(300_000);
  });

  it("bands ring colour at 50% and 80%", () => {
    expect(contextLevel(0.1)).toBe("low");
    expect(contextLevel(0.5)).toBe("mid");
    expect(contextLevel(0.8)).toBe("mid");
    expect(contextLevel(0.81)).toBe("high");
  });

  it("windows stale unrelated-unit JSON payloads while preserving full active-unit and repair history", () => {
    const activeUnit: Milestone = {
      id: "unit-10",
      session_id: "s1",
      title: "Select Multiplexing",
      prompt: "Coordinate multiple channels.",
      starter_code: "package main",
      status: "active",
      created_at: 100,
    };

    const messages: ChatMessage[] = [];
    // 20 older turns across units 1..5 with bulky checks and internal prompts
    for (let u = 1; u <= 5; u++) {
      messages.push({
        id: `old-a-${u}`,
        session_id: "s1",
        milestone_id: `unit-${u}`,
        role: "assistant",
        content: `Explanation for unit ${u}.`,
        learning_check: {
          id: `chk-${u}`,
          milestoneId: `unit-${u}`,
          question: `Old question ${u}?`,
          context: "```go\n" + "// bulky context\n".repeat(30) + "```",
          options: [
            { id: "a", label: "Opt A" },
            { id: "b", label: "Opt B" },
          ],
          correctOptionIds: ["a"],
          explanation: "Old explanation",
          multiple: false,
        },
        created_at: u * 10,
      });
      messages.push({
        id: `old-internal-${u}`,
        session_id: "s1",
        milestone_id: `unit-${u}`,
        role: "user",
        internal: true,
        content: "PRIVATE ORCHESTRATION FOR OLD UNIT",
        created_at: u * 10 + 1,
      });
      messages.push({
        id: `old-u-${u}`,
        session_id: "s1",
        milestone_id: `unit-${u}`,
        role: "user",
        content: `Answer ${u}`,
        check_attempt: {
          checkId: `chk-${u}`,
          milestoneId: `unit-${u}`,
          selectedIds: ["a"],
          dontKnow: false,
          correct: true,
          thinking: "Old reasoning",
          confidence: "confident",
          submittedAt: u * 10 + 2,
        },
        created_at: u * 10 + 2,
      });
    }

    // Active unit turns (plus 8 more turns so older units sit outside the recent tail)
    for (let k = 1; k <= 9; k++) {
      messages.push({
        id: `active-${k}`,
        session_id: "s1",
        milestone_id: "unit-10",
        role: k % 2 === 1 ? "assistant" : "user",
        content: `Active turn ${k}`,
        ...(k === 1
          ? {
              learning_check: {
                id: "chk-active-1",
                milestoneId: "unit-10",
                question: "Which case fires in select?",
                options: [
                  { id: "a", label: "Ready channel" },
                  { id: "b", label: "Blocked channel" },
                ],
                correctOptionIds: ["a"],
                explanation: "Select chooses a ready communication.",
                multiple: false,
              },
            }
          : {}),
        created_at: 200 + k,
      });
    }

    const windowed = formatConversationMessages(messages, "SYS", activeUnit);
    const joined = windowed.map((m) => m.content).join("\n");

    // Active unit's first check (even though > 8 turns ago!) keeps full forge-check JSON
    expect(joined).toContain('"id":"chk-active-1"');
    // Old units omit bulky forge-check context & private internal orchestration prompts
    expect(joined).not.toContain("// bulky context");
    expect(joined).not.toContain("PRIVATE ORCHESTRATION FOR OLD UNIT");
    // Compact prior outcome summary is retained for recent prior units
    expect(joined).toContain("Prior check (chk-5): correct");
  });

  it("includes system instructions and structured check payloads in estimatePromptTokens", () => {
    const unit: Milestone = {
      id: "m1",
      session_id: "s1",
      title: "Borrowing",
      prompt: "Track shared borrows.",
      starter_code: "fn main() {}",
      status: "active",
      created_at: 1,
    };
    const tokens = estimatePromptTokens([], unit, "rust", null);
    // System instructions + active milestone context exceed 2,000 tokens
    expect(tokens).toBeGreaterThan(2000);
  });
});
