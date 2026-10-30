import { validateStateModel, type StateModel } from './stateModel';
import { validateSlopeGraph, type SlopeGraphSpec } from './math';
import { validateParameterSim, type ParameterSimSpec } from './parameterSim';
import { validateCanvasSim, type CanvasSimSpec } from './canvasSim';
import { validateConceptDiagram, type ConceptDiagramSpec } from './conceptDiagram';

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
    | "canvas"
    | "diagram";
  model?: "go-channel" | "http-response" | "go-slice";
  graph?: SlopeGraphSpec;
  stateModel?: StateModel;
  explorer?: ParameterSimSpec;
  canvas?: CanvasSimSpec;
  diagram?: ConceptDiagramSpec;
  title: string;
  summary: string;
  items: { id: string; label: string; description: string }[];
  takeaway: string;
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : "";

const clampClean = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const RICH_INTERACTIVE_KINDS = new Set([
  "canvas",
  "diagram",
  "explorer",
  "state-model",
]);

function repairLooseJson(raw: string): string {
  // Escape raw control newlines/tabs inside JSON double-quoted string literals
  // and strip trailing commas before `}` or `]`.
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === "\\") {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === "\n") {
        out += "\\n";
      } else if (ch === "\r") {
        // skip CR inside string literal
      } else if (ch === "\t") {
        out += "\\t";
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
    }
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

export function validateVisualExample(value: unknown): VisualExample | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const inferredKind =
    v.kind !== undefined && v.kind !== null && String(v.kind).trim() !== ""
      ? String(v.kind)
      : v.canvas || (typeof v.html === "string" && typeof v.js === "string")
      ? "canvas"
      : v.diagram || Array.isArray(v.nodes)
      ? "diagram"
      : v.explorer || v.curve
      ? "explorer"
      : v.stateModel || (Array.isArray(v.entities) && Array.isArray(v.states))
      ? "state-model"
      : "";
  const kindStr = inferredKind;
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
      "diagram",
    ].includes(kindStr)
  )
    return null;
  if (
    kindStr === "simulation" &&
    !["go-channel", "http-response", "go-slice"].includes(String(v.model))
  )
    return null;
  const stateModel =
    kindStr === "state-model"
      ? validateStateModel(v.stateModel ?? v)
      : null;
  if (kindStr === "state-model" && !stateModel) return null;
  const graph = kindStr === "graph" ? validateSlopeGraph(v.graph ?? v) : null;
  if (kindStr === "graph" && !graph) return null;
  const explorer =
    kindStr === "explorer"
      ? validateParameterSim(v.explorer ?? v)
      : null;
  if (kindStr === "explorer" && !explorer) return null;
  const canvas =
    kindStr === "canvas" ? validateCanvasSim(v.canvas ?? v) : null;
  if (kindStr === "canvas" && !canvas) return null;
  const diagram =
    kindStr === "diagram" ? validateConceptDiagram(v.diagram ?? v) : null;
  if (kindStr === "diagram" && !diagram) return null;

  const isRich = RICH_INTERACTIVE_KINDS.has(kindStr);
  const title = isRich
    ? clampClean(v.title, 140) || "Interactive exploration"
    : clean(v.title, 140);
  const summary = isRich
    ? clampClean(v.summary, 600) ||
      "Interact with the controls below to explore how this mechanism behaves."
    : clean(v.summary, 600);
  const takeaway = isRich
    ? clampClean(v.takeaway, 400) || summary.slice(0, 400)
    : clean(v.takeaway, 400);

  let rawItems = Array.isArray(v.items) ? v.items : [];
  if (isRich && rawItems.length > 6) {
    rawItems = rawItems.slice(0, 6);
  }

  let items = rawItems.map((raw: unknown, idx: number) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    return {
      id: isRich
        ? clampClean(r.id, 48) || `layer-${idx + 1}`
        : clean(r.id, 48),
      label: isRich ? clampClean(r.label, 90) : clean(r.label, 90),
      description: isRich
        ? clampClean(r.description, 500)
        : clean(r.description, 500),
    };
  });

  if (isRich) {
    items = items.filter((i) => i.id && i.label && i.description);
    if (items.length < 2) {
      if (diagram && diagram.nodes.length >= 2) {
        items = diagram.nodes.slice(0, 4).map((n, idx) => ({
          id: `node-${n.id}-${idx}`,
          label: n.label.slice(0, 90),
          description: n.detail.slice(0, 500),
        }));
      } else {
        items = [
          items[0] || {
            id: "layer-core",
            label: "Core mechanism",
            description: summary.slice(0, 500),
          },
          {
            id: "layer-takeaway",
            label: "Key principle",
            description: takeaway.slice(0, 500),
          },
        ];
      }
    }
  }

  if (
    !title ||
    !summary ||
    !takeaway ||
    items.length < 2 ||
    items.length > 6 ||
    items.some((i) => !i.id || !i.label || !i.description) ||
    new Set(items.map((i) => i.id)).size !== items.length
  )
    return null;
  return {
    kind: kindStr as VisualExample["kind"],
    ...(kindStr === "simulation"
      ? { model: v.model as VisualExample["model"] }
      : {}),
    ...(graph ? { graph } : {}),
    ...(stateModel ? { stateModel } : {}),
    ...(explorer ? { explorer } : {}),
    ...(canvas ? { canvas } : {}),
    ...(diagram ? { diagram } : {}),
    title,
    summary,
    items,
    takeaway,
  };
}

