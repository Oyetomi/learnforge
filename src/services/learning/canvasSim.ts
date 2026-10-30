/**
 * Sandboxed Freeform Interactive Canvas / HTML Micro-Simulation Contract.
 *
 * Gives the AI tutor full 2D `<canvas>` / inline `<svg>` / interactive DOM
 * expressiveness (architectural dispatch schematics, flocking, raycasting,
 * wave interference, sorting/tree animations, geometric proofs, physics labs)
 * with native KaTeX LaTeX typesetting while enforcing four security guarantees:
 *   1. Opaque origin: rendered strictly with `<iframe sandbox="allow-scripts">`
 *      (NEVER `allow-same-origin`), isolating parent DOM, storage, cookies,
 *      and `window.__TAURI_INTERNALS__`.
 *   2. Zero network exfiltration: first tag in `<head>` injects a strict
 *      `Content-Security-Policy` (`default-src 'none'; connect-src 'none'`).
 *   3. Authenticated bridge: auto-injected bootstrap posts tokenized
 *      `resize`, `interact`, and `error` events so height never clips or
 *      scroll-traps, active checks honestly record supported practice, and
 *      runtime JS errors surface a 1-click repair + text fallback.
 *   4. Editorial studio theme + KaTeX LaTeX pre-rendering + `setupForgeCanvas`
 *      HiDPI helper + `FORGE_DRAW` diagram primitives so generated visuals
 *      look like Distill.pub / 3Blue1Brown interactive figures.
 */

import { renderToString } from "katex";
import katexCssRaw from "./vendor/katexSandbox.raw.css?raw";
import { MATH_RENDER_OPTIONS } from "./math";

export interface CanvasSimSpec {
  /** Self-contained HTML body markup (<canvas>, <svg>, .formula-bar with $LaTeX$, sliders, buttons, readouts). */
  html: string;
  /** Pure inline vanilla JavaScript driving the interactive simulation. */
  js: string;
  /** Optional scoped CSS rules. */
  css?: string;
  /** Short 1-line hint telling the learner what to drag, click, or adjust. */
  controlsHint?: string;
  /** Initial viewport height in px (clamped 200..640, default 340). */
  height?: number;
}

export interface ParsedCanvasFence {
  title: string;
  summary?: string;
  takeaway?: string;
  spec: CanvasSimSpec;
}

export interface CanvasBridgeState {
  height: number | null;
  error: string | null;
  interacted: boolean;
}

export const INITIAL_CANVAS_BRIDGE_STATE: CanvasBridgeState = {
  height: null,
  error: null,
  interacted: false,
};

export const CANVAS_MIN_HEIGHT = 180;
export const CANVAS_MAX_HEIGHT = 1200;
export const CANVAS_DEFAULT_HEIGHT = 340;

const MAX_HTML_LEN = 28_000;
const MAX_JS_LEN = 48_000;
const MAX_CSS_LEN = 16_000;
const MAX_TOTAL_LEN = 64_000;

/** Strict inner CSP injected as the very first tag in `<head>` of every srcDoc. */
export const CANVAS_INNER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';";

/**
 * Strip external relative `@font-face` URLs from KaTeX CSS so zero font 404s
 * occur inside the opaque `null`-origin iframe while keeping complete KaTeX
 * fraction, radical, matrix, script, and serif typesetting rules intact.
 */
const SANDBOX_KATEX_CSS = katexCssRaw.replace(/@font-face\s*\{[^}]*\}/g, "");

const FORBIDDEN_MARKUP_RE =
  /<(?:script\b[^>]*\bsrc\s*=|iframe\b|object\b|embed\b|applet\b|meta\b[^>]*http-equiv|link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\/)/i;

const FORBIDDEN_JS_NETWORK_RE =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/;

const INTERACTIVE_SURFACE_RE =
  /<(?:canvas|svg|input|button|select)\b/i;

