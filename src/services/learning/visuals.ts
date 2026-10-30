import { validateStateModel, type StateModel } from './stateModel';
import { validateSlopeGraph, type SlopeGraphSpec } from './math';
import { validateParameterSim, type ParameterSimSpec } from './parameterSim';
import { validateCanvasSim, type CanvasSimSpec } from './canvasSim';
export interface VisualExample {
  kind:
    | "parts"
    | "comparison"
    | "flow"
    | "steps"
    | "simulation"
    | "phrase-builder"
    | "graph"
    | "state-model"
    | "explorer"
    | "canvas";
  model?: "go-channel" | "http-response" | "go-slice";
  graph?: SlopeGraphSpec;
  stateModel?: StateModel;
  explorer?: ParameterSimSpec;
  canvas?: CanvasSimSpec;
  title: string;
  summary: string;
  items: { id: string; label: string; description: string }[];
  takeaway: string;
}
const clean = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : "";
export function validateVisualExample(value: unknown): VisualExample | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    ![
      "parts",
      "comparison",
      "flow",
      "steps",
      "simulation",
      "phrase-builder",
      "graph",
      "state-model",
      "explorer",
      "canvas",
    ].includes(String(v.kind))
  )
    return null;
  if (
    v.kind === "simulation" &&
    !["go-channel", "http-response", "go-slice"].includes(String(v.model))
  )
    return null;
  const stateModel = v.kind === "state-model" ? validateStateModel(v.stateModel) : null;
  if (v.kind === "state-model" && !stateModel) return null;
  const graph = v.kind === "graph" ? validateSlopeGraph(v.graph) : null;
  if (v.kind === "graph" && !graph) return null;
  const explorer = v.kind === "explorer" ? validateParameterSim(v.explorer) : null;
  if (v.kind === "explorer" && !explorer) return null;
  const canvas = v.kind === "canvas" ? validateCanvasSim(v.canvas) : null;
  if (v.kind === "canvas" && !canvas) return null;
  const title = clean(v.title, 140),
    summary = clean(v.summary, 600),
    takeaway = clean(v.takeaway, 400);
  if (
    !title ||
    !summary ||
    !takeaway ||
    !Array.isArray(v.items) ||
    v.items.length < 2 ||
    v.items.length > 6
  )
    return null;
  const items = v.items.map((raw: unknown) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    return {
      id: clean(r.id, 48),
      label: clean(r.label, 90),
      description: clean(r.description, 500),
    };
  });
  if (
    items.some((i) => !i.id || !i.label || !i.description) ||
    new Set(items.map((i) => i.id)).size !== items.length
  )
    return null;
  return {
    kind: v.kind as VisualExample["kind"],
    ...(v.kind === "simulation"
      ? { model: v.model as VisualExample["model"] }
      : {}),
    ...(graph ? { graph } : {}),
    ...(stateModel ? { stateModel } : {}),
    ...(explorer ? { explorer } : {}),
    ...(canvas ? { canvas } : {}),
    title,
    summary,
    items,
    takeaway,
  };
}
export function extractVisualExample(content: string): VisualExample | null {
  const block =
    /^[ \t]*```forge-visual[^\r\n]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/im.exec(
      content
    );
  if (!block) return null;
  try {
    return validateVisualExample(JSON.parse(block[1]));
  } catch {
    return null;
  }
}
/** New content uses declarative models. Saved fixed-model activities remain readable. */
export function visualForSubject(
  visual: VisualExample | null,
  _language?: string | null
): VisualExample | null {
  return visual?.kind === "simulation" ? null : visual;
}
export const VISUAL_INSTRUCTIONS = `VISUAL EXPLANATIONS (forge-visual)
When a learner asks to see an idea visually, return ONE forge-visual JSON block about the CURRENT lesson, using a small analogous example rather than solving their unanswered check. Do not change their subject or goal. You may also include a visual when it clarifies an explanation and their visual preference is auto. If preferences are ask or text, only include it on an explicit visual request.
Choose a visualization that lets the learner act on the concept and observe a meaningful consequence, rather than defaulting to boxes and arrows.
INTERACTIVE CANVAS SIMULATIONS: When a concept benefits from a custom 2D drawing, spatial/geometric intuition, animated particles/waves/vectors, sorting/tree/graph dynamics, probability sampling, physics/kinematics, or an interactive visual experiment that goes beyond a single 1D formula curve or small discrete entity table, use kind="canvas" with canvas={"controlsHint":"One short sentence on what to drag, click, or adjust","height":320,"html":"<canvas id=\\"sim\\" width=\\"560\\" height=\\"220\\"></canvas><div class=\\"controls\\"><label>Angle <strong id=\\"angVal\\">45°</strong><input id=\\"ang\\" type=\\"range\\" min=\\"5\\" max=\\"85\\" value=\\"45\\"></label><button id=\\"stepBtn\\" type=\\"button\\">Step</button></div>","css":"","js":"const { ctx, width, height } = window.setupForgeCanvas('sim', 220); const T = window.FORGE_THEME; /* self-contained vanilla JS */"}.
Canvas sandbox contract (runs inside an offline zero-origin <iframe sandbox="allow-scripts">):
- 100% self-contained vanilla JS + HTML5 2D <canvas> or inline <svg>. NEVER load external CDN scripts, NEVER call fetch/XMLHttpRequest/WebSocket, and NEVER touch localStorage, sessionStorage, or document.cookie.
- Call window.setupForgeCanvas(canvasOrId, cssHeight) for crisp Retina/HiDPI scaling and use window.FORGE_THEME ({ bg, surface, border, grid, text, muted, accent, teal, coral, blue }) so colors match LearnForge's dark editorial canvas.
- Give every slider/input a clear <label> and live value readout, make buttons keyboard-accessible, and respect window.FORGE_REDUCED_MOTION (include a Pause/Step button or user-driven scrubbing rather than unpausable rapid motion).
- Always provide the standard title, summary, 2–6 items (explaining key regimes/observations), and takeaway so the text equivalent stands on its own.
- In lesson prose or deeper explanations outside forge-visual, you may also embed an inline fenced \`\`\`forge-canvas JSON block {"title":"...","summary":"...","controlsHint":"...","html":"...","js":"...","takeaway":"..."} using the exact same self-contained sandbox contract when a live manipulable micro-lab directly clarifies the concept.
PARAMETER EXPLORERS: When a concept is cleanly expressed as a single mathematical formula y = f(x) with 1–4 numeric parameters (rates, step size, frequency, probability, growth, throughput, or trade-off curves), use kind="explorer" with explorer={"prompt":"One short instruction on what to sweep and watch","parameters":[{"id":"alpha","label":"Step size","min":0.05,"max":1.2,"step":0.05,"initial":0.2,"unit":""}],"outputs":[{"id":"update","label":"Step change","expression":"alpha * grad","unit":"","precision":2}],"curve":{"xLabel":"x","yLabel":"f(x)","xMin":-2,"xMax":2,"expression":"alpha * x ^ 2","markerXExpression":"alpha"}}. Include 1–4 parameters (identifiers must be valid variable names other than x), 1–4 outputs using pure math expressions (+, -, *, /, ^, sin, cos, tan, exp, log, ln, sqrt, abs, min, max, clamp, pow, PI, E), and an optional 2D curve over x. Include the usual title, summary, 2–6 items explaining key regimes, and takeaway.
MATH GRAPHS: Only when the CURRENT concept is slope, gradients of a straight line, or rise/run, use kind="graph" and graph={"type":"slope","points":[{"x":-2,"y":-1},{"x":2,"y":3}]}. Choose your own two relevant points: each coordinate must be a finite number between -5 and 5 in increments of 0.5. The owned graph supports dragging/keyboard movement of A and B, exact slope fractions, horizontal/vertical lines and coincident points, with a text equivalent. Include the usual title/summary/items/takeaway. Use an analogous example, never the coordinates or answer of a pending question. This is a slope model only: do not call it a derivative, nonlinear curve, physics simulation or generic function plotter. Never choose a math graph for a language lesson or unrelated subject.
INTERACTIVE WALKTHROUGHS: Use kind="state-model" for a concept whose entities change as the learner chooses actions. This is language- and subject-neutral: derive the entities, statuses, values, allowed actions and explanations from THIS learner's actual concept and relevant source. Do not choose a canned program or change the subject. This walkthrough renderer does not select behavior rules by programming language. It navigates the finite state graph you supply, labels it as an illustrative concept walkthrough, and does NOT execute the supplied source or verify its behavior. Do not present it as an actual runtime trace, live debugger, measured timing, verified simulation or independent assessment.
Include the usual title, summary, items and takeaway plus a stateModel object. version=1; initialStateId references one of the states; entities has 1–6 unique {id,label} entries. states has 2–20 unique {id,label,description,entities} entries: EACH state's entities must contain exactly one {entityId,status,value,tone} per entity. status is short natural text, value is readable state data, tone is neutral|active|waiting|done and is never the only description. transitions has 1–40 unique {id,from,to,label,explanation,sourceLines?} entries; from/to must be different existing state ids, all states reachable from initialStateId, at most FOUR actions per state. Branches and cycles are allowed; include alternatives when they explain the concept rather than pretending one execution order is guaranteed. If you cannot reliably explain valid state changes, provide a static illustration and acknowledge the limitation rather than inventing behavior. Keep the first experiment small: about 2–4 entities, 3–7 states and 1–2 concise actions at each state. The learner can step, go back, explore another branch and replay.
Optional source={language:"actual source language identifier",code:"relevant concise source excerpt"} is for reading only, at most 60 lines/6000 characters; use sourceLines as 1-based highlighted line numbers for the action. Do not fabricate source execution or put runnable callbacks, guards, HTML, SVG or scripts into the stateModel descriptor. Omit source entirely for non-coding concepts. Explain a state/transition's meaning simply. Do not use language names to select an app-specific model. For obsolete fixed models, do not emit kind="simulation"; use this declarative contract instead.
When practising word or phrase order, kind="phrase-builder" is also available with items in the intended order; use a short analogous phrase, not the pending assessment answer. All visual help is supported practice, never evidence of independent mastery.
Use parts for phrase chunks or labeled parts, comparison for contrasting examples, flow for a directed process, or steps for changing states. Preserve the current subject, natural wording and meaningful notation; do not turn every concept into a pipeline. No fake audio, waveforms, pronunciation scores, or invented sources. Keep title, summary, items, and takeaway strictly plain text (executable HTML/JS is permitted ONLY inside canvas for kind="canvas"). Standalone static illustrations use the separate shared illustration contract.
Schema (2–6 items with unique ids):
\`\`\`forge-visual
{"kind":"parts|comparison|flow|steps|phrase-builder|graph|state-model|explorer|canvas","title":"Plain short title","summary":"Text equivalent explaining the whole visual","items":[{"id":"one","label":"Visible phrase, state or example","description":"One plain-language explanation of this part"},{"id":"two","label":"Another part","description":"Explain its relationship to the idea"}],"takeaway":"One short point to apply in a new situation"}
\`\`\`
For kind canvas include canvas as specified above and omit model. For kind explorer include explorer as specified above and omit model. For kind state-model include stateModel as specified above and omit model. For kind graph include its graph field and omit model. For other kinds omit model. Items in flow, steps and phrase-builder are ordered; only use that order when it is meaningful. A comparison does not imply a timeline. Keep the graphic focused on ONE idea. Do not encode answer keys or correct-option labels into a visual meant to help with a pending assessment. A visual request alone should not replace the pending question or approve advancement. Follow-up fresh checks must use a different case and reduced scaffolding.`;
