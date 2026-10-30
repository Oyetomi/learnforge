/**
 * Sandboxed Freeform Interactive Canvas / HTML Micro-Simulation Contract.
 *
 * Gives the AI tutor full 2D `<canvas>` / inline `<svg>` / interactive DOM
 * expressiveness (flocking, raycasting, wave interference, sorting/tree
 * animations, geometric proofs, physics micro-labs) while enforcing four
 * defense-in-depth guarantees:
 *   1. Opaque origin: rendered strictly with `<iframe sandbox="allow-scripts">`
 *      (NEVER `allow-same-origin`), isolating parent DOM, storage, cookies,
 *      and `window.__TAURI_INTERNALS__`.
 *   2. Zero network exfiltration: first tag in `<head>` injects a strict
 *      `Content-Security-Policy` (`default-src 'none'; connect-src 'none'`).
 *   3. Authenticated bridge: auto-injected bootstrap posts tokenized
 *      `resize`, `interact`, and `error` events so height never clips or
 *      scroll-traps, active checks honestly record supported practice, and
 *      runtime JS errors surface a 1-click repair + text fallback.
 *   4. Built-in LearnForge theme + `window.setupForgeCanvas` HiDPI helper so
 *      every generated simulation renders crisply on Retina displays in
 *      LearnForge's native warm-slate & bronze palette.
 */

