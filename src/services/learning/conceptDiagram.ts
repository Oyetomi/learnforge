/**
 * Declarative Concept & Architecture Schematic Contract (`kind: "diagram"`),
 * plus automatic blueprint upgrade for legacy `parts`, `comparison`, `flow`,
 * and `steps` visuals so LearnForge never renders plain dull rectangles.
 */

export type DiagramNodeTone = "accent" | "teal" | "blue" | "coral" | "neutral";

export type DiagramNodeShape =
  | "box"
  | "concept"
  | "actor"
  | "process"
  | "store"
  | "decision"
  | "outcome"
  | "database"
  | "queue"
  | "client"
  | "service"
  | "interface"
  | "module"
  | "worker";

export interface ConceptDiagramGroup {
  id: string;
  label: string;
  tone?: DiagramNodeTone;
}

export interface ConceptDiagramLayer {
  label: string;
  summary?: string;
}

export interface ConceptDiagramNode {
  id: string;
  label: string;
  /** Short uppercase role eyebrow (e.g. "CONTRACT", "CONCRETE STRUCT", "INVARIANT"). */
  badge?: string;
  /** Optional LaTeX math expression without surrounding `$` (rendered via KaTeX). */
  formula?: string;
  /** Optional concise code signature (syntax-highlighted). */
  code?: string;
  /** Plain/LaTeX/code explanation shown when inspected. */
  detail: string;
  tone?: DiagramNodeTone;
  /** Optional architectural silhouette / semantic icon. */
  shape?: DiagramNodeShape;
  /** Optional group container id matching a declared entry in `spec.groups`. */
  group?: string;
  /** Optional 1-indexed progressive disclosure layer matching `spec.layers`. */
  layer?: number;
}

export interface ConceptDiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
  /** Optional 1-indexed progressive disclosure layer matching `spec.layers`. */
  layer?: number;
}

export interface ConceptDiagramSpec {
  direction: "LR" | "TB";
  nodes: ConceptDiagramNode[];
  edges: ConceptDiagramEdge[];
  groups?: ConceptDiagramGroup[];
  layers?: ConceptDiagramLayer[];
}

const VALID_TONES = new Set<DiagramNodeTone>([
  "accent",
  "teal",
  "blue",
  "coral",
  "neutral",
]);

const VALID_SHAPES = new Set<DiagramNodeShape>([
  "box",
  "concept",
  "actor",
  "process",
  "store",
  "decision",
  "outcome",
  "database",
  "queue",
  "client",
  "service",
  "interface",
  "module",
  "worker",
]);

const clean = (v: unknown, max: number): string =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max
    ? v.trim()
    : "";

const validLayer = (v: unknown, maxLayer: number): number | undefined => {
  if (maxLayer < 2 || typeof v !== "number" || !Number.isInteger(v)) {
    return undefined;
  }
  return v >= 1 && v <= maxLayer ? v : undefined;
};

