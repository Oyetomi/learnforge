import { validateStateModel, type StateModel } from './stateModel';
import { validateSlopeGraph, type SlopeGraphSpec } from './math';
import { validateParameterSim, type ParameterSimSpec } from './parameterSim';
import { validateCanvasSim, type CanvasSimSpec } from './canvasSim';
import { validateConceptDiagram, type ConceptDiagramSpec } from './conceptDiagram';
import { validateMemoryModel, type MemoryModelSpec } from './memoryModel';
import { validateTimelineModel, type TimelineModelSpec } from './timelineModel';

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
    | "diagram"
    | "memory-model"
    | "timeline";
  model?: "go-channel" | "http-response" | "go-slice";
  graph?: SlopeGraphSpec;
  stateModel?: StateModel;
  explorer?: ParameterSimSpec;
  canvas?: CanvasSimSpec;
  diagram?: ConceptDiagramSpec;
  memoryModel?: MemoryModelSpec;
  timeline?: TimelineModelSpec;
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
  "memory-model",
  "timeline",
]);

function repairLooseJson(raw: string): string {
  // Escape raw control newlines/tabs inside JSON double-quoted string literals
  // and strip trailing commas before `}` or `]` outside string literals.
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
        out += ch;
      } else if (ch === ",") {
        let j = i + 1;
        while (j < raw.length && /\s/.test(raw[j])) j++;
        if (raw[j] === "}" || raw[j] === "]") {
          // Omit trailing comma outside strings.
          continue;
        }
        out += ch;
      } else {
        out += ch;
      }
    }
  }
  return out;
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
      : v.memoryModel || Array.isArray(v.frames)
      ? "memory-model"
      : v.timeline || (Array.isArray(v.actors) && Array.isArray(v.steps))
      ? "timeline"
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
      "memory-model",
      "timeline",
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
  const memoryModel =
    kindStr === "memory-model"
      ? validateMemoryModel(v.memoryModel ?? v)
      : null;
  if (kindStr === "memory-model" && !memoryModel) return null;
  const timeline =
    kindStr === "timeline" ? validateTimelineModel(v.timeline ?? v) : null;
  if (kindStr === "timeline" && !timeline) return null;

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
    ...(memoryModel ? { memoryModel } : {}),
    ...(timeline ? { timeline } : {}),
    title,
    summary,
    items,
    takeaway,
  };
}

