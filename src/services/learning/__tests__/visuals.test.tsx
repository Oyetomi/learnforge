import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualExample as VisualCard } from "../../../components/learning/VisualExample";
import { PhraseBuilder } from "../../../components/learning/TeachingSimulation";
import { VisualRichText } from "../../../components/learning/VisualRichText";
import {
  extractVisualExample,
  hideCustomCanvasBlocks,
  visualForScientificPresentation,
  validateVisualExample,
  VISUAL_INSTRUCTIONS,
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
  it("typesets numeric results and spaced math without interpreting currency ranges as equations", () => {
    for (const text of ["$11$", "$2 x + 3$", "$\\frac{1}{2}$"])
      expect(renderToStaticMarkup(<VisualRichText text={text} />)).toContain('class="katex"');
    const currency = renderToStaticMarkup(<VisualRichText text="Between $10 and $20" />);
    expect(currency).not.toContain('class="katex"');
    expect(currency).toContain("Between $10 and $20");
  });
  it("rejects custom-runtime and legacy-card responses to an explicit typeset figure request", () => {
    const model = { version: 1, presentation: { style: "scientific", layout: "lanes" }, initialStateId: "before", entities: [{ id: "item", label: "Item" }], states: [
      { id: "before", label: "Before", description: "The item is waiting.", entities: [{ entityId: "item", status: "Waiting", value: "At source", tone: "waiting" }] },
      { id: "after", label: "After", description: "The item has arrived.", entities: [{ entityId: "item", status: "Received", value: "At destination", tone: "done" }] },
    ], transitions: [{ id: "move", from: "before", to: "after", label: "Move item", explanation: "The destination receives the item." }] };
    const figure = validateVisualExample({ ...visual, kind: "state-model", stateModel: model });
    expect(figure).not.toBeNull();
    expect(visualForScientificPresentation(figure)).toBe(figure);
    const frozen = validateVisualExample({ ...visual, kind: "state-model", stateModel: { ...model,
      states: model.states.map(state => ({ ...state, entities: model.states[0].entities })) } });
    expect(frozen).not.toBeNull();
    expect(visualForScientificPresentation(frozen)).toBeNull();
    const legacy = validateVisualExample({ ...visual, kind: "state-model", stateModel: { ...model, presentation: undefined } });
    expect(legacy).not.toBeNull();
    expect(visualForScientificPresentation(legacy)).toBeNull();
    expect(visualForScientificPresentation(visual)).toBeNull();
    expect(visualForScientificPresentation(validateVisualExample({ ...visual, kind: "canvas", canvas: { html: "<canvas></canvas>", js: "console.log('custom');" } }))).toBeNull();
    expect(visualForScientificPresentation(null)).toBeNull();
  });
  it("validates and extracts memory-model and timeline visuals and accepts them for scientific presentation", () => {
    const memoryModel = {
      version: 1,
      language: "rust",
      source: "let mut buf = vec![10, 20];\nbuf.push(30);",
      frames: [
        {
          id: "f1",
          label: "Initial allocation",
          explanation: "Stack frame owns a handle to the heap buffer.",
          codeLine: 1,
          blocks: [
            {
              id: "main",
              label: "buf header",
              region: "stack",
              kind: "slice",
              fields: [
                { name: "ptr", value: "-> buf[0]", pointsTo: "buf:0" },
                { name: "len", value: "2" },
              ],
              meta: "cap=4",
            },
            {
              id: "buf",
              label: "buf data",
              region: "heap",
              kind: "array",
              cells: [
                { index: "0", value: "10" },
                { index: "1", value: "20" },
                { index: "2", value: "", inactive: true },
              ],
            },
          ],
        },
        {
          id: "f2",
          label: "Append element",
          explanation: "The heap buffer grows in place.",
          codeLine: 2,
          blocks: [
            {
              id: "main",
              label: "buf header",
              region: "stack",
              kind: "slice",
              fields: [
                { name: "ptr", value: "-> buf[0]", pointsTo: "buf:0" },
                { name: "len", value: "3", changed: true },
              ],
              meta: "cap=4",
            },
            {
              id: "buf",
              label: "buf data",
              region: "heap",
              kind: "array",
              cells: [
                { index: "0", value: "10" },
                { index: "1", value: "20" },
                { index: "2", value: "30", highlight: true },
              ],
              changed: true,
            },
          ],
        },
      ],
    };

    const memoryVisual = validateVisualExample({
      ...visual,
      kind: "memory-model",
      memoryModel,
    });
    expect(memoryVisual).not.toBeNull();
    expect(memoryVisual?.kind).toBe("memory-model");
    expect(memoryVisual?.memoryModel?.frames).toHaveLength(2);
    expect(visualForScientificPresentation(memoryVisual)).toBe(memoryVisual);

    const memoryHtml = renderToStaticMarkup(
      <VisualCard visual={memoryVisual!} visualId="mem-render" language="rust" />
    );
    expect(memoryHtml).toContain("Initial allocation");
    expect(memoryHtml).not.toContain("Reset model");

    const inferredMemory = validateVisualExample({
      title: "Stack and heap layout",
      summary: "Step through how memory blocks change.",
      takeaway: "Separating stack handles from heap storage clarifies ownership.",
      ...memoryModel,
    });
    expect(inferredMemory?.kind).toBe("memory-model");
    expect(inferredMemory?.memoryModel?.frames).toHaveLength(2);

    const extractedMemory = extractVisualExample(
      "Trace the memory steps.\n```forge-visual\n" +
        JSON.stringify({ ...visual, kind: "memory-model", memoryModel }) +
        "\n```"
    );
    expect(extractedMemory?.kind).toBe("memory-model");
    expect(extractedMemory?.memoryModel?.frames[1].label).toBe("Append element");

    expect(
      validateVisualExample({
        ...visual,
        kind: "memory-model",
        memoryModel: { version: 1, frames: [] },
      })
    ).toBeNull();
    expect(
      visualForScientificPresentation({ ...visual, kind: "memory-model" })
    ).toBeNull();

    const timeline = {
      version: 1,
      actors: [
        { id: "producer", label: "Producer", role: "client" },
        { id: "consumer", label: "Consumer", role: "worker" },
      ],
      steps: [
        {
          id: "s1",
          label: "Dispatch message",
          explanation: "Producer sends work while Consumer waits.",
          lanes: [
            { actorId: "producer", state: "running", label: "Sending" },
            { actorId: "consumer", state: "waiting", label: "Idle" },
          ],
          messages: [{ from: "producer", to: "consumer", label: "job #1", kind: "send" }],
        },
        {
          id: "s2",
          label: "Process work",
          explanation: "Consumer runs the received job.",
          lanes: [
            { actorId: "producer", state: "done", label: "Sent" },
            { actorId: "consumer", state: "running", label: "Working" },
          ],
        },
      ],
    };

    const timelineVisual = validateVisualExample({
      ...visual,
      kind: "timeline",
      timeline,
    });
    expect(timelineVisual).not.toBeNull();
    expect(timelineVisual?.kind).toBe("timeline");
    expect(timelineVisual?.timeline?.actors).toHaveLength(2);
    expect(timelineVisual?.timeline?.steps).toHaveLength(2);
    expect(visualForScientificPresentation(timelineVisual)).toBe(timelineVisual);

    const timelineHtml = renderToStaticMarkup(
      <VisualCard visual={timelineVisual!} visualId="tl-render" />
    );
    expect(timelineHtml).toContain("Dispatch message");
    expect(timelineHtml).not.toContain("Reset model");

    const inferredTimeline = validateVisualExample({
      title: "Producer and consumer handoff",
      summary: "Follow how work moves across concurrent lanes.",
      takeaway: "Blocking ends once the matching receiver picks up the message.",
      ...timeline,
    });
    expect(inferredTimeline?.kind).toBe("timeline");
    expect(inferredTimeline?.timeline?.steps).toHaveLength(2);

    const extractedTimeline = extractVisualExample(
      "Watch the timeline.\n```forge-visual\n" +
        JSON.stringify({ ...visual, kind: "timeline", timeline }) +
        "\n```"
    );
    expect(extractedTimeline?.kind).toBe("timeline");
    expect(extractedTimeline?.timeline?.steps[0].label).toBe("Dispatch message");

    expect(
      validateVisualExample({
        ...visual,
        kind: "timeline",
        timeline: { version: 1, actors: [], steps: [] },
      })
    ).toBeNull();
    expect(
      visualForScientificPresentation({ ...visual, kind: "timeline" })
    ).toBeNull();

    // Ensure diagram remains non-scientific and VISUAL_INSTRUCTIONS documents the new archetypes neutrally
    const diagramVisual = validateVisualExample({
      ...visual,
      kind: "diagram",
      diagram: {
        direction: "LR",
        nodes: [
          { id: "a", label: "Client", detail: "Sends requests." },
          { id: "b", label: "Service", detail: "Processes requests." },
        ],
        edges: [{ from: "a", to: "b", label: "HTTP" }],
      },
    });
    expect(visualForScientificPresentation(diagramVisual)).toBeNull();
    expect(VISUAL_INSTRUCTIONS).toContain('kind="memory-model"');
    expect(VISUAL_INSTRUCTIONS).toContain('kind="timeline"');
    expect(VISUAL_INSTRUCTIONS).toContain("language- and subject-neutral");
    expect(VISUAL_INSTRUCTIONS).not.toContain("For Go channel");
  });

  it("keeps custom canvas responses out of a paper-figure turn, including while streaming", () => {
    for (const language of ["forge-canvas", "canvas-sim"]) {
      for (const fence of ["```", "````", "~~~", "~~~~"]) {
        expect(hideCustomCanvasBlocks(`Before.\n${fence}${language}\n{}\n${fence}\nAfter.`)).toBe("Before.\nAfter.");
        expect(hideCustomCanvasBlocks(`Before.\n${fence}${language}\n{`)).toBe("Before.");
      }
      for (const prefix of ["> ", "- ", "1. ", "- > ", "    "])
        expect(hideCustomCanvasBlocks(`Before.\n${prefix}~~~${language}\n${prefix}{}\n${prefix}~~~\nAfter.`)).toBe("Before.\nAfter.");
      for (const ending of ["", '\n{"html":"<button>Runtime</button>"', '\n{"html":"<button>Runtime</button>"}\n```'])
        expect(hideCustomCanvasBlocks(`A short explanation.\n\`\`\`${language}${ending}`)).toBe("A short explanation.");
      expect(hideCustomCanvasBlocks(`Before.\n\`\`\`${language}\n{}\n\`\`\`\nAfter.`)).toBe("Before.\nAfter.");
    }
    expect(hideCustomCanvasBlocks("```go\nfunc main() {}\n```" )).toContain("func main()");
    expect(hideCustomCanvasBlocks("````text\n```forge-canvas\n{}\n```\n````")).toContain("```forge-canvas");
  });
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
