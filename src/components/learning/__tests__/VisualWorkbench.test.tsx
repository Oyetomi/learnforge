import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VisualExample as VisualSpec } from "../../../services/learning/visuals";

vi.mock("../CanvasSandbox", () => ({
  CanvasSandbox: ({ extraTools }: { extraTools?: React.ReactNode }) => (
    <div aria-label="Generated model">
      <details className="canvas-sandbox-tools">
        <summary aria-label="More visual options">More options</summary>
        <button>Restart simulation</button>
        {extraTools}
      </details>
    </div>
  ),
}));
vi.mock("../ScientificFigure", () => ({
  ScientificFigure: () => <div>Figure-owned explanation and history controls</div>,
}));
vi.mock("../SlopeGraph", () => ({
  SlopeGraph: () => <div>Graph-owned explanation and point controls</div>,
}));
vi.mock("../../../services/learning/speech", () => ({
  isSpeechOutputSupported: () => true,
  stopNaturalSpeech: vi.fn(),
  speakNaturalText: vi.fn(),
}));
import { VisualExample } from "../VisualExample";

const visual: VisualSpec = {
  kind: "canvas",
  title: "Two ways to move a value",
  summary: "Compare what each participant receives when you change the input.",
  canvas: { html: "<button>Change input</button>", js: "document.querySelector('button').onclick = () => {};" },
  items: [
    { id: "copy", label: "A separate copy", description: "The first participant keeps the value it received." },
    { id: "shared", label: "A shared value", description: "The other participant sees the latest value." },
  ],
  takeaway: "Check whether an action preserves a value or shares it.",
};

describe("visual workbench information hierarchy", () => {
  it("keeps one model reset and consolidates supporting text behind a closed disclosure", () => {
    const html = renderToStaticMarkup(
      <VisualExample visual={visual} visualId="copy-example" onRequestFreshVisual={() => {}} onTryFreshCase={() => {}} />
    );
    expect(html.match(/Restart simulation/g)).toHaveLength(1);
    expect(html).not.toContain("Reset model");
    expect(html).not.toContain("Start again");
    expect(html).not.toContain("Immersive Simulation");
    expect(html).not.toContain("Guided Layers");
    expect(html).not.toContain("<footer");
    expect(html).toContain('<details class="visual-workbench-explanation"><summary>How it works</summary>');
    expect(html).toContain(visual.items[0].description);
    expect(html).toContain(visual.takeaway);
    expect(html).not.toContain('class="visual-workbench-options"');
    expect(html.match(/aria-label="More visual options"/g)).toHaveLength(1);
    expect(html.match(/Redraw as a figure/g)).toHaveLength(1);
    expect(html).toContain("Redraw as a figure");
    expect(html).toContain("Listen to explanation");
    expect(html).toContain("Try another question");
  });

  it("lets the embedding view own its title and hides generation controls while busy", () => {
    const html = renderToStaticMarkup(
      <VisualExample visual={visual} visualId="embedded" embedded isBusy onRequestFreshVisual={() => {}} />
    );
    expect(html).not.toContain('class="visual-workbench-header"');
    expect(html).not.toContain('class="visual-workbench-utilities"');
    expect(html.match(/aria-label="More visual options"/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="button" disabled="">[\s\S]*?Redraw as a figure/);
  });

  it("retains a single wrapper menu for other renderers", () => {
    const phrase = { ...visual, kind: "phrase-builder" } as VisualSpec;
    const html = renderToStaticMarkup(<VisualExample visual={phrase} visualId="phrase" onRequestFreshVisual={() => {}} />);
    expect(html.match(/class="visual-workbench-options"/g)).toHaveLength(1);
    expect(html).not.toContain('class="canvas-sandbox-tools"');
    expect(html).toContain("Generate another figure");
  });

  it("uses the paper figure by default for existing state models without duplicating its controls", () => {
    const stateVisual = { ...visual, kind: "state-model", stateModel: {} } as VisualSpec;
    const html = renderToStaticMarkup(<VisualExample visual={stateVisual} visualId="state" />);
    expect(html).toContain("Figure-owned explanation and history controls");
    expect(html).not.toContain('class="visual-workbench-explanation"');
    expect(html).not.toContain("Reset model");
  });
});
