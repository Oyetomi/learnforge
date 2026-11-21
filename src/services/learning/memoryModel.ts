/** Declarative memory and data-structure frame model. No code is executed. */

export interface MemoryCell {
  index: string;
  value: string;
  highlight?: boolean;
  /** Outside active length / spare capacity (e.g. slice cap > len) */
  inactive?: boolean;
}

export interface MemoryField {
  name: string;
  value: string;
  /** Optional pointer target: "blockId" or "blockId:cellIndex" */
  pointsTo?: string;
  changed?: boolean;
}

export type MemoryBlockKind =
  | "frame"
  | "struct"
  | "slice"
  | "array"
  | "map"
  | "value";

export interface MemoryBlock {
  id: string;
  label: string;
  region: "stack" | "heap";
  kind: MemoryBlockKind;
  fields?: MemoryField[];
  cells?: MemoryCell[];
  meta?: string;
  changed?: boolean;
  stale?: boolean;
}

export interface MemoryFrame {
  id: string;
  label: string;
  explanation: string;
  codeLine?: number;
  blocks: MemoryBlock[];
  /** Optional active-learning micro-prompt before revealing this frame */
  predictionPrompt?: string;
}

export interface MemoryModelSpec {
  version: 1;
  language?: string;
  source?: string;
  frames: MemoryFrame[];
}

const ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const VALID_KINDS: ReadonlyArray<MemoryBlockKind> = [
  "frame",
  "struct",
  "slice",
  "array",
  "map",
  "value",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validId(value: unknown): string {
  return typeof value === "string" && ID_RE.test(value) ? value : "";
}

function requiredText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : "";
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max) return null;
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") return null;
  return value;
}