export function validateConceptDiagram(
  value: unknown
): ConceptDiagramSpec | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.nodes) || raw.nodes.length < 2 || raw.nodes.length > 12) {
    return null;
  }

  const direction: "LR" | "TB" =
    raw.direction === "TB" || raw.direction === "TD" ? "TB" : "LR";

  // Optional architectural container groups (up to 6 unique valid group ids)
  const validGroups: ConceptDiagramGroup[] = [];
  const declaredGroupIds = new Set<string>();
  if (Array.isArray(raw.groups)) {
    for (const item of raw.groups) {
      if (validGroups.length >= 6) break;
      if (!item || typeof item !== "object") continue;
      const g = item as Record<string, unknown>;
      const id = clean(g.id, 48);
      const label = clean(g.label, 60);
      if (!id || !label || declaredGroupIds.has(id)) continue;
      declaredGroupIds.add(id);
      const toneCandidate =
        typeof g.tone === "string" ? (g.tone.trim() as DiagramNodeTone) : undefined;
      const tone =
        toneCandidate && VALID_TONES.has(toneCandidate) ? toneCandidate : undefined;
      validGroups.push({
        id,
        label,
        ...(tone ? { tone } : {}),
      });
    }
  }
  const groups = validGroups.length > 0 ? validGroups : undefined;

  // Optional progressive disclosure layers (2..6 layers)
  const validLayers: ConceptDiagramLayer[] = [];
  if (Array.isArray(raw.layers)) {
    for (const item of raw.layers) {
      if (validLayers.length >= 6) break;
      if (!item || typeof item !== "object") continue;
      const l = item as Record<string, unknown>;
      const label = clean(l.label, 60);
      if (!label) continue;
      const summary = clean(l.summary, 240) || undefined;
      validLayers.push({
        label,
        ...(summary ? { summary } : {}),
      });
    }
  }
  const layers = validLayers.length >= 2 ? validLayers : undefined;
  const maxLayer = layers ? layers.length : 0;

  const nodes: ConceptDiagramNode[] = [];
  const seenIds = new Set<string>();

  for (const item of raw.nodes) {
    if (!item || typeof item !== "object") return null;
    const n = item as Record<string, unknown>;
    const id = clean(n.id, 48);
    const label = clean(n.label, 120);
    const detail = clean(n.detail ?? n.description, 520);
    if (!id || !label || !detail || seenIds.has(id)) return null;
    seenIds.add(id);

    const badge = clean(n.badge, 36) || undefined;
    const formula = clean(n.formula, 240) || undefined;
    const code = clean(n.code, 260) || undefined;
    const toneRaw = String(n.tone || "neutral") as DiagramNodeTone;
    const tone: DiagramNodeTone = VALID_TONES.has(toneRaw) ? toneRaw : "neutral";
    const shapeCandidate =
      typeof n.shape === "string" ? (n.shape.trim() as DiagramNodeShape) : undefined;
    const shape =
      shapeCandidate && VALID_SHAPES.has(shapeCandidate)
        ? shapeCandidate
        : undefined;
    const groupCandidate = clean(n.group, 48);
    const group =
      groupCandidate && declaredGroupIds.has(groupCandidate)
        ? groupCandidate
        : undefined;
    const layer = validLayer(n.layer, maxLayer);

    nodes.push({
      id,
      label,
      ...(badge ? { badge } : {}),
      ...(formula ? { formula } : {}),
      ...(code ? { code } : {}),
      detail,
      tone,
      ...(shape ? { shape } : {}),
      ...(group ? { group } : {}),
      ...(layer !== undefined ? { layer } : {}),
    });
  }

  const edges: ConceptDiagramEdge[] = [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  if (rawEdges.length > 24) return null;

  for (let i = 0; i < rawEdges.length; i++) {
    const e = rawEdges[i];
    if (!e || typeof e !== "object") return null;
    const rec = e as Record<string, unknown>;
    const from = clean(rec.from ?? rec.source, 48);
    const to = clean(rec.to ?? rec.target, 48);
    if (!from || !to || from === to || !seenIds.has(from) || !seenIds.has(to)) {
      return null;
    }
    const id = clean(rec.id, 64) || `e-${from}-${to}-${i}`;
    const label = clean(rec.label, 64) || undefined;
    const animated = rec.animated !== false;
    const layer = validLayer(rec.layer, maxLayer);
    edges.push({
      id,
      from,
      to,
      ...(label ? { label } : {}),
      animated,
      ...(layer !== undefined ? { layer } : {}),
    });
  }

  return {
    direction,
    nodes,
    edges,
    ...(groups ? { groups } : {}),
    ...(layers ? { layers } : {}),
  };
}

