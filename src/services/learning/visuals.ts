export interface VisualExample {
  kind:
    | "parts"
    | "comparison"
    | "flow"
    | "steps"
    | "simulation"
    | "phrase-builder";
  model?: "go-channel" | "http-response" | "go-slice";
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
    ].includes(String(v.kind))
  )
    return null;
  if (
    v.kind === "simulation" &&
    !["go-channel", "http-response", "go-slice"].includes(String(v.model))
  )
    return null;
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
/** Coding simulations cannot appear in a non-coding or unrelated language course. */
export function visualForSubject(
  visual: VisualExample | null,
  language?: string | null
): VisualExample | null {
  return visual?.kind === "simulation" && language !== "go" ? null : visual;
}
export const VISUAL_INSTRUCTIONS = `VISUAL EXPLANATIONS (forge-visual)
When a learner asks to see an idea visually, return ONE forge-visual JSON block about the CURRENT lesson, using a small analogous example rather than solving their unanswered check. Do not change their subject or goal. You may also include a visual when it clarifies an explanation and their visual preference is auto. If preferences are ask or text, only include it on an explicit visual request.
Choose a visualization that lets the learner act on the concept and observe a meaningful consequence, rather than defaulting to boxes and arrows.
INTERACTIVE MODELS: For Go slice headers, aliasing, length/capacity or append/reallocation use kind="simulation", model="go-slice". It lets the learner drag s start/length bounds, directly edit array cells, copy s to an independent t header, mutate shared storage, grow within capacity and trigger a new allocation B when full. Capacity 8 on growth is illustrative, not a promised Go allocation policy. This model is best for Go slice storage, not general memory management. For a Go channel buffering or rendezvous lesson use kind="simulation", model="go-channel". This owned simulation lets the learner vary capacity 0–2, send and receive integer values, and observe blocking, buffer occupancy and FIFO. It models one sender/receiver and open channels only; do not use it for closing, nil channels, select or general concurrency. For Go HTTP final status/body ordering use kind="simulation", model="http-response". It models WriteHeader(404) and Write(body), implicit 200, and status commitment; no routing, header behavior or network timing. These Go-only simulations have fixed accurate controls; items supply 2–6 relevant reading notes. Do not choose them for unrelated concepts or non-coding goals. When a learner needs to practise word or phrase order use kind="phrase-builder": items in the intended correct order, each label a natural word or phrase chunk and description its meaning/use. The learner arranges chunks and gets feedback. Use a small analogous phrase, not the pending assessment answer. This is supported practice, never evidence of independent mastery.
Use parts for phrase chunks or labeled parts, comparison for contrasting examples, flow for a directed process, or steps for changing states. For Yoruba, preserve diacritics and describe phrase meaning/use without pretending every chunk has a literal one-word translation. For HTTP, show how request information and response writing differ; do not turn every concept into a pipeline. No fake audio, waveforms, pronunciation scores, arbitrary HTML, SVG or scripts inside forge-visual, or invented sources. All descriptor strings render as text. Standalone illustrations use the separate shared illustration contract.
Schema (2–6 items with unique ids):
\`\`\`forge-visual
{"kind":"parts|comparison|flow|steps|simulation|phrase-builder","title":"Plain short title","summary":"Text equivalent explaining the whole visual","items":[{"id":"one","label":"Visible phrase, state or example","description":"One plain-language explanation of this part"},{"id":"two","label":"Another part","description":"Explain its relationship to the idea"}],"takeaway":"One short point to apply in a new situation"}
\`\`\`
For kind simulation, add a field "model":"go-channel", "http-response" or "go-slice". For other kinds omit model. Items in flow, steps and phrase-builder are ordered; only use that order when it is meaningful. A comparison does not imply a timeline. Keep the graphic focused on ONE idea. Do not encode answer keys or correct-option labels into a visual meant to help with a pending assessment. A visual request alone should not replace the pending question or approve advancement. Follow-up fresh checks must use a different case and reduced scaffolding.`;