const JS_SURFACE_RE =
  /\b(?:getContext\s*\(\s*["'](?:2d|webgl2?|experimental-webgl)["']|setupForgeCanvas\s*\(|setupForge3D\s*\(|THREE\s*\.|d3\s*\.|rough\s*\.|createElementNS\s*\()/;

const cleanText = (v: unknown, max: number): string =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max
    ? v.trim()
    : "";

/**
 * Pre-renders `$...$` (inline) and `$$...$$` (display) LaTeX inside HTML text
 * nodes using KaTeX (`trust: false`) without touching HTML tag attributes,
 * `<script>`, or `<style>` blocks.
 */
export function renderLatexInCanvasHtml(html: string): string {
  if (!html.includes("$")) return html;
  const tokens = html.split(/(<[^>]+>)/g);
  let skipDepth = 0;
  const mathTokenRe =
    /(\$\$[\s\S]+?\$\$|\$(?!\s)(?:\\.|[^$\\\r\n<>])+?(?<!\s)\$)/g;

  return tokens
    .map((chunk) => {
      if (chunk.startsWith("<")) {
        if (/^<(?:script|style)\b/i.test(chunk) && !/\/>\s*$/.test(chunk)) {
          skipDepth += 1;
        } else if (/^<\/(?:script|style)\b/i.test(chunk)) {
          skipDepth = Math.max(0, skipDepth - 1);
        }
        return chunk;
      }
      if (skipDepth > 0 || !chunk.includes("$")) return chunk;
      return chunk.replace(mathTokenRe, (full) => {
        const isDisplay = full.startsWith("$$") && full.endsWith("$$");
        const expr = (isDisplay ? full.slice(2, -2) : full.slice(1, -1)).trim();
        if (!expr || expr.length > 1500) return full;
        if (!isDisplay && /^\d+(?:[.,]\d+)?(?:\s|$)/.test(expr)) return full;
        try {
          return renderToString(expr, {
            ...MATH_RENDER_OPTIONS,
            displayMode: isDisplay,
            throwOnError: true,
          });
        } catch {
          return full;
        }
      });
    })
    .join("");
}

/**
 * Splits a full single-file HTML document into `{ html, css, js }` when a
 * model passes a complete `<!doctype html>...` document in `html` or `code`
 * instead of separate `html` + `js` fields.
 */
function splitCombinedDocument(rawDoc: string): {
  html: string;
  css: string;
  js: string;
  hadExternalScript: boolean;
} {
  let hadExternalScript = false;
  const cssParts: string[] = [];
  const jsParts: string[] = [];

  let working = rawDoc.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_m, cssBody: string) => {
      if (cssBody.trim()) cssParts.push(cssBody.trim());
      return "";
    }
  );

  working = working.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (_m, attrs: string, scriptBody: string) => {
      if (/\bsrc\s*=/i.test(attrs)) {
        hadExternalScript = true;
      } else if (scriptBody.trim()) {
        jsParts.push(scriptBody.trim());
      }
      return "";
    }
  );

  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(working);
  let bodyHtml = bodyMatch ? bodyMatch[1] : working;
  bodyHtml = bodyHtml
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?(?:html|body)\b[^>]*>/gi, "")
    .trim();

  return {
    html: bodyHtml,
    css: cssParts.join("\n\n"),
    js: jsParts.join("\n\n"),
    hadExternalScript,
  };
}

export function validateCanvasSim(value: unknown): CanvasSimSpec | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const rawHtmlField =
    typeof raw.html === "string"
      ? raw.html
      : typeof raw.markup === "string"
      ? raw.markup
      : typeof raw.code === "string"
      ? raw.code
      : typeof raw.document === "string"
      ? raw.document
      : "";

  const rawJsField =
    typeof raw.js === "string"
      ? raw.js
      : typeof raw.script === "string"
      ? raw.script
      : "";

  const rawCssField =
    typeof raw.css === "string"
      ? raw.css
      : typeof raw.styles === "string"
      ? raw.styles
      : "";

  if (!rawHtmlField.trim()) return null;
  if (FORBIDDEN_MARKUP_RE.test(rawHtmlField)) return null;

  let html = rawHtmlField.trim();
  let js = rawJsField.trim();
  let css = rawCssField.trim();

  if (/<(?:!doctype|html|head|body|script|style)\b/i.test(html)) {
    const extracted = splitCombinedDocument(html);
    if (extracted.hadExternalScript) return null;
    html = extracted.html;
    if (extracted.css) {
      css = [extracted.css, css].filter(Boolean).join("\n\n");
    }
    if (extracted.js) {
      js = [extracted.js, js].filter(Boolean).join("\n\n");
    }
  }

  if (
    html.length < 10 ||
    html.length > MAX_HTML_LEN ||
    js.length < 10 ||
    js.length > MAX_JS_LEN ||
    css.length > MAX_CSS_LEN ||
    html.length + js.length + css.length > MAX_TOTAL_LEN
  ) {
    return null;
  }

  if (FORBIDDEN_MARKUP_RE.test(html) || FORBIDDEN_JS_NETWORK_RE.test(js)) {
    return null;
  }

  if (!INTERACTIVE_SURFACE_RE.test(html) && !JS_SURFACE_RE.test(js)) {
    return null;
  }

  const controlsHint = cleanText(raw.controlsHint, 180) || undefined;
  const rawHeight =
    typeof raw.height === "number" && Number.isFinite(raw.height)
      ? Math.round(raw.height)
      : CANVAS_DEFAULT_HEIGHT;
  const height = Math.min(Math.max(rawHeight, 200), 640);

  return {
    html,
    js,
    ...(css ? { css } : {}),
    ...(controlsHint ? { controlsHint } : {}),
    height,
  };
}