export function extractVisualExample(content: string): VisualExample | null {
  const block =
    /^[ \t]*```(?:forge-visual|forge-canvas)[^\r\n]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*\r?$/im.exec(
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

/** Explicit paper-figure requests must not silently fall back to generated UI. */
export function visualForScientificPresentation(visual: VisualExample | null): VisualExample | null {
  if (visual?.kind === "graph" || visual?.kind === "explorer") return visual;
  if (visual?.kind === "memory-model") {
    return visual.memoryModel && validateMemoryModel(visual.memoryModel) ? visual : null;
  }
  if (visual?.kind === "timeline") {
    return visual.timeline && validateTimelineModel(visual.timeline) ? visual : null;
  }
  if (visual?.kind !== "state-model" || visual.stateModel?.presentation?.style !== "scientific") return null;
  const model = visual.stateModel;
  const fingerprint = (state: StateModel["states"][number]) => JSON.stringify({
    entities: state.entities.map(({ entityId, status, value }) => ({ entityId, status, value }))
      .sort((a, b) => a.entityId.localeCompare(b.entityId)),
    relations: (state.relations || []).map(({ from, to, kind, label }) => ({ from, to, kind, label: label || "" }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
  const states = new Map(model.states.map(state => [state.id, fingerprint(state)]));
  // A new caption or an unused tone is not an interactive change in the figure.
  return model.transitions.every(action => states.get(action.from) !== states.get(action.to)) ? visual : null;
}

/** Hide alternate custom-runtime fences while a typeset figure is being requested. */
export function hideCustomCanvasBlocks(content: string): string {
  const visible: string[] = [];
  let fence: { marker: string; length: number; hidden: boolean } | undefined;
  for (const line of content.split(/\r?\n/)) {
    // Markdown permits fenced blocks inside quotes and list items too.
    const containerLine = line.replace(/^(?:(?:[ \t]+)|(?:>[ \t]?)|(?:(?:[-+*]|\d{1,9}[.)])[ \t]+))*/, "");
    const opening = /^(`{3,}|~{3,})([^\r\n]*)$/.exec(containerLine);
    if (!fence && opening) {
      fence = { marker: opening[1][0], length: opening[1].length,
        hidden: /^(?:forge-canvas|canvas-sim)(?:\s|$)/i.test(opening[2].trim()) };
      if (!fence.hidden) visible.push(line);
    } else if (fence) {
      if (!fence.hidden) visible.push(line);
      const closing = /^(`+|~+)[ \t]*$/.exec(containerLine);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length) fence = undefined;
    } else visible.push(line);
  }
  return visible.join("\n").trim();
}

export const VISUAL_INSTRUCTIONS = `VISUAL EXPLANATIONS (forge-visual)
When a learner asks to see an idea visually, return ONE forge-visual JSON block about the CURRENT lesson, using an analogous case rather than solving their unanswered check. Preserve their exact subject and goal. You may also include a visual when it clarifies an explanation and their visual preference is auto. If preferences are ask or text, only include it on an explicit visual request.

DESIGN BAR — INTUITIVE, CONCRETE & ILLUSTRATIVE (ANTI-BOX RULE + NO FAKE FORMALISM):
- NEVER render code snippets, definitions, or technical concepts as static "parts" or "comparison" text boxes. A stack of labeled rectangles is NOT a visual explanation. Choose a compact figure that makes one causal mechanism visible. Each interaction must change the model and its visible outcome; tabs that merely swap explanatory prose do not count as an interactive model.
- SUBJECT-APPROPRIATE NOTATION (NO FAKE MATH GIBBERISH): Use $LaTeX$ math ($...$ rendered via KaTeX) ONLY when the subject itself is genuinely mathematical, physical, statistical, or quantitative (calculus, linear algebra, physics, probability, ML loss functions, Big-O recurrences). For programming, software architecture, systems, web development, or non-math topics, NEVER invent academic set-theory, predicate logic, turnstiles, or Greek-letter formulas (never write pseudo-math like "T |= I" or "sig(I) subseteq methods(T)" to explain Go interfaces, structs, functions, or HTTP!). Instead, use plain human English, concrete real code tokens (\`Score() int\`, \`Guard\`), and intuitive visual metaphors (e.g., an interactive plug-and-socket method matcher where toggling methods snaps a struct into an interface slot, live memory boxes with animated pointer arrows, or interactive request timelines).

RENDERER CHOICE — SUBJECT-FIRST, APP-OWNED FIGURES:
Pick the app-owned publication-style figure that genuinely fits the learner's ACTUAL subject (humanities, science, medicine, economics, languages, everyday skills, math, OR software/systems) before considering custom canvas:
- kind="state-model" with presentation.style="scientific": universal default for discrete cause-and-effect mechanisms in ANY subject (biology, economics, history, law, cooking, physics, or programming). Values and relationships must actually change when a learner chooses an action.
- kind="timeline": multi-actor sequences over time in ANY subject — physiological signaling, historical events, dialogues, supply chains, cooking prep, OR concurrent threads, channels, locks, and network protocols.
- kind="diagram": structural and layered concept/system schematics in ANY subject — ecosystems, anatomical pathways, legal/economic flows, historical causes, OR software architectures — with semantic shapes, nested groups, and progressive layers.
- kind="graph" or kind="explorer": genuine quantitative relationships and mathematical curves (math, physics, economics, statistics).
- kind="phrase-builder": spoken-language word order and sentence structure.
- kind="memory-model": ONLY for programming/CS topics involving stack vs. heap layout, pointers/references, contiguous arrays/slices/buffers (len/cap slots), or object field mutations. Never use memory-model for non-programming subjects.
Do not generate custom HTML/CSS/canvas merely to show values, arrows, timelines, or steps. Use kind="canvas" only when continuous behavior, geometry, physics, or 3D spatial structure (molecules, anatomy, vectors, mechanics) cannot be expressed by these owned renderers. Never add a simulation unrelated to the subject.

1. SCIENTIFIC TEACHING FIGURES (kind="state-model", the universal default for discrete mechanisms):
   A minimal valid stateModel example is {"version":1,"presentation":{"style":"scientific","layout":"lanes"},"initialStateId":"start","entities":[{"id":"participant","label":"Participant"}],"states":[{"id":"start","label":"Before the action","description":"The participant has not received the item.","entities":[{"entityId":"participant","status":"Waiting","value":"No item","tone":"waiting"}],"relations":[]},{"id":"received","label":"After the action","description":"The participant now has the item.","entities":[{"entityId":"participant","status":"Received","value":"One item","tone":"done"}],"relations":[]}],"transitions":[{"id":"receive","from":"start","to":"received","label":"Receive the item","explanation":"Possession changes when the item arrives."}]}.
   Fill this structure with 1–6 entities, 2–6 meaningful states and reachable actions for THIS concept (up to 20 states / 40 transitions, at most 4 outgoing actions per state). Every state must list exactly one snapshot for every entity. For a code-valued snapshot, set format="code", language to the actual programming language, and value to a short valid snippet with real newlines and indentation (JSON-escaped). Code values may have up to 2000 characters / 40 lines. Do not flatten declarations or method lists into prose; preserve the language's correct declaration syntax. Use short human labels for entities, rather than putting the whole declaration in the label. Simple inline identifiers may use backticks; $...$ is only for actual math. Other subjects use ordinary words, with optional format="text"; ordinary text values stay within 160 characters. Never force code onto a non-programming subject. Snapshot tones are neutral|active|waiting|done. Optional state-specific relations are [{"id":"relation","from":"entity-id","to":"other-entity-id","kind":"value|reference|flow","label":"Concise explanation of the actual relationship"}], at most 12 per state. Only connect known, distinct entities. State changes should alter a value, relationship or visible status for a meaningful reason; do not create multiple states that only change prose.
   Scientific lanes show the current mechanism. Scientific comparison aligns the initial and current state for before/after reasoning. The renderer owns all geometry and controls: do not specify CSS, colors, coordinates or HTML. Use a short caption, sentence-case labels, concise values and an intuitive analogy if needed. Do not force mathematical symbols onto nonmathematical subjects. Optional reading-only source={language,code} can relate sourceLines on transitions to a small example, but this is an illustrative model, not a real execution trace. Do not invent memory addresses, measured timings or runtime evidence. Teach a contrasting choice or smaller step when useful. Remain language- and subject-neutral: preserve the learner's exact subject.
   Existing non-scientific state-models remain compatible, but new ordinary teaching figures should set presentation.style="scientific".
   Keep a mathematical equation together as one typeset entity value; do not split its operands and equals sign into disconnected nodes. Relations represent genuine directed relationships, not decorative arrows or an equality symbol.

2. MULTI-ACTOR TIMELINES (kind="timeline" — swimlane actors & interactions over time, for ANY subject):
   For parallel actors, stages, or systems interacting across time (biological signaling, historical negotiations, economic transmission, dialogues, OR concurrent workers, channels, locks, and network protocols), use kind="timeline" with timeline={"version":1,"actors":[{"id":"a1","label":"First actor","role":"participant"},{"id":"a2","label":"Second actor","role":"system"}],"steps":[{"id":"s1","label":"Step title","explanation":"What happens at this moment","lanes":[{"actorId":"a1","state":"idle|running|blocked|waiting|done|error","label":"optional status"},{"actorId":"a2","state":"waiting"}],"messages":[{"from":"a1","to":"a2","label":"interaction label","kind":"signal|transfer|trigger|send|receive|call|response|cancel|lock"}]}]}.
   Include 2–6 actors (optional role: participant|entity|system|stage|signal|agent for general subjects, or client|server|worker|channel|lock|node|process|goroutine for computing) and 2–16 steps. Optional language/source/codeLine are ONLY for programming subjects. Use lanes to show which actors are active, blocked, waiting, done, or in error at each step, and messages to show directed exchanges or triggers.

3. LAYERED STRUCTURAL & CONCEPT SCHEMATICS (kind="diagram" — semantic shapes, nested groups & progressive layers, for ANY subject):
   For structural and multi-part relationships in ANY subject (biological pathways, economic systems, historical institutions, argument structures, OR software architectures), use kind="diagram" with diagram={"direction":"LR","groups":[{"id":"core","label":"Core System","tone":"blue"}],"layers":[{"label":"Core flow","summary":"Primary relationship"},{"label":"Feedback & storage","summary":"Secondary mechanism"}],"nodes":[{"id":"origin","label":"Origin","shape":"actor","layer":1,"detail":"Explain this element in the learner's own subject.","tone":"neutral"},{"id":"hub","label":"Core Process","shape":"process","group":"core","layer":1,"detail":"Explain how it transforms or mediates.","tone":"accent"},{"id":"reserve","label":"Reserve","shape":"store","group":"core","layer":2,"detail":"Explain what is stored or accumulated.","tone":"teal"}],"edges":[{"from":"origin","to":"hub","label":"Initiates","layer":1},{"from":"hub","to":"reserve","label":"Stores","layer":2}]}.
   Include 2–12 unique nodes, no decorative badge labels, and up to 24 directed edges. Choose a semantic node.shape matching the learner's subject (concept|actor|process|store|decision|outcome|box for general subjects; database|queue|client|service|interface|module|worker for computing), use optional nested groups ([{id,label,tone}] + node.group) to cluster subsystems, and use optional progressive disclosure layers ([{label,summary}] + 1-indexed node.layer and edge.layer) so complex diagrams reveal incrementally instead of dumping every node at once. Optional formula is only for real mathematical relationships, and optional code is only for programming subjects.

4. MEMORY & EXECUTION LAYOUTS (kind="memory-model" — programming/CS subjects ONLY):
   ONLY when the learner's subject is programming or computer science involving stack vs. heap layout, pointers/references, contiguous arrays/slices/buffers (len/cap slots), or struct/object field mutations, use kind="memory-model" with memoryModel={"version":1,"language":"...","source":"line 1\\nline 2","frames":[{"id":"f1","label":"Step title","explanation":"What changed in memory","codeLine":1,"predictionPrompt":"Optional check-your-prediction prompt","blocks":[{"id":"b1","label":"Header","region":"stack","kind":"slice","fields":[{"name":"ptr","value":"-> arr[0]","pointsTo":"b2:0","changed":true},{"name":"len","value":"2"}],"meta":"cap=4","changed":true},{"id":"b2","label":"Backing array","region":"heap","kind":"array","cells":[{"index":"0","value":"10","highlight":true},{"index":"1","value":"20"},{"index":"2","value":"","inactive":true}],"stale":false}]}]}.
   Every block must declare at least one entry in fields ([{name,value,pointsTo?,changed?}]) or cells ([{index,value,highlight?,inactive?}]). Use region="stack|heap", kind="frame|struct|slice|array|map|value", optional pointsTo ("blockId" or "blockId:cellIndex") for live pointer arrows, optional codeLine (1-indexed against source), and optional predictionPrompt before revealing a frame. Do not fabricate hex addresses or claim measured runtime evidence. Never use memory-model for non-programming subjects.

5. MATHEMATICAL CURVE LABS (kind="explorer" — powered by Mafs interactive pan/zoom Cartesian plane + KaTeX):
   When a concept is a genuine 1D mathematical function y = f(x) with 1–4 numeric parameters (derivatives, damping, growth, probability distributions, loss curves), use kind="explorer" with explorer={"prompt":"What to sweep and observe","parameters":[{"id":"alpha","label":"Step size $\\\\alpha$","min":0.05,"max":1.2,"step":0.05,"initial":0.2,"unit":""}],"outputs":[{"id":"update","label":"Next state","expression":"1 - 2 * alpha","unit":"","precision":2}],"curve":{"xLabel":"w","yLabel":"L(w)","xMin":-2,"xMax":2,"expression":"alpha * x ^ 2","markerXExpression":"1 - 2 * alpha"}}. Identifiers must be valid variable names other than x; expressions use +, -, *, /, ^, sin, cos, tan, exp, log, ln, sqrt, abs, min, max, clamp, pow, PI, E.

6. CUSTOM INTERACTIVE FIGURES (kind="canvas" — only when mechanics, physics, geometry, or dynamic models cannot be expressed by owned renderers):
   Include canvas={"controlsHint":"Toggle methods or adjust sliders...","height":360,"html":"<canvas id=\\"stage\\" width=\\"580\\" height=\\"240\\"></canvas><div class=\\"controls\\">...</div>","css":"","js":"..."}.
   Pre-bundled offline libraries available inside the zero-origin sandbox (NO external CDN <script src>, NO fetch/WebSocket, NO localStorage/cookies):
   - 2D Retina Studio Kit: const { canvas, ctx, width, height } = window.setupForgeCanvas("stage", 240) + window.FORGE_THEME ({ bg, surface, border, text, muted, accent, teal, coral, blue, violet }) + window.FORGE_DRAW ({ grid(ctx,w,h), arrow(ctx,x1,y1,x2,y2,color), card(ctx,x,y,w,h,opts), pill(ctx,text,x,y,color) }). Always draw immediately on load and redraw whenever controls change!
   - 3D WebGL (Three.js): Call const { THREE, scene, camera, onFrame, setOrbit } = window.setupForge3D("stage", 260, { distance: 6, autoRotate: 0.2 }) — pre-configured with Retina antialiasing, 3-point bronze/teal studio lighting, pointer-drag spherical orbit, and wheel zoom. Ideal for 3D vectors, 3D surfaces z=f(x,y), molecules, orbital mechanics, and coordinate transforms.
   - D3.js v7 (window.d3): Full d3.select, d3.scaleLinear, d3.line().curve(d3.curveCatmullRom), d3.forceSimulation, d3.area, and smooth transitions inside an <svg> or <canvas>.
   - Rough.js (window.rough): Call const rc = rough.canvas(canvas) for expressive hand-sketched diagrams (rc.rectangle, rc.circle, rc.line, rc.curve with hachure fills).
   - Optional KaTeX (for genuine math/science topics ONLY): Any $...$ in canvas.html is rendered with KaTeX, and window.katex.render(tex, el, { throwOnError: false }) is available for live equation updates.
   - Pre-styled figure classes: .controls (compact control row), .pill-group, .metric-grid > .metric (<small>Label</small><strong>Value</strong>), and optional .formula-bar (use ONLY for real math/physics equations or plain-English live status badges). Give every slider/button a clear label and live readout, and respect window.FORGE_REDUCED_MOTION. Do NOT add inline style colors/borders/backgrounds to buttons, inputs, or the canvas — the sandbox theme already styles them consistently (use class="active" or aria-pressed="true" for the selected toggle). Keep the layout compact: no empty padding boxes, and wrap long code lines rather than letting them overflow.
   - SINGLE FIGURE CONTRACT: Return only the model and its local controls. The host supplies the title, help, explanation, reset, export, and regeneration. Do not add your own page header, studio badge, toolbar, Reset/Restart button, takeaway panel, card stack or secondary navigation. Keep the model and its local controls together with no internal vertical scrolling.
   - RESPONSIVE GEOMETRY: Use returned width/height from setupForgeCanvas to calculate positions, sizes and line wraps. Do not assume a fixed desktop width. Keep all labels and entities visible at a 320px container; use a compact layout or stacked lanes when needed. Never scale labels below readable size or draw text outside the surface. SVG needs a meaningful viewBox. Avoid fixed/min-width pixel layouts, 100vh, overflow:auto/scroll and large blank space.
   - CONTROL HIERARCHY: Use at most one visually primary action (class="primary") with a plain verb such as Step, Play or Apply. Other controls use the supplied neutral styles and aria-pressed for toggles. Use FORGE_THEME colors and supplied fonts instead of neon colors, custom button gradients, inline backgrounds or a second app theme. Put parameter controls beside or just below what they affect, and show a short visible result when the learner changes something. Start in a meaningful initial state; no decorative or non-working controls.
   - PLAIN GUIDANCE: controlsHint is one brief instruction telling the learner what to change and what to notice. Titles use familiar words in 4–9 words. Define new terms in explanation notes; avoid abstract technical noun stacks, promotional headings and words such as immersive, studio, blueprint, drill or lab unless they name the learner's actual subject. For canvas text use at least 13px; reserve code font for code tokens and values. Respect reduced motion and retain keyboard-operable DOM controls.
   - In lesson prose outside forge-visual, you may also embed \`\`\`forge-canvas JSON blocks or \`\`\`mermaid architecture/sequence/class/state diagrams when helpful.

7. SLOPE & SPOKEN PHRASES:
   Only when the concept is straight-line slope or rise/run, use kind="graph" with graph={"type":"slope","points":[{"x":-2,"y":-1},{"x":2,"y":3}]} (coordinates in [-5, 5] step 0.5). For spoken-language word order, use kind="phrase-builder" (or kind="parts" strictly for spoken-language phrase morphology with accurate diacritics; no fake audio claims).

EXPLANATION NOTES (items):
Every forge-visual MUST include title (clear, human, non-pretentious), summary (plain, intuitive explanation with \`code\` tokens or real math only when appropriate), 2–4 concise explanation notes (each with unique id, short familiar label, and clear description), and one-sentence takeaway. Notes live in an optional explanation disclosure; they do not control the model. Do not repeat the summary, controlsHint or takeaway across notes. The figure should be understandable and usable before opening the explanation. All visual help is supported practice, never independent mastery, and must never encode the answer key to a pending check.

Schema:
\`\`\`forge-visual
{"kind":"canvas|explorer|diagram|memory-model|timeline|state-model|graph|phrase-builder","title":"Clear figure title","summary":"Plain, intuitive explanation of what to explore","items":[{"id":"layer1","label":"What changes","description":"One concrete cause and its visible effect"},{"id":"layer2","label":"Edge case or contrast","description":"Why a mismatch or parameter change alters behavior"}],"takeaway":"Clear, practical principle to apply next"}
\`\`\``;
