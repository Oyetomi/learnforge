/** Language-neutral, declarative teaching states. No expressions or code are executed. */
export type StateTone = 'neutral' | 'active' | 'waiting' | 'done';
export interface StateEntity { id: string; label: string }
export interface EntitySnapshot { entityId: string; status: string; value: string; tone: StateTone }
export interface ConceptState { id: string; label: string; description: string; entities: EntitySnapshot[] }
export interface ConceptTransition { id: string; from: string; to: string; label: string; explanation: string; sourceLines: number[] }
export interface StateModel {
  version: 1;
  initialStateId: string;
  entities: StateEntity[];
  states: ConceptState[];
  transitions: ConceptTransition[];
  source?: { language: string; code: string };
}
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const id = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(value) ? value : '';
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const distinct = (ids: string[]) => ids.every(Boolean) && new Set(ids).size === ids.length;
export function validateStateModel(input: unknown): StateModel | null {
  const v = record(input);
  if (!v || v.version !== 1 || !Array.isArray(v.entities) || v.entities.length < 1 || v.entities.length > 6 || !Array.isArray(v.states) || v.states.length < 2 || v.states.length > 20 || !Array.isArray(v.transitions) || v.transitions.length < 1 || v.transitions.length > 40) return null;
  const entities: StateEntity[] = [];
  for (const raw of v.entities) {
    const e = record(raw); if (!e || !id(e.id) || !text(e.label, 48)) return null;
    entities.push({ id: id(e.id), label: text(e.label, 48) });
  }
  if (!distinct(entities.map(e => e.id))) return null;
  const states: ConceptState[] = [];
  for (const raw of v.states) {
    const s = record(raw);
    if (!s || !id(s.id) || !text(s.label, 100) || !text(s.description, 500) || !Array.isArray(s.entities) || s.entities.length !== entities.length) return null;
    const snapshots: EntitySnapshot[] = [];
    for (const rawSnapshot of s.entities) {
      const e = record(rawSnapshot);
      if (!e || !entities.some(entity => entity.id === e.entityId) || !text(e.status, 32) || !['neutral', 'active', 'waiting', 'done'].includes(String(e.tone)) || typeof e.value !== 'string' || e.value.length > 160) return null;
      snapshots.push({ entityId: String(e.entityId), status: text(e.status, 32), value: e.value, tone: e.tone as StateTone });
    }
    if (!distinct(snapshots.map(e => e.entityId))) return null;
    states.push({ id: id(s.id), label: text(s.label, 100), description: text(s.description, 500), entities: snapshots });
  }
  if (!distinct(states.map(s => s.id)) || !states.some(s => s.id === v.initialStateId)) return null;
  let source: StateModel['source'];
  if (v.source !== undefined) {
    const s = record(v.source);
    if (!s || typeof s.code !== 'string' || !s.code.trim() || s.code.length > 6000 || s.code.split('\n').length > 60 || !text(s.language, 40)) return null;
    source = { language: text(s.language, 40), code: s.code.replace(/\r\n/g, '\n') };
  }
  const transitions: ConceptTransition[] = [];
  for (const raw of v.transitions) {
    const t = record(raw);
    if (!t || !id(t.id) || !states.some(s => s.id === t.from) || !states.some(s => s.id === t.to) || t.from === t.to || !text(t.label, 70) || !text(t.explanation, 500)) return null;
    const lines = t.sourceLines === undefined ? [] : t.sourceLines;
    if (!Array.isArray(lines) || lines.length > 8 || !lines.every(n => source && Number.isInteger(n) && n >= 1 && n <= source.code.split('\n').length) || new Set(lines).size !== lines.length) return null;
    transitions.push({ id: id(t.id), from: String(t.from), to: String(t.to), label: text(t.label, 70), explanation: text(t.explanation, 500), sourceLines: [...lines].sort((a, b) => a - b) });
  }
  if (!distinct(transitions.map(t => t.id)) || states.some(s => transitions.filter(t => t.from === s.id).length > 4)) return null;
  // Every authored state must be reachable; cycles and alternate branches are allowed.
  const reachable = new Set([String(v.initialStateId)]);
  for (let i = 0; i < states.length; i++) for (const t of transitions) if (reachable.has(t.from)) reachable.add(t.to);
  if (reachable.size !== states.length) return null;
  return { version: 1, initialStateId: String(v.initialStateId), entities, states, transitions, ...(source ? { source } : {}) };
}
export interface WalkthroughVisit { stateId: string; transitionId?: string }
export interface WalkthroughHistory { visits: WalkthroughVisit[]; index: number }
export const WALKTHROUGH_LIMIT = 32;
export const startWalkthrough = (model: StateModel): WalkthroughHistory => ({ visits: [{ stateId: model.initialStateId }], index: 0 });
export function advanceWalkthrough(model: StateModel, history: WalkthroughHistory, transitionId: string): WalkthroughHistory {
  const transition = model.transitions.find(t => t.id === transitionId && t.from === history.visits[history.index]?.stateId);
  if (!transition || history.index + 1 >= WALKTHROUGH_LIMIT) return history;
  const visits = [...history.visits.slice(0, history.index + 1), { stateId: transition.to, transitionId: transition.id }];
  return { visits, index: visits.length - 1 };
}
export function seekWalkthrough(history: WalkthroughHistory, index: number): WalkthroughHistory {
  if (!Number.isInteger(index) || index < 0 || index >= history.visits.length) return history;
  return { ...history, index };
}