/**
 * Parses a fenced ```` ```forge-canvas ```` block inside Markdown explanations.
 * Accepts JSON with `{ title, summary?, takeaway?, html, js, css?, controlsHint?, height? }`
 * or `{ title, summary?, takeaway?, canvas: { ... } }`.
 */
export function parseCanvasFence(source: string): ParsedCanvasFence | null {
  const trimmed = source.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const spec = validateCanvasSim(parsed.canvas ?? parsed);
    if (!spec) return null;
    const title = cleanText(parsed.title, 140) || "Interactive simulation";
    const summary = cleanText(parsed.summary, 600) || undefined;
    const takeaway = cleanText(parsed.takeaway, 400) || undefined;
    return { title, summary, takeaway, spec };
  } catch {
    return null;
  }
}

const escapeClosingStyle = (css: string): string =>
  css.replace(/<\/style/gi, "<\\/style");

const escapeClosingScript = (js: string): string =>
  js.replace(/<\/script/gi, "<\\/script");

const BASE_THEME_CSS = `
:root {
  --bg: #0d1015;
  --surface: #151a21;
  --surface-alt: #1b222c;
  --border: #2c3542;
  --grid: #1e2530;
  --text: #eaeff6;
  --muted: #9ba8b8;
  --accent: #d4b08c;
  --accent-strong: #e8c7a4;
  --teal: #8fc9bb;
  --coral: #e59888;
  --blue: #92b6df;
  --violet: #b8a5e3;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  --font-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --font-code: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace;
  color-scheme: dark;
}
*, *::before, *::after {
  box-sizing: border-box;
}
html, body {
  margin: 0;
  padding: 0;
  height: auto !important;
  min-height: 0 !important;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 1.55;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
#forge-sim-root {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.formula-bar, .math-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 18px;
  padding: 10px 16px;
  background: linear-gradient(180deg, rgba(28, 34, 44, 0.92) 0%, rgba(18, 22, 29, 0.95) 100%);
  border: 1px solid rgba(212, 176, 140, 0.28);
  border-radius: 10px;
  color: #f3ece2;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.formula-bar .katex, .math-banner .katex {
  font-size: 1.08em;
  color: #f6efe6;
}
.katex {
  font-family: "Times New Roman", "Iowan Old Style", Georgia, Cambria, serif;
}
canvas {
  display: block;
  width: 100%;
  max-width: 100%;
  background: radial-gradient(120% 95% at 50% 0%, #161e29 0%, #0a0d12 78%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  touch-action: none;
}
svg {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  background: radial-gradient(120% 95% at 50% 0%, #161e29 0%, #0a0d12 78%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}
.controls, .forge-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pill-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}
label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 500;
}
label strong, label span.val {
  color: var(--accent-strong);
  font-family: var(--font-code);
  font-size: 12px;
}
input[type="range"] {
  accent-color: var(--accent);
  cursor: pointer;
}
button, select {
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 5px 13px;
  min-height: 30px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
button:hover, select:hover {
  border-color: var(--accent);
  color: #f7ebdc;
}
button[aria-pressed="true"], button.active {
  background: linear-gradient(180deg, #342b21 0%, #272018 100%);
  border-color: var(--accent);
  color: #f6e6d2;
  box-shadow: 0 0 0 1px rgba(212, 176, 140, 0.2);
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
canvas:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
code {
  font-family: var(--font-code);
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  color: #ebd5bc;
}
.metric-grid, .readout, .forge-readout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}
.metric {
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.metric small {
  display: block;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted);
  margin-bottom: 2px;
}
.metric strong {
  font-family: var(--font-code);
  font-size: 14px;
  color: var(--text);
}
`;

