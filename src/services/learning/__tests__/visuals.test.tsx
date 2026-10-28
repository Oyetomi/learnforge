import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualExample as VisualCard } from "../../../components/learning/VisualExample";
import { PhraseBuilder } from "../../../components/learning/TeachingSimulation";
import {
  extractVisualExample,
  validateVisualExample,
  type VisualExample,
} from "../visuals";
import { hideLearningCheckBlocks, learningEvidence } from "../checks";
import {
  loadLearningPreferences,
  saveLearningPreferences,
  recordVisualSupport,
  visualSupportFor,
  validatePreferences,
} from "../preferences";
import {
  buildSocraticSystemPrompt,
  formatConversationMessages,
} from "../../ai/prompts";
import type { ChatMessage } from "../../../types";
export const visual: VisualExample = {
  kind: "parts",
  title: "An everyday greeting",
  summary: "Ẹ káàárọ̀ is a respectful morning greeting.",
  items: [
    {
      id: "respect",
      label: "Ẹ",
      description: "The respectful form used here.",
    },
    {
      id: "morning",
      label: "káàárọ̀",
      description: "The morning greeting in this phrase.",
    },
  ],
  takeaway: "The whole phrase means good morning.",
};
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("visual teaching boundary", () => {
  it("validates the owned formats and preserves Yoruba diacritics", () => {
    for (const kind of ["parts", "comparison", "flow", "steps"])
      expect(validateVisualExample({ ...visual, kind })?.items[0].label).toBe(
        "Ẹ"
      );
    expect(
      extractVisualExample(
        "Here is a related example.\n```forge-visual\n" +
          JSON.stringify(visual) +
          "\n```"
      )
    ).toEqual(visual);
  });
  it("rejects unsupported formats, broken items and excessive content", () => {
    for (const data of [
      { ...visual, kind: "svg" },
      { ...visual, items: [] },
      { ...visual, items: [visual.items[0], visual.items[0]] },
      { ...visual, summary: "x".repeat(601) },
      {
        ...visual,
        items: [
          visual.items[0],
          { id: "two", label: "", description: "Missing label" },
        ],
      },
    ])
      expect(validateVisualExample(data)).toBeNull();
    expect(extractVisualExample("```forge-visual\n{\n```")).toBeNull();
  });
  it("renders model strings as text, drops arbitrary markup fields and provides a text equivalent", () => {
    const safe = validateVisualExample({
      ...visual,
      html: "<script>attack()</script>",
      title: "<img src=x onerror=attack()>",
    })!;
    expect(safe).not.toHaveProperty("html");
    const html = renderToStaticMarkup(
      <VisualCard visual={safe} visualId="test" />
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).toContain(visual.summary);
    expect(html).toContain('aria-pressed="true"');
  });
  it("never leaks complete or partial visual protocol into streamed prose", () => {
    for (const ending of [
      "",
      '\n{"kind":"parts"',
      "\n" + JSON.stringify(visual) + "\n```",
    ])
      expect(
        hideLearningCheckBlocks(
          "A short explanation.\n```forge-visual" + ending
        )
      ).toBe("A short explanation.");
    expect(
      hideLearningCheckBlocks(
        "Before.\n```forge-visual\n" + JSON.stringify(visual) + "\n```\nAfter."
      )
    ).toBe("Before.\n\nAfter.");
  });
  it("retains visual context in tutor conversation history", () => {
    const messages = formatConversationMessages(
      [
        {
          id: "v1",
          role: "assistant",
          session_id: "s",
          content: "Look at the phrase.",
          created_at: 0,
          visual_example: visual,
        },
      ],
      "System prompt"
    );
    expect(messages[1].content).toContain("forge-visual");
    expect(messages[1].content).toContain("káàárọ̀");
  });
});
describe("editable preferences and supported practice", () => {
  it("uses safe defaults for missing, malformed and old preferences", () => {
    localStorage.setItem("learnforge:learning-preferences", "{broken");
    expect(loadLearningPreferences().visuals).toBe("auto");
    expect(
      validatePreferences({
        pace: "overview",
        visuals: "invalid",
        examples: " x ".repeat(200),
      })
    ).toMatchObject({ pace: "overview", visuals: "auto" });
    expect(
      validatePreferences({ examples: "x".repeat(241) }).examples
    ).toHaveLength(240);
  });
  it("persists preferences and includes them as presentation choices rather than competence", () => {
    saveLearningPreferences({
      visuals: "ask",
      detail: "deeper",
      pace: "overview",
      examples: "Cooking",
    });
    expect(loadLearningPreferences()).toMatchObject({
      visuals: "ask",
      examples: "Cooking",
    });
    const prompt = buildSocraticSystemPrompt();
    expect(prompt).toContain("Cooking");
    expect(prompt).toContain("not learner types or competency evidence");
  });
  it("keeps visual support tied to one question and excludes supported success from independent evidence", () => {
    recordVisualSupport("q1", "v1");
    recordVisualSupport("q1", "v1");
    expect(visualSupportFor("q1")).toEqual(["v1"]);
    expect(visualSupportFor("q2")).toEqual([]);
    const attempt = (id: string, assisted: boolean): ChatMessage => ({
      id,
      session_id: "s",
      role: "user",
      content: "Answer",
      created_at: 0,
      check_attempt: {
        checkId: id,
        milestoneId: "m",
        selectedIds: ["a"],
        dontKnow: false,
        thinking: "",
        confidence: "confident",
        submittedAt: 0,
        correct: true,
        assisted,
        visualSupportIds: assisted ? ["v1"] : [],
      },
    });
    expect(
      learningEvidence([attempt("q1", true), attempt("q2", false)], "m")
        .readyToAdvance
    ).toBe(false);
    expect(
      learningEvidence(
        [attempt("q1", true), attempt("q2", false), attempt("q3", false)],
        "m"
      ).readyToAdvance
    ).toBe(true);
  });
  it("shows visual correctness indicators on tiles and observation box in PhraseBuilder", () => {
    const rightHtml = renderToStaticMarkup(
      <PhraseBuilder
        visual={visual}
        onInteract={vi.fn()}
        initialPlaced={["respect", "morning"]}
        initialChecked={true}
      />
    );
    expect(rightHtml).toContain("phrase-workbench is-correct");
    expect(rightHtml).toContain('class="is-right"');
    expect(rightHtml).toContain("phrase-tile-check");
    expect(rightHtml).toContain("lab-observation is-correct");
    expect(rightHtml).toContain("Correct — the phrase is in order.");

    const wrongHtml = renderToStaticMarkup(
      <PhraseBuilder
        visual={visual}
        onInteract={vi.fn()}
        initialPlaced={["morning", "respect"]}
        initialChecked={true}
      />
    );
    expect(wrongHtml).toContain("phrase-workbench is-wrong");
    expect(wrongHtml).toContain('class="is-wrong"');
    expect(wrongHtml).toContain("lab-observation is-wrong");
    expect(wrongHtml).toContain("Not quite — try a different order.");
  });
});