export interface CanvasSimSpec {
  /** Self-contained HTML body markup (<canvas>, <svg>, sliders, buttons, readouts). */
  html: string;
  /** Pure inline vanilla JavaScript driving the interactive simulation. */
  js: string;
  /** Optional scoped CSS rules. */
  css?: string;
  /** Short 1-line hint telling the learner what to drag, click, or adjust. */
  controlsHint?: string;
  /** Initial viewport height in px (clamped 200..640, default 320). */
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
export const CANVAS_MAX_HEIGHT = 680;
export const CANVAS_DEFAULT_HEIGHT = 320;

const MAX_HTML_LEN = 18_000;
const MAX_JS_LEN = 24_000;
const MAX_CSS_LEN = 10_000;
const MAX_TOTAL_LEN = 36_000;

/** Strict inner CSP injected as the very first tag in `<head>` of every srcDoc. */
export const CANVAS_INNER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';";

const FORBIDDEN_MARKUP_RE =
  /<(?:script\b[^>]*\bsrc\s*=|iframe\b|object\b|embed\b|applet\b|meta\b[^>]*http-equiv|link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\/)/i;

const FORBIDDEN_JS_NETWORK_RE =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/;

const INTERACTIVE_SURFACE_RE =
  /<(?:canvas|svg|input|button|select)\b/i;

const JS_SURFACE_RE =
  /\b(?:getContext\s*\(\s*["']2d["']|setupForgeCanvas\s*\(|createElementNS\s*\()/;

const cleanText = (v: unknown, max: number): string =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max
    ? v.trim()
    : "";

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
  --bg: #0f1317;
  --surface: #171c22;
  --surface-alt: #1d232b;
  --border: #2f3741;
  --grid: #20262e;
  --text: #e4e9f0;
  --muted: #9aa7b6;
  --accent: #cfb292;
  --accent-strong: #e3c39e;
  --teal: #8fc9bb;
  --coral: #e59888;
  --blue: #92b6df;
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  overflow-x: hidden;
}
#forge-sim-root {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
canvas {
  display: block;
  width: 100%;
  max-width: 100%;
  background: #0b0e12;
  border: 1px solid var(--border);
  border-radius: 8px;
  touch-action: none;
}
svg {
  display: block;
  max-width: 100%;
  height: auto;
}
.controls, .forge-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  padding: 9px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}
label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}
input[type="range"] {
  accent-color: var(--accent);
  cursor: pointer;
}
button, select {
  font: inherit;
  font-size: 12px;
  color: var(--text);
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 11px;
  min-height: 30px;
  cursor: pointer;
}
button:hover, select:hover {
  border-color: var(--accent);
}
button[aria-pressed="true"], button.active {
  background: #2f2820;
  border-color: var(--accent);
  color: #f3e2ce;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
canvas:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
.readout, .forge-readout {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: var(--muted);
}
.readout strong, .forge-readout strong {
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
    bg: "#0b0e12",
    surface: "#171c22",
    border: "#2f3741",
    grid: "#20262e",
    text: "#e4e9f0",
    muted: "#9aa7b6",
    accent: "#cfb292",
    teal: "#8fc9bb",
    coral: "#e59888",
    blue: "#92b6df"
  });
  window.FORGE_REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  window.setupForgeCanvas = function(target, cssHeight) {
    var canvas = typeof target === "string" ? document.getElementById(target) : target;
    if (!canvas) canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Canvas element not found");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(200, Math.round(rect.width || Number(canvas.getAttribute("width")) || 560));
    var h = Math.max(120, Math.round(cssHeight || Number(canvas.getAttribute("height")) || 240));
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: canvas, ctx: ctx, width: w, height: h, dpr: dpr };
  };
  var reportHeight = function() {
    var root = document.getElementById("forge-sim-root") || document.body;
    if (!root) return;
    var h = Math.ceil(root.scrollHeight || root.getBoundingClientRect().height);
    if (h > 0 && Math.abs(h - lastHeight) > 1) {
      lastHeight = h;
      send("resize", { height: h });
    }
  };
  window.addEventListener("error", function(e) {
    var msg = (e && e.message) ? String(e.message) : "Simulation runtime error";
    send("error", { message: msg.slice(0, 240) });
  });
  window.addEventListener("unhandledrejection", function(e) {
    var r = e && e.reason;
    var msg = (r && r.message) ? String(r.message) : String(r || "Unhandled async error");
    send("error", { message: msg.slice(0, 240) });
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
  window.addEventListener("load", function() {
    reportHeight();
    if (typeof ResizeObserver !== "undefined") {
      var root = document.getElementById("forge-sim-root") || document.body;
      if (root) new ResizeObserver(reportHeight).observe(root);
    }
    setTimeout(reportHeight, 60);
    setTimeout(reportHeight, 320);
  });
  window.addEventListener("resize", reportHeight);
})();`;
}

/**
 * Builds the zero-origin `srcDoc` HTML string for `<iframe sandbox="allow-scripts">`.
 */
export function buildCanvasSimSrcDoc(spec: CanvasSimSpec, token: string): string {
  const customCss = spec.css ? `\n<style>${escapeClosingStyle(spec.css)}</style>` : "";
  const safeJs = escapeClosingScript(spec.js);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CANVAS_INNER_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${BASE_THEME_CSS}</style>${customCss}
<script>${buildBootstrapScript(token)}</script>
</head>
<body>
<div id="forge-sim-root">${spec.html}</div>
<script>
(function(){
"use strict";
${safeJs}
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
  meta?: { summary?: string; takeaway?: string }
): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const customCss = spec.css ? `\n<style>${escapeClosingStyle(spec.css)}</style>` : "";
  const safeJs = escapeClosingScript(spec.js);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CANVAS_INNER_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — LearnForge Simulation</title>
<style>${BASE_THEME_CSS}
body { max-width: 760px; margin: 24px auto; padding: 0 16px; }
.forge-export-header h1 { font-size: 18px; margin: 0 0 6px; color: #f0e2d0; }
.forge-export-header p, .forge-export-takeaway { color: var(--muted); font-size: 13.5px; margin: 6px 0 12px; }
</style>${customCss}
<script>${buildBootstrapScript(null)}</script>
</head>
<body>
<header class="forge-export-header">
  <h1>${escapeHtml(title)}</h1>
  ${meta?.summary ? `<p>${escapeHtml(meta.summary)}</p>` : ""}
</header>
<div id="forge-sim-root">${spec.html}</div>
${meta?.takeaway ? `<p class="forge-export-takeaway">${escapeHtml(meta.takeaway)}</p>` : ""}
<script>
(function(){
"use strict";
${safeJs}
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