function buildBootstrapScript(token: string | null): string {
  const tokenLiteral = token ? JSON.stringify(token) : "null";
  return `(function(){
  var TOKEN = ${tokenLiteral};
  var interacted = false;
  var lastHeight = 0;
  var send = function(type, extra) {
    if (!TOKEN) return;
    try {
      parent.postMessage(Object.assign({ source: "learnforge-canvas", token: TOKEN, type: type }, extra || {}), "*");
    } catch (_e) {}
  };
  window.FORGE_THEME = Object.freeze({
    bg: "#0b0e13",
    surface: "#151a21",
    surfaceAlt: "#1c232e",
    border: "#2f3947",
    grid: "rgba(155, 168, 184, 0.07)",
    text: "#eaeff6",
    muted: "#9ba8b8",
    accent: "#d4b08c",
    teal: "#8fc9bb",
    coral: "#e59888",
    blue: "#92b6df",
    violet: "#b8a5e3"
  });
  window.FORGE_REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  window.setupForgeCanvas = function(target, cssHeight) {
    var canvas = typeof target === "string" ? document.getElementById(target) : target;
    if (!canvas) canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Canvas element not found");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var rawW = rect.width || canvas.clientWidth || Number(canvas.getAttribute("width")) || 580;
    var w = Math.max(240, Math.round(rawW < 40 ? (Number(canvas.getAttribute("width")) || 580) : rawW));
    var h = Math.max(140, Math.round(cssHeight || Number(canvas.getAttribute("height")) || 250));
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: canvas, ctx: ctx, width: w, height: h, dpr: dpr };
  };
  window.setupForge3D = function(target, cssHeight, opts) {
    var THREE = window.THREE;
    if (!THREE) throw new Error("Three.js runtime is still loading");
    var el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) el = document.querySelector("canvas");
    var canvas = el;
    if (!canvas || canvas.tagName.toLowerCase() !== "canvas") {
      canvas = document.createElement("canvas");
      if (el) el.appendChild(canvas);
      else (document.getElementById("forge-sim-root") || document.body).prepend(canvas);
    }
    var o = opts || {};
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(260, Math.round(rect.width || Number(canvas.getAttribute("width")) || 580));
    var h = Math.max(180, Math.round(cssHeight || Number(canvas.getAttribute("height")) || 280));
    canvas.style.height = h + "px";
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(o.fov || 42, w / h, 0.1, 1000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    var keyLight = new THREE.DirectionalLight(0xf5e2cc, 1.2);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);
    var rimLight = new THREE.DirectionalLight(0x8fc9bb, 0.6);
    rimLight.position.set(-6, -3, -5);
    scene.add(rimLight);
    var radius = o.distance || 6;
    var theta = o.theta != null ? o.theta : 0.65;
    var phi = o.phi != null ? o.phi : 1.05;
    var targetVec = new THREE.Vector3(0, 0, 0);
    var dragging = false, lastX = 0, lastY = 0;
    var syncCamera = function() {
      phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi));
      radius = Math.max(1.5, Math.min(60, radius));
      camera.position.set(
        targetVec.x + radius * Math.sin(phi) * Math.sin(theta),
        targetVec.y + radius * Math.cos(phi),
        targetVec.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(targetVec);
    };
    syncCamera();
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", function(e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.style.cursor = "grabbing";
      try { canvas.setPointerCapture(e.pointerId); } catch (_e) {}
    });
    canvas.addEventListener("pointermove", function(e) {
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.009;
      phi -= (e.clientY - lastY) * 0.009;
      lastX = e.clientX; lastY = e.clientY;
      syncCamera();
    });
    var endDrag = function() { dragging = false; canvas.style.cursor = "grab"; };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("wheel", function(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      radius *= e.deltaY > 0 ? 1.07 : 0.93;
      syncCamera();
    }, { passive: false });
    var frameCallbacks = [];
    var prevTime = performance.now();
    var startTime = prevTime;
    var autoRotate = window.FORGE_REDUCED_MOTION ? 0 : (o.autoRotate || 0);
    var loop = function(now) {
      var dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      if (autoRotate && !dragging) { theta += autoRotate * dt; syncCamera(); }
      for (var i = 0; i < frameCallbacks.length; i++) frameCallbacks[i](dt, (now - startTime) / 1000);
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return {
      THREE: THREE, canvas: canvas, renderer: renderer, scene: scene, camera: camera,
      width: w, height: h, target: targetVec,
      setOrbit: function(t, p, r) { if (t != null) theta = t; if (p != null) phi = p; if (r != null) radius = r; syncCamera(); },
      onFrame: function(fn) { if (typeof fn === "function") frameCallbacks.push(fn); }
    };
  };
  window.FORGE_DRAW = Object.freeze({
    grid: function(ctx, w, h, step) {
      var s = step || 28;
      ctx.save();
      ctx.strokeStyle = "rgba(155, 168, 184, 0.065)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = s; x < w; x += s) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
      for (var y = s; y < h; y += s) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
      ctx.stroke();
      ctx.restore();
    },
    arrow: function(ctx, x1, y1, x2, y2, color, width) {
      var head = 8;
      var angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.save();
      ctx.strokeStyle = color || "#d4b08c";
      ctx.fillStyle = color || "#d4b08c";
      ctx.lineWidth = width || 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    card: function(ctx, x, y, w, h, opts) {
      var o = opts || {};
      var r = o.radius != null ? o.radius : 10;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      ctx.fillStyle = o.fill || "rgba(23, 29, 38, 0.94)";
      ctx.fill();
      ctx.lineWidth = o.lineWidth || 1.25;
      ctx.strokeStyle = o.stroke || "#333f4f";
      ctx.stroke();
      ctx.restore();
    },
    pill: function(ctx, text, x, y, color) {
      var c = color || "#d4b08c";
      ctx.save();
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      var padX = 9;
      var tw = ctx.measureText(text).width;
      var pw = tw + padX * 2;
      var ph = 21;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, 999);
      else ctx.rect(x, y, pw, ph);
      ctx.fillStyle = "rgba(18, 23, 30, 0.9)";
      ctx.fill();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + padX, y + ph / 2 + 0.5);
      ctx.restore();
      return pw;
    }
  });
  var reportHeight = function() {
    var root = document.getElementById("forge-sim-root") || document.body;
    if (!root) return;
    var h = Math.ceil(Math.max(root.scrollHeight || 0, root.getBoundingClientRect().height || 0)) + 2;
    if (h > 4 && Math.abs(h - lastHeight) > 1) {
      lastHeight = h;
      send("resize", { height: h });
    }
  };
  window.__forgeReportHeight = reportHeight;
  window.__forgeReportError = function(err) {
    var msg = (err && err.message) ? String(err.message) : String(err || "Simulation runtime error");
    send("error", { message: msg.slice(0, 240) });
  };
  window.addEventListener("error", function(e) {
    var msg = (e && e.error && e.error.message)
      ? String(e.error.message)
      : (e && e.message)
      ? String(e.message)
      : "Simulation runtime error";
    window.__forgeReportError(msg);
  });
  window.addEventListener("unhandledrejection", function(e) {
    var r = e && e.reason;
    var msg = (r && r.message) ? String(r.message) : String(r || "Unhandled async error");
    window.__forgeReportError(msg);
  });
  var markInteract = function() {
    if (interacted) return;
    interacted = true;
    send("interact");
  };
  document.addEventListener("pointerdown", markInteract, { passive: true });
  document.addEventListener("input", markInteract, { passive: true });
  document.addEventListener("change", markInteract, { passive: true });
  document.addEventListener("keydown", markInteract, { passive: true });
  var attachObservers = function() {
    var root = document.getElementById("forge-sim-root") || document.body;
    if (!root) return;
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(reportHeight).observe(root);
    }
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(reportHeight).observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
    }
  };
  window.addEventListener("load", function() {
    attachObservers();
    try { window.dispatchEvent(new Event("resize")); } catch (_e) {}
    reportHeight();
    setTimeout(reportHeight, 80);
    setTimeout(reportHeight, 360);
  });
  window.addEventListener("resize", reportHeight);
})();`;
}

