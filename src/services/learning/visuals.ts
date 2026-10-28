import { validateStateModel, type StateModel } from './stateModel';
import { validateSlopeGraph, type SlopeGraphSpec } from './math';
export interface VisualExample {
  kind:
    | "parts"
    | "comparison"
    | "flow"
    | "steps"
    | "simulation"
    | "phrase-builder"
    | "graph"
    | "state-model";
  model?: "go-channel" | "http-response" | "go-slice";
  graph?: SlopeGraphSpec;
  stateModel?: StateModel;
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
MATH GRAPHS: Only when the CURRENT concept is slope, gradients of a straight line, or rise/run, use kind="graph" and graph={"type":"slope","points":[{"x":-2,"y":-1},{"x":2,"y":3}]}. Choose your own two relevant points: each coordinate must be a finite number between -5 and 5 in increments of 0.5. The owned graph supports dragging/keyboard movement of A and B, exact slope fractions, horizontal/vertical lines and coincident points, with a text equivalent. Include the usual title/summary/items/takeaway. Use an analogous example, never the coordinates or answer of a pending question. This is a slope model only: do not call it a derivative, nonlinear curve, physics simulation or generic function plotter. Never choose a math graph for a language lesson or unrelated subject.
INTERACTIVE WALKTHROUGHS: Use kind="state-model" for a concept whose entities change as the learner chooses actions. This is language- and subject-neutral: derive the entities, statuses, values, allowed actions and explanations from THIS learner's actual concept and relevant source. Do not choose a canned program or change the subject. This walkthrough renderer does not select behavior rules by programming language. It navigates the finite state graph you supply, labels it as an illustrative concept walkthrough, and does NOT execute the supplied source or verify its behavior. Do not present it as an actual runtime trace, live debugger, measured timing, verified simulation or independent assessment.
Include the usual title, summary, items and takeaway plus a stateModel object. version=1; initialStateId references one of the states; entities has 1–6 unique {id,label} entries. states has 2–20 unique {id,label,description,entities} entries: EACH state's entities must contain exactly one {entityId,status,value,tone} per entity. status is short natural text, value is readable state data, tone is neutral|active|waiting|done and is never the only description. transitions has 1–40 unique {id,from,to,label,explanation,sourceLines?} entries; from/to must be different existing state ids, all states reachable from initialStateId, at most FOUR actions per state. Branches and cycles are allowed; include alternatives when they explain the concept rather than pretending one execution order is guaranteed. If you cannot reliably explain valid state changes, provide a static illustration and acknowledge the limitation rather than inventing behavior. Keep the first experiment small: about 2–4 entities, 3–7 states and 1–2 concise actions at each state. The learner can step, go back, explore another branch and replay.
Optional source={language:"actual source language identifier",code:"relevant concise source excerpt"} is for reading only, at most 60 lines/6000 characters; use sourceLines as 1-based highlighted line numbers for the action. Do not fabricate source execution or put runnable callbacks, guards, HTML, SVG or scripts into the descriptor. Omit source entirely for non-coding concepts. Explain a state/transition's meaning simply. Do not use language names to select an app-specific model. For obsolete fixed models, do not emit kind="simulation"; use this declarative contract instead.
When practising word or phrase order, kind="phrase-builder" is also available with items in the intended order; use a short analogous phrase, not the pending assessment answer. All visual help is supported practice, never evidence of independent mastery.
Use parts for phrase chunks or labeled parts, comparison for contrasting examples, flow for a directed process, or steps for changing states. Preserve the current subject, natural wording and meaningful notation; do not turn every concept into a pipeline. No fake audio, waveforms, pronunciation scores, arbitrary HTML, SVG or scripts inside forge-visual, or invented sources. All descriptor strings render as text. Standalone illustrations use the separate shared illustration contract.
Schema (2–6 items with unique ids):
\`\`\`forge-visual
{"kind":"parts|comparison|flow|steps|phrase-builder|graph|state-model","title":"Plain short title","summary":"Text equivalent explaining the whole visual","items":[{"id":"one","label":"Visible phrase, state or example","description":"One plain-language explanation of this part"},{"id":"two","label":"Another part","description":"Explain its relationship to the idea"}],"takeaway":"One short point to apply in a new situation"}
\`\`\`
For kind state-model include stateModel as specified above and omit model. For kind graph include its graph field and omit model. For other kinds omit model. Items in flow, steps and phrase-builder are ordered; only use that order when it is meaningful. A comparison does not imply a timeline. Keep the graphic focused on ONE idea. Do not encode answer keys or correct-option labels into a visual meant to help with a pending assessment. A visual request alone should not replace the pending question or approve advancement. Follow-up fresh checks must use a different case and reduced scaffolding.`;