export function extractVisualExample(content: string): VisualExample | null {
  const block =
    /```(?:forge-visual|forge-canvas)[^\r\n]*\r?\n([\s\S]*?)```/i.exec(
      content
    );
  const candidate = block ? block[1].trim() : "";
  if (!candidate) return null;
  try {
    return validateVisualExample(JSON.parse(candidate));
  } catch {
    try {
      return validateVisualExample(JSON.parse(repairLooseJson(candidate)));
    } catch {
      return null;
    }
  }
}

/** New content uses declarative models. Saved fixed-model activities remain readable. */
export function visualForSubject(
  visual: VisualExample | null,
  _language?: string | null
): VisualExample | null {
  return visual?.kind === "simulation" ? null : visual;
}

export const VISUAL_INSTRUCTIONS = `VISUAL EXPLANATIONS & IMMERSIVE EXPLORATIONS (forge-visual)
When a learner asks to see an idea visually, return ONE forge-visual JSON block about the CURRENT lesson, using an analogous case rather than solving their unanswered check. Preserve their exact subject and goal. You may also include a visual when it clarifies an explanation and their visual preference is auto. If preferences are ask or text, only include it on an explicit visual request.

DESIGN BAR — INTUITIVE, CONCRETE & ILLUSTRATIVE (ANTI-BOX RULE + NO FAKE FORMALISM):
- NEVER render code snippets, definitions, or technical concepts as static "parts" or "comparison" text boxes. A stack of labeled rectangles is NOT a visual explanation. Build a genuine Distill.pub / interactive-essay-caliber figure with clear visual mechanics and tactile controls.
- SUBJECT-APPROPRIATE NOTATION (NO FAKE MATH GIBBERISH): Use $LaTeX$ math ($...$ rendered via KaTeX) ONLY when the subject itself is genuinely mathematical, physical, statistical, or quantitative (calculus, linear algebra, physics, probability, ML loss functions, Big-O recurrences). For programming, software architecture, systems, web development, or non-math topics, NEVER invent academic set-theory, predicate logic, turnstiles, or Greek-letter formulas (never write pseudo-math like "T |= I" or "sig(I) subseteq methods(T)" to explain Go interfaces, structs, functions, or HTTP!). Instead, use plain human English, concrete real code tokens (\`Score() int\`, \`Guard\`), and intuitive visual metaphors (e.g., an interactive plug-and-socket method matcher where toggling methods snaps a struct into an interface slot, live memory boxes with animated pointer arrows, or interactive request timelines).

1. IMMERSIVE 3D / D3 / SKETCHED / 2D CANVAS SIMULATIONS (kind="canvas" — PRIMARY CHOICE for interactive mechanics, systems, memory/pointers, plug-and-socket type contracts, algorithms, physics, geometry, 3D structures, waves, and dynamic models):
   Include canvas={"controlsHint":"Toggle methods or adjust sliders...","height":360,"html":"<canvas id=\\"stage\\" width=\\"580\\" height=\\"240\\"></canvas><div class=\\"controls\\">...</div>","css":"","js":"..."}.
   Pre-bundled offline libraries available inside the zero-origin sandbox (NO external CDN <script src>, NO fetch/WebSocket, NO localStorage/cookies):
   - 2D Retina Studio Kit: const { canvas, ctx, width, height } = window.setupForgeCanvas("stage", 240) + window.FORGE_THEME ({ bg, surface, border, text, muted, accent, teal, coral, blue, violet }) + window.FORGE_DRAW ({ grid(ctx,w,h), arrow(ctx,x1,y1,x2,y2,color), card(ctx,x,y,w,h,opts), pill(ctx,text,x,y,color) }). Always draw immediately on load and redraw whenever controls change!
   - 3D WebGL (Three.js): Call const { THREE, scene, camera, onFrame, setOrbit } = window.setupForge3D("stage", 260, { distance: 6, autoRotate: 0.2 }) — pre-configured with Retina antialiasing, 3-point bronze/teal studio lighting, pointer-drag spherical orbit, and wheel zoom. Ideal for 3D vectors, 3D surfaces z=f(x,y), molecules, orbital mechanics, and coordinate transforms.
   - D3.js v7 (window.d3): Full d3.select, d3.scaleLinear, d3.line().curve(d3.curveCatmullRom), d3.forceSimulation, d3.area, and smooth transitions inside an <svg> or <canvas>.
   - Rough.js (window.rough): Call const rc = rough.canvas(canvas) for expressive hand-sketched diagrams (rc.rectangle, rc.circle, rc.line, rc.curve with hachure fills).
   - Optional KaTeX (for genuine math/science topics ONLY): Any $...$ in canvas.html is rendered with KaTeX, and window.katex.render(tex, el, { throwOnError: false }) is available for live equation updates.
   - Pre-styled studio classes: .controls (dark-glass slider/button bar), .pill-group, .metric-grid > .metric (<small>Label</small><strong>Value</strong>), and optional .formula-bar (use ONLY for real math/physics equations or plain-English live status badges). Give every slider/button a clear label and live readout, and respect window.FORGE_REDUCED_MOTION. Do NOT add inline style colors/borders/backgrounds to buttons, inputs, or the canvas — the sandbox theme already styles them consistently (use class="active" or aria-pressed="true" for the selected toggle). Keep the layout compact: no empty padding boxes, and wrap long code lines rather than letting them overflow.
   - In lesson prose outside forge-visual, you may also embed \`\`\`forge-canvas JSON blocks or \`\`\`mermaid architecture/sequence/class/state diagrams when helpful.

2. MATHEMATICAL CURVE LABS (kind="explorer" — powered by Mafs interactive pan/zoom Cartesian plane + KaTeX):
   When a concept is a genuine 1D mathematical function y = f(x) with 1–4 numeric parameters (derivatives, damping, growth, probability distributions, loss curves), use kind="explorer" with explorer={"prompt":"What to sweep and observe","parameters":[{"id":"alpha","label":"Step size $\\\\alpha$","min":0.05,"max":1.2,"step":0.05,"initial":0.2,"unit":""}],"outputs":[{"id":"update","label":"Next state","expression":"1 - 2 * alpha","unit":"","precision":2}],"curve":{"xLabel":"w","yLabel":"L(w)","xMin":-2,"xMax":2,"expression":"alpha * x ^ 2","markerXExpression":"1 - 2 * alpha"}}. Identifiers must be valid variable names other than x; expressions use +, -, *, /, ^, sin, cos, tan, exp, log, ln, sqrt, abs, min, max, clamp, pow, PI, E.

3. ARCHITECTURAL & CONCEPT NODE SCHEMATICS (kind="diagram" — powered by React Flow + Dagre automatic layout + syntax highlighting):
   For structural contracts, type relationships, compiler/HTTP pipelines, ASTs, memory pointers, or causal graphs, use kind="diagram" with diagram={"direction":"LR","nodes":[{"id":"guard","badge":"CONCRETE STRUCT","label":"Guard Value","code":"type Guard struct { Points int }","detail":"Stores concrete data (\`Points int\`) without naming any interface.","tone":"blue"},{"id":"impl","badge":"METHOD","label":"Attached Method","code":"func (g Guard) Score() int","detail":"Attaches \`Score() int\` to \`Guard\`.","tone":"teal"},{"id":"contract","badge":"INTERFACE ROLE","label":"Scorer Contract","code":"type Scorer interface { Score() int }","detail":"Because \`Guard\` has \`Score() int\`, it plugs directly into \`Scorer\` automatically.","tone":"accent"}],"edges":[{"from":"guard","to":"impl","label":"defines"},{"from":"impl","to":"contract","label":"matches Score() int"}]}. Include 2–10 unique nodes (tones: accent|teal|blue|coral|neutral; include optional "formula" ONLY on genuine math/physics topics, NEVER on programming nodes) and up to 20 directed edges.

4. INTERACTIVE STATE WALKTHROUGHS (kind="state-model"):
   Use kind="state-model" when discrete entities transition across branching states as the learner chooses actions. This is language- and subject-neutral: derive entities (1–6), states (2–20, each listing every entity's {entityId,status,value,tone}), and reachable transitions (1–40, at most 4 actions per state, optional 1-based sourceLines with optional reading-only source={language,code}) from THIS learner's concept. Do not present it as a live debugger or emit obsolete kind="simulation".

5. SLOPE & SPOKEN PHRASES:
   Only when the concept is straight-line slope or rise/run, use kind="graph" with graph={"type":"slope","points":[{"x":-2,"y":-1},{"x":2,"y":3}]} (coordinates in [-5, 5] step 0.5). For spoken-language word order, use kind="phrase-builder" (or kind="parts" strictly for spoken-language phrase morphology with accurate diacritics; no fake audio claims).

GUIDED EXPLORATION LAYERS (items):
Every forge-visual MUST include title (clear, human, non-pretentious), summary (plain, intuitive explanation with \`code\` tokens or real math only when appropriate), 2–6 items representing guided layers the learner can click through to dig deeper (each with unique id, concise label, and clear description), and takeaway. All visual help is supported practice, never independent mastery, and must never encode the answer key to a pending check.

Schema:
\`\`\`forge-visual
{"kind":"canvas|explorer|diagram|state-model|graph|phrase-builder","title":"Clear figure title","summary":"Plain, intuitive explanation of what to explore","items":[{"id":"layer1","label":"First guided layer","description":"What to observe in this component or state"},{"id":"layer2","label":"Edge case or contrast","description":"Why a mismatch or parameter change alters behavior"}],"takeaway":"Clear, practical principle to apply next"}
\`\`\``;