/**
 * Builds the zero-origin `srcDoc` HTML string for `<iframe sandbox="allow-scripts">`.
 */
export function buildCanvasSimSrcDoc(
  spec: CanvasSimSpec,
  token: string,
  vendorScripts: string[] = []
): string {
  const customCss = spec.css ? `\n<style>${escapeClosingStyle(spec.css)}</style>` : "";
  const vendorTags = vendorScripts
    .map((code) => `\n<script>${escapeClosingScript(code)}</script>`)
    .join("");
  const safeJs = escapeClosingScript(spec.js);
  const renderedHtml = renderLatexInCanvasHtml(spec.html);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CANVAS_INNER_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${SANDBOX_KATEX_CSS}\n${BASE_THEME_CSS}</style>${customCss}
<script>${buildBootstrapScript(token)}</script>${vendorTags}
</head>
<body>
<div id="forge-sim-root">${renderedHtml}</div>
<script>
(function(){
try {
${safeJs}
} catch (__forgeErr) {
  if (window.__forgeReportError) window.__forgeReportError(__forgeErr);
}
if (window.__forgeReportHeight) window.__forgeReportHeight();
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(function() {
    try { window.dispatchEvent(new Event("resize")); } catch (_e) {}
    if (window.__forgeReportHeight) window.__forgeReportHeight();
  });
}
})();
</script>
</body>
</html>`;
}

/**
 * Builds a clean standalone offline `.html` file so the learner can save any
 * generated interactive simulation to disk and open it in any browser.
 */
export function buildStandaloneCanvasHtml(
  title: string,
  spec: CanvasSimSpec,
  meta?: { summary?: string; takeaway?: string },
  vendorScripts: string[] = []
): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const customCss = spec.css ? `\n<style>${escapeClosingStyle(spec.css)}</style>` : "";
  const vendorTags = vendorScripts
    .map((code) => `\n<script>${escapeClosingScript(code)}</script>`)
    .join("");
  const safeJs = escapeClosingScript(spec.js);
  const renderedHtml = renderLatexInCanvasHtml(spec.html);
  const renderedSummary = meta?.summary
    ? renderLatexInCanvasHtml(escapeHtml(meta.summary))
    : "";
  const renderedTakeaway = meta?.takeaway
    ? renderLatexInCanvasHtml(escapeHtml(meta.takeaway))
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CANVAS_INNER_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — LearnForge Simulation</title>
<style>${SANDBOX_KATEX_CSS}\n${BASE_THEME_CSS}
body { max-width: 780px; margin: 28px auto; padding: 0 18px; }
.forge-export-header h1 { font-size: 19px; font-weight: 600; letter-spacing: -0.015em; margin: 0 0 6px; color: #f3e6d6; }
.forge-export-header p, .forge-export-takeaway { color: var(--muted); font-size: 14px; line-height: 1.65; margin: 6px 0 14px; }
</style>${customCss}
<script>${buildBootstrapScript(null)}</script>${vendorTags}
</head>
<body>
<header class="forge-export-header">
  <h1>${escapeHtml(title)}</h1>
  ${renderedSummary ? `<p>${renderedSummary}</p>` : ""}
</header>
<div id="forge-sim-root">${renderedHtml}</div>
${renderedTakeaway ? `<p class="forge-export-takeaway">${renderedTakeaway}</p>` : ""}
<script>
(function(){
try {
${safeJs}
} catch (__forgeErr) {
  if (window.__forgeReportError) window.__forgeReportError(__forgeErr);
}
})();
</script>
</body>
</html>`;
}

/**
 * Pure reducer over authenticated `postMessage` payloads from the sandboxed iframe.
 */
export function reduceCanvasBridgeState(
  state: CanvasBridgeState,
  data: unknown,
  expectedToken: string
): CanvasBridgeState {
  if (!data || typeof data !== "object") return state;
  const msg = data as Record<string, unknown>;
  if (msg.source !== "learnforge-canvas" || msg.token !== expectedToken) {
    return state;
  }
  if (msg.type === "resize") {
    if (typeof msg.height !== "number" || !Number.isFinite(msg.height) || msg.height <= 0) {
      return state;
    }
    const clamped = Math.min(
      Math.max(Math.round(msg.height), CANVAS_MIN_HEIGHT),
      CANVAS_MAX_HEIGHT
    );
    return clamped === state.height ? state : { ...state, height: clamped };
  }
  if (msg.type === "interact") {
    return state.interacted ? state : { ...state, interacted: true };
  }
  if (msg.type === "error") {
    const text =
      typeof msg.message === "string" && msg.message.trim()
        ? msg.message.trim().slice(0, 240)
        : "Simulation runtime error";
    return text === state.error ? state : { ...state, error: text };
  }
  return state;
}