function inferRoleFromItem(
  label: string,
  kind: "parts" | "comparison" | "flow" | "steps",
  index: number
): { badge: string; tone: DiagramNodeTone; isCode: boolean } {
  const t = label.trim();
  if (/\binterface\b/i.test(t) || /\btrait\b/i.test(t) || /\bprotocol\b/i.test(t)) {
    return { badge: "CONTRACT", tone: "accent", isCode: true };
  }
  if (/\bstruct\b/i.test(t) || /\bclass\b/i.test(t)) {
    return { badge: "CONCRETE TYPE", tone: "blue", isCode: true };
  }
  if (/^(?:func|fn|def)\b/.test(t) || /=>|->/.test(t)) {
    return { badge: "IMPLEMENTATION", tone: "teal", isCode: true };
  }
  const codeLike =
    /^(?:type\s+\w+|const\s+|let\s+|var\s+|SELECT\s+)/.test(t) ||
    (/\{[\s\S]*\}/.test(t) && /[();:=]/.test(t));

  if (kind === "steps") {
    return {
      badge: `STAGE 0${index + 1}`,
      tone: index === 0 ? "accent" : index % 2 === 1 ? "teal" : "blue",
      isCode: codeLike,
    };
  }
  if (kind === "flow") {
    return {
      badge: `NODE 0${index + 1}`,
      tone: index === 0 ? "accent" : "teal",
      isCode: codeLike,
    };
  }
  if (kind === "comparison") {
    const tones: DiagramNodeTone[] = ["accent", "teal", "blue", "coral"];
    return {
      badge: `CASE ${String.fromCharCode(65 + index)}`,
      tone: tones[index % tones.length],
      isCode: codeLike,
    };
  }
  return {
    badge: `PART 0${index + 1}`,
    tone: index === 0 ? "accent" : index === 1 ? "blue" : "teal",
    isCode: codeLike,
  };
}

/**
 * Automatically upgrades `parts`, `comparison`, `flow`, and `steps` visuals
 * into a Dagre-compatible schematic graph with inferred badges, syntax-highlighted
 * code slots, and meaningful relationship edges.
 */
export function deriveSchematicFromLegacyItems(
  kind: "parts" | "comparison" | "flow" | "steps",
  items: { id: string; label: string; description: string }[]
): ConceptDiagramSpec {
  const nodes: ConceptDiagramNode[] = items.map((item, idx) => {
    const inferred = inferRoleFromItem(item.label, kind, idx);
    return {
      id: item.id,
      label: inferred.isCode ? inferred.badge : item.label,
      badge: inferred.badge,
      ...(inferred.isCode ? { code: item.label } : {}),
      detail: item.description,
      tone: inferred.tone,
    };
  });

  const edges: ConceptDiagramEdge[] = [];
  if (kind === "flow" || kind === "steps") {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `seq-${i}`,
        from: nodes[i].id,
        to: nodes[i + 1].id,
        label: kind === "steps" ? `step ${i + 1} → ${i + 2}` : undefined,
        animated: true,
      });
    }
  } else if (kind === "parts" && nodes.length >= 2) {
    // Connect contract <- implementation or sequential structural parts cleanly
    const hasContract = nodes[0].badge === "CONTRACT";
    if (hasContract && nodes.length === 3 && nodes[2].badge === "IMPLEMENTATION") {
      edges.push(
        {
          id: "impl-binds",
          from: nodes[1].id,
          to: nodes[2].id,
          label: "defines method",
          animated: true,
        },
        {
          id: "satisfies-contract",
          from: nodes[2].id,
          to: nodes[0].id,
          label: "satisfies",
          animated: true,
        }
      );
    } else {
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          id: `part-${i}`,
          from: nodes[i].id,
          to: nodes[i + 1].id,
          animated: false,
        });
      }
    }
  }

  const anyLongCode = nodes.some((n) => (n.code?.length ?? 0) > 40);
  const direction: "LR" | "TB" =
    kind === "comparison"
      ? "LR"
      : (kind === "steps" && anyLongCode) || nodes.length >= 5
      ? "TB"
      : "LR";

  return { direction, nodes, edges };
}
