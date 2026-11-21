/** Declarative multi-actor timeline model (biology, history, economics, protocols, concurrency). No code is executed. */

export type LaneStateKind =
  | "idle"
  | "running"
  | "blocked"
  | "waiting"
  | "done"
  | "error";

export type TimelineActorRole =
  | "participant"
  | "entity"
  | "system"
  | "stage"
  | "signal"
  | "agent"
  | "goroutine"
  | "channel"
  | "client"
  | "server"
  | "worker"
  | "lock"
  | "node"
  | "process";

export type TimelineMessageKind =
  | "send"
  | "receive"
  | "call"
  | "response"
  | "cancel"
  | "lock"
  | "signal"
  | "transfer"
  | "trigger";

export interface TimelineActor {
  id: string;
  label: string;
  role?: TimelineActorRole;
}

export interface TimelineLaneSnapshot {
  actorId: string;
  state: LaneStateKind;
  label?: string;
}

export interface TimelineMessage {
  from: string;
  to: string;
  label: string;
  kind?: TimelineMessageKind;
}

export interface TimelineStep {
  id: string;
  label: string;
  explanation: string;
  lanes: TimelineLaneSnapshot[];
  messages?: TimelineMessage[];
  codeLine?: number;
}

export interface TimelineModelSpec {
  version: 1;
  language?: string;
  source?: string;
  actors: TimelineActor[];
  steps: TimelineStep[];
}

const VALID_LANE_STATES = new Set<LaneStateKind>([
  "idle",
  "running",
  "blocked",
  "waiting",
  "done",
  "error",
]);

const VALID_ACTOR_ROLES = new Set<TimelineActorRole>([
  "participant",
  "entity",
  "system",
  "stage",
  "signal",
  "agent",
  "goroutine",
  "channel",
  "client",
  "server",
  "worker",
  "lock",
  "node",
  "process",
]);

const VALID_MESSAGE_KINDS = new Set<TimelineMessageKind>([
  "send",
  "receive",
  "call",
  "response",
  "cancel",
  "lock",
  "signal",
  "transfer",
  "trigger",
]);

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,48}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validId(value: unknown): string {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : "";
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : "";
}

function isLaneStateKind(value: unknown): value is LaneStateKind {
  return (
    typeof value === "string" &&
    VALID_LANE_STATES.has(value as LaneStateKind)
  );
}

function isActorRole(value: unknown): value is TimelineActorRole {
  return (
    typeof value === "string" &&
    VALID_ACTOR_ROLES.has(value as TimelineActorRole)
  );
}

function isMessageKind(value: unknown): value is TimelineMessageKind {
  return (
    typeof value === "string" &&
    VALID_MESSAGE_KINDS.has(value as TimelineMessageKind)
  );
}

export function validateTimelineModel(
  input: unknown
): TimelineModelSpec | null {
  const raw = asRecord(input);
  if (!raw) return null;

  if (raw.version !== undefined && raw.version !== 1) return null;

  if (
    !Array.isArray(raw.actors) ||
    raw.actors.length < 2 ||
    raw.actors.length > 6
  ) {
    return null;
  }

  if (
    !Array.isArray(raw.steps) ||
    raw.steps.length < 2 ||
    raw.steps.length > 16
  ) {
    return null;
  }

  let language: string | undefined;
  if (raw.language !== undefined) {
    if (typeof raw.language !== "string") return null;
    const trimmed = raw.language.trim();
    if (trimmed.length > 40) return null;
    if (trimmed.length > 0) language = trimmed;
  }

  let source: string | undefined;
  let sourceLineCount = 0;
  if (raw.source !== undefined) {
    if (typeof raw.source !== "string") return null;
    const normalized = raw.source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (normalized.length > 4000) return null;
    const lines = normalized.split("\n");
    if (lines.length > 50) return null;
    if (normalized.trim().length > 0) {
      source = normalized;
      sourceLineCount = lines.length;
    }
  }

  const actors: TimelineActor[] = [];
  const actorIds = new Set<string>();
  for (const rawActor of raw.actors) {
    const entry = asRecord(rawActor);
    if (!entry) return null;
    const actorId = validId(entry.id);
    const label = boundedText(entry.label, 60);
    if (!actorId || !label || actorIds.has(actorId)) return null;
    actorIds.add(actorId);
    const role = isActorRole(entry.role) ? entry.role : undefined;
    actors.push({
      id: actorId,
      label,
      ...(role ? { role } : {}),
    });
  }

  const steps: TimelineStep[] = [];
  const stepIds = new Set<string>();
  for (const rawStep of raw.steps) {
    const entry = asRecord(rawStep);
    if (!entry) return null;
    const stepId = validId(entry.id);
    const label = boundedText(entry.label, 90);
    const explanation = boundedText(entry.explanation, 500);
    if (!stepId || !label || !explanation || stepIds.has(stepId)) return null;
    stepIds.add(stepId);

    if (!Array.isArray(entry.lanes)) return null;

    const laneMap = new Map<string, TimelineLaneSnapshot>();
    for (const rawLane of entry.lanes) {
      const lane = asRecord(rawLane);
      if (!lane || typeof lane.actorId !== "string") continue;
      if (!actorIds.has(lane.actorId)) continue;
      if (laneMap.has(lane.actorId)) continue;

      const state: LaneStateKind = isLaneStateKind(lane.state)
        ? lane.state
        : "idle";

      let laneLabel: string | undefined;
      if (lane.label !== undefined) {
        if (typeof lane.label !== "string") return null;
        const trimmed = lane.label.trim();
        if (trimmed.length > 80) return null;
        if (trimmed.length > 0) laneLabel = trimmed;
      }

      laneMap.set(lane.actorId, {
        actorId: lane.actorId,
        state,
        ...(laneLabel ? { label: laneLabel } : {}),
      });
    }

    if (laneMap.size === 0) return null;

    const lanes: TimelineLaneSnapshot[] = actors.map(
      (actor) =>
        laneMap.get(actor.id) ?? {
          actorId: actor.id,
          state: "idle",
        }
    );

    let messages: TimelineMessage[] | undefined;
    if (entry.messages !== undefined) {
      if (!Array.isArray(entry.messages)) return null;
      const validMessages: TimelineMessage[] = [];
      for (const rawMsg of entry.messages) {
        if (validMessages.length >= 6) break;
        const msg = asRecord(rawMsg);
        if (!msg) continue;
        if (
          typeof msg.from !== "string" ||
          typeof msg.to !== "string" ||
          !actorIds.has(msg.from) ||
          !actorIds.has(msg.to) ||
          msg.from === msg.to
        ) {
          continue;
        }
        const msgLabel = boundedText(msg.label, 70);
        if (!msgLabel) continue;
        const kind = isMessageKind(msg.kind) ? msg.kind : undefined;
        validMessages.push({
          from: msg.from,
          to: msg.to,
          label: msgLabel,
          ...(kind ? { kind } : {}),
        });
      }
      messages = validMessages;
    }

    let codeLine: number | undefined;
    if (
      typeof entry.codeLine === "number" &&
      Number.isInteger(entry.codeLine) &&
      entry.codeLine >= 1 &&
      sourceLineCount > 0 &&
      entry.codeLine <= sourceLineCount
    ) {
      codeLine = entry.codeLine;
    }

    steps.push({
      id: stepId,
      label,
      explanation,
      lanes,
      ...(messages !== undefined ? { messages } : {}),
      ...(codeLine !== undefined ? { codeLine } : {}),
    });
  }

  return {
    version: 1,
    ...(language ? { language } : {}),
    ...(source ? { source } : {}),
    actors,
    steps,
  };
}