function hasDistinctIds(ids: string[]): boolean {
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

export function parsePointerTarget(pointsTo: string): {
  blockId: string;
  cellIndex?: string;
} {
  const trimmed = pointsTo.trim();
  const sep = trimmed.indexOf(":");
  if (sep === -1) {
    return { blockId: trimmed };
  }
  const blockId = trimmed.slice(0, sep).trim();
  const cellIndex = trimmed.slice(sep + 1).trim();
  return cellIndex ? { blockId, cellIndex } : { blockId };
}

function defaultRegionForKind(kind: MemoryBlockKind): "stack" | "heap" {
  return kind === "array" ? "heap" : "stack";
}

interface RawFieldWithPointer {
  name: string;
  value: string;
  rawPointsTo?: unknown;
  changed?: boolean;
}

interface PendingBlock {
  id: string;
  label: string;
  region: "stack" | "heap";
  kind: MemoryBlockKind;
  fields?: RawFieldWithPointer[];
  cells?: MemoryCell[];
  meta?: string;
  changed?: boolean;
  stale?: boolean;
}

export function validateMemoryModel(input: unknown): MemoryModelSpec | null {
  const root = asRecord(input);
  if (!root) return null;

  if (root.version !== undefined && root.version !== 1) return null;

  const language = optionalText(root.language, 40);
  if (language === null) return null;

  let source: string | undefined;
  let sourceLineCount = 0;
  if (root.source !== undefined) {
    if (typeof root.source !== "string") return null;
    const normalized = root.source.replace(/\r\n/g, "\n");
    if (normalized.length > 4000) return null;
    const lines = normalized.split("\n");
    if (lines.length > 50) return null;
    if (normalized.trim().length > 0) {
      source = normalized;
      sourceLineCount = lines.length;
    }
  }

  if (
    !Array.isArray(root.frames) ||
    root.frames.length < 1 ||
    root.frames.length > 12
  ) {
    return null;
  }

  const frames: MemoryFrame[] = [];

  for (const rawFrame of root.frames) {
    const f = asRecord(rawFrame);
    if (!f) return null;

    const frameId = validId(f.id);
    const frameLabel = requiredText(f.label, 100);
    const explanation = requiredText(f.explanation, 500);
    if (!frameId || !frameLabel || !explanation) return null;

    const predictionPrompt = optionalText(f.predictionPrompt, 300);
    if (predictionPrompt === null) return null;

    let codeLine: number | undefined;
    if (f.codeLine !== undefined) {
      if (
        typeof f.codeLine !== "number" ||
        !Number.isInteger(f.codeLine) ||
        f.codeLine < 1 ||
        sourceLineCount < 1 ||
        f.codeLine > sourceLineCount
      ) {
        return null;
      }
      codeLine = f.codeLine;
    }

    if (
      !Array.isArray(f.blocks) ||
      f.blocks.length < 1 ||
      f.blocks.length > 10
    ) {
      return null;
    }

    const pendingBlocks: PendingBlock[] = [];

    for (const rawBlock of f.blocks) {
      const b = asRecord(rawBlock);
      if (!b) return null;

      const blockId = validId(b.id);
      const blockLabel = requiredText(b.label, 80);
      if (!blockId || !blockLabel) return null;

      const meta = optionalText(b.meta, 80);
      if (meta === null) return null;

      const changed = optionalBoolean(b.changed);
      if (changed === null) return null;

      const stale = optionalBoolean(b.stale);
      if (stale === null) return null;

      let fields: RawFieldWithPointer[] | undefined;
      if (b.fields !== undefined) {
        if (!Array.isArray(b.fields) || b.fields.length > 12) return null;
        if (b.fields.length > 0) {
          fields = [];
          for (const rawField of b.fields) {
            const rf = asRecord(rawField);
            if (!rf) return null;
            const fieldName = requiredText(rf.name, 60);
            if (!fieldName || typeof rf.value !== "string") return null;
            const fieldValue = rf.value.trim();
            if (fieldValue.length > 80) return null;
            const fieldChanged = optionalBoolean(rf.changed);
            if (fieldChanged === null) return null;
            fields.push({
              name: fieldName,
              value: fieldValue,
              ...(rf.pointsTo !== undefined ? { rawPointsTo: rf.pointsTo } : {}),
              ...(fieldChanged !== undefined ? { changed: fieldChanged } : {}),
            });
          }
        }
      }

      let cells: MemoryCell[] | undefined;
      if (b.cells !== undefined) {
        if (!Array.isArray(b.cells) || b.cells.length > 16) return null;
        if (b.cells.length > 0) {
          cells = [];
          for (const rawCell of b.cells) {
            const rc = asRecord(rawCell);
            if (!rc) return null;
            let cellIndex = "";
            if (typeof rc.index === "number" && Number.isFinite(rc.index)) {
              cellIndex = String(rc.index);
            } else if (typeof rc.index === "string") {
              cellIndex = rc.index.trim();
            } else {
              return null;
            }
            if (!cellIndex || cellIndex.length > 16) return null;
            if (typeof rc.value !== "string") return null;
            const cellValue = rc.value.trim();
            if (cellValue.length > 60) return null;
            const highlight = optionalBoolean(rc.highlight);
            if (highlight === null) return null;
            const inactive = optionalBoolean(rc.inactive);
            if (inactive === null) return null;
            cells.push({
              index: cellIndex,
              value: cellValue,
              ...(highlight !== undefined ? { highlight } : {}),
              ...(inactive !== undefined ? { inactive } : {}),
            });
          }
        }
      }

      if (
        (!fields || fields.length === 0) &&
        (!cells || cells.length === 0)
      ) {
        return null;
      }

      let kind: MemoryBlockKind;
      if (b.kind === undefined) {
        kind = fields && fields.length > 0 ? "struct" : cells && cells.length > 0 ? "array" : "value";
      } else if (
        typeof b.kind === "string" &&
        VALID_KINDS.includes(b.kind as MemoryBlockKind)
      ) {
        kind = b.kind as MemoryBlockKind;
      } else {
        return null;
      }

      let region: "stack" | "heap";
      if (b.region === undefined) {
        region = defaultRegionForKind(kind);
      } else if (b.region === "stack" || b.region === "heap") {
        region = b.region;
      } else {
        return null;
      }

      pendingBlocks.push({
        id: blockId,
        label: blockLabel,
        region,
        kind,
        ...(fields ? { fields } : {}),
        ...(cells ? { cells } : {}),
        ...(meta ? { meta } : {}),
        ...(changed !== undefined ? { changed } : {}),
        ...(stale !== undefined ? { stale } : {}),
      });
    }

    if (!hasDistinctIds(pendingBlocks.map((b) => b.id))) return null;

    const frameBlockIds = new Set(pendingBlocks.map((b) => b.id));

    const blocks: MemoryBlock[] = pendingBlocks.map((pb) => {
      const sanitizedFields: MemoryField[] | undefined = pb.fields
        ? pb.fields.map((field) => {
            let pointsTo: string | undefined;
            if (typeof field.rawPointsTo === "string" && field.rawPointsTo.trim()) {
              const parsed = parsePointerTarget(field.rawPointsTo);
              if (
                validId(parsed.blockId) &&
                frameBlockIds.has(parsed.blockId) &&
                (parsed.cellIndex === undefined ||
                  (parsed.cellIndex.length > 0 && parsed.cellIndex.length <= 16))
              ) {
                pointsTo =
                  parsed.cellIndex !== undefined
                    ? `${parsed.blockId}:${parsed.cellIndex}`
                    : parsed.blockId;
              }
            }
            return {
              name: field.name,
              value: field.value,
              ...(pointsTo ? { pointsTo } : {}),
              ...(field.changed !== undefined ? { changed: field.changed } : {}),
            };
          })
        : undefined;

      return {
        id: pb.id,
        label: pb.label,
        region: pb.region,
        kind: pb.kind,
        ...(sanitizedFields ? { fields: sanitizedFields } : {}),
        ...(pb.cells ? { cells: pb.cells } : {}),
        ...(pb.meta ? { meta: pb.meta } : {}),
        ...(pb.changed !== undefined ? { changed: pb.changed } : {}),
        ...(pb.stale !== undefined ? { stale: pb.stale } : {}),
      };
    });

    frames.push({
      id: frameId,
      label: frameLabel,
      explanation,
      ...(codeLine !== undefined ? { codeLine } : {}),
      blocks,
      ...(predictionPrompt ? { predictionPrompt } : {}),
    });
  }

  if (!hasDistinctIds(frames.map((f) => f.id))) return null;

  return {
    version: 1,
    ...(language ? { language } : {}),
    ...(source ? { source } : {}),
    frames,
  };
}
