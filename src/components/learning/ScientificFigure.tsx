import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import {
  advanceWalkthrough,
  seekWalkthrough,
  startWalkthrough,
  validateStateModel,
  WALKTHROUGH_LIMIT,
  type ConceptState,
  type FigureRelation,
  type StateModel,
} from "../../services/learning/stateModel";
import { VisualRichText } from "./VisualRichText";
import { useFigureTheme } from "./useFigureTheme";
import { highlightSource } from "../chat/CodeBlock";
import { FigureValue } from "./FigureValue";
import { figureCode } from "../../services/learning/figureCode";
import "./scientific-figure.css";

export interface ScientificFigureProps {
  language?: string;
  model: StateModel;
  onInteract: () => void;
  notes?: { label: string; description: string }[];
  takeaway?: string;
}

/** Stable rows use all authored relations, so changing state never rearranges the entities. */
export function scientificEntityRows(model: StateModel): string[][] {
  const ids = model.entities.map(entity => entity.id);
  const edges = new Map<string, Set<string>>(ids.map(id => [id, new Set()]));
  const incoming = new Map(ids.map(id => [id, 0]));
  for (const state of model.states) for (const relation of state.relations || []) {
    if (!edges.get(relation.from)?.has(relation.to)) {
      edges.get(relation.from)?.add(relation.to);
      incoming.set(relation.to, (incoming.get(relation.to) || 0) + 1);
    }
  }
  const ranks = new Map(ids.map(id => [id, 0]));
  const remaining = new Set(ids);
  while (remaining.size) {
    const ready = ids.filter(id => remaining.has(id) && incoming.get(id) === 0);
    if (!ready.length) break; // A reference cycle has no causal ranking; retain authored order.
    for (const id of ready) {
      remaining.delete(id);
      for (const next of edges.get(id) || []) {
        incoming.set(next, (incoming.get(next) || 0) - 1);
        ranks.set(next, Math.max(ranks.get(next) || 0, (ranks.get(id) || 0) + 1));
      }
    }
  }
  for (const id of remaining) ranks.set(id, 0);
  const rows = new Map<number, string[]>();
  for (const id of ids) {
    const rank = ranks.get(id) || 0;
    rows.set(rank, [...(rows.get(rank) || []), id]);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

export interface FigureEntityBounds { id: string; left: number; top: number; width: number; height: number }
interface Point { x: number; y: number }
interface Connection {
  relation: FigureRelation;
  path: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  number: number;
  routing: 'direct' | 'gutter';
  /** Orthogonal waypoints are exposed for geometric checks, never authored by the model. */
  waypoints?: Point[];
}

const pairKey = (relation: FigureRelation) => [relation.from, relation.to].sort().join(":");

/** Route measured rows; a skip-row edge travels outside the text, even after responsive wrapping. */
export function scientificConnections(relations: FigureRelation[], bounds: FigureEntityBounds[], width: number): Connection[] {
  const byId = new Map(bounds.map(box => [box.id, box]));
  const bottom = (box: FigureEntityBounds) => box.top + box.height;
  const skippedRow = (a: FigureEntityBounds, b: FigureEntityBounds) => bounds.some(box => box.id !== a.id && box.id !== b.id && box.top > Math.min(a.top, b.top) + 25 && box.top < Math.max(a.top, b.top) - 25);
  const sideFor = (relation: FigureRelation) => {
    const a = byId.get(relation.from)!, b = byId.get(relation.to)!;
    const center = (a.left + a.width / 2 + b.left + b.width / 2) / 2;
    if (Math.abs(center - width / 2) > 1) return center < width / 2 ? 'left' : 'right';
    // Centered chains keep their chosen gutter when the authored relation order changes.
    return [...pairKey(relation)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 'left' : 'right';
  };
  const skipRelations = relations.filter(relation => { const a = byId.get(relation.from), b = byId.get(relation.to); return a && b && skippedRow(a, b); }).sort((a, b) => a.id.localeCompare(b.id));
  const result: Connection[] = [];
  for (const [index, relation] of relations.entries()) {
    const a = byId.get(relation.from), b = byId.get(relation.to);
    if (!a || !b) continue;
    const sameRow = Math.abs(a.top - b.top) < 25;
    const parallel = relations.filter(item => pairKey(item) === pairKey(relation)).sort((a, b) => a.id.localeCompare(b.id));
    const parallelIndex = parallel.findIndex(item => item.id === relation.id);
    const spread = (parallelIndex - (parallel.length - 1) / 2) * 18;
    const x1 = a.left + a.width / 2, x2 = b.left + b.width / 2;
    let y1: number, y2: number, path: string, labelX: number, labelY: number;
    let waypoints: Point[] | undefined;
    let routing: Connection['routing'] = 'direct';
    if (sameRow) {
      y1 = bottom(a) + 7;
      y2 = bottom(b) + 7;
      const y = Math.max(y1, y2) + 24 + parallelIndex * 18;
      path = `M ${x1} ${y1} V ${y} H ${x2} V ${y2}`;
      labelX = (x1 + x2) / 2;
      labelY = y + 11;
    } else {
      const downward = a.top < b.top;
      y1 = downward ? bottom(a) + 7 : a.top - 7;
      y2 = downward ? b.top - 7 : bottom(b) + 7;
      if (skippedRow(a, b)) {
        routing = 'gutter';
        const fromRow = bounds.filter(box => Math.abs(box.top - a.top) < 25);
        const toRow = bounds.filter(box => Math.abs(box.top - b.top) < 25);
        const fromRail = downward ? Math.max(...fromRow.map(bottom)) + 18 : Math.min(...fromRow.map(box => box.top)) - 18;
        const toRail = downward ? Math.min(...toRow.map(box => box.top)) - 18 : Math.max(...toRow.map(bottom)) + 18;
        const side = sideFor(relation);
        const sameSide = skipRelations.filter(item => sideFor(item) === side);
        const slot = sameSide.findIndex(item => item.id === relation.id);
        const gutter = side === 'left' ? 8 + slot * 2 : width - 8 - slot * 2;
        waypoints = [{ x: x1, y: y1 }, { x: x1, y: fromRail }, { x: gutter, y: fromRail }, { x: gutter, y: toRail }, { x: x2, y: toRail }, { x: x2, y: y2 }];
        path = waypoints.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
        labelX = gutter;
        labelY = Math.min(fromRail, toRail) + Math.abs(fromRail - toRail) * (slot + 1) / (sameSide.length + 1);
      } else {
        const middle = (y1 + y2) / 2;
        path = `M ${x1} ${y1} C ${x1 + spread} ${middle}, ${x2 + spread} ${middle}, ${x2} ${y2}`;
        labelX = Math.max(12, Math.min(width - 12, (x1 + x2) / 2 + spread * .75));
        labelY = middle + (index % 2 ? 8 : -8);
      }
    }
    result.push({ relation, path, x1, y1, x2, y2, labelX, labelY, number: index + 1, routing, ...(waypoints ? { waypoints } : {}) });
  }
  return result;
}

function StateDiagram({ model, state, label, rows, language }: {
  model: StateModel;
  state: ConceptState;
  label: string;
  rows: string[][];
  language?: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const arrowId = useId().replace(/:/g, "");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [height, setHeight] = useState(0);
  const relations = state.relations || [];
  const pairCounts = new Map<string, number>();
  for (const relation of relations) pairCounts.set(pairKey(relation), (pairCounts.get(pairKey(relation)) || 0) + 1);
  // A numbered key keeps long or parallel relationship labels from competing inside the plot.
  const keyedRelations = relations.length > 3 || [...pairCounts.values()].some(count => count > 1) || connections.some(connection => connection.routing === 'gutter');
  const extraRouteSpace = Math.max(0, Math.max(0, ...pairCounts.values()) - 1) * 18;
  const measure = useCallback(() => {
    if (!stage.current) return;
    const stageBox = stage.current.getBoundingClientRect();
    if (stageBox.width <= 0) return;
    const bounds = Array.from(stage.current.querySelectorAll<HTMLElement>('[data-figure-entity]')).map(node => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.figureEntity!, left: box.left - stageBox.left, top: box.top - stageBox.top, width: box.width, height: box.height };
    });
    setConnections(scientificConnections(state.relations || [], bounds, stageBox.width));
    setHeight(stage.current.getBoundingClientRect().height);
  }, [state]);

  useEffect(() => {
    measure();
    if (!stage.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage.current);
    stage.current.querySelectorAll("[data-figure-entity]").forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [measure]);

  const byId = new Map(model.entities.map(entity => [entity.id, entity]));
  return (
    <section className="scientific-figure-panel" aria-label={label}>
      <h4 className="scientific-figure-panel-label"><VisualRichText text={label} language={model.source?.language} /></h4>
      <div className="scientific-figure-diagram" ref={stage} style={{ paddingBottom: 60 + extraRouteSpace }}>
        <svg className="scientific-figure-connectors" width="100%" height={height || "100%"} aria-hidden="true">
          <defs><marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="currentColor" strokeWidth="1" /></marker></defs>
          {connections.map(connection => (
            <g key={connection.relation.id} className={`scientific-figure-link is-${connection.relation.kind}`}>
              <path d={connection.path} fill="none" markerEnd={`url(#${arrowId})`} />
              <circle cx={connection.x1} cy={connection.y1} r="2.5" />
            </g>
          ))}
        </svg>
        <div className="scientific-figure-rows">
          {rows.map((row, rowIndex) => (
            <div className={`scientific-figure-row ${row.length === 1 ? "is-single" : ""}`} key={rowIndex} style={{ "--figure-columns": Math.min(3, row.length) } as React.CSSProperties}>
              {row.map(entityId => {
                const entity = byId.get(entityId)!;
                const snapshot = state.entities.find(item => item.entityId === entityId)!;
                const initial = model.states.find(item => item.id === model.initialStateId)!.entities.find(item => item.entityId === entityId)!;
                const changed = initial.value !== snapshot.value || initial.status !== snapshot.status;
                return <div className={`scientific-figure-entity ${changed ? "is-changed" : ""}`} data-figure-entity={entity.id} key={entity.id}>
                  <strong className="scientific-figure-entity-label"><VisualRichText text={entity.label} language={language} detectCodeLabel /></strong>
                  <div className="scientific-figure-value"><FigureValue snapshot={snapshot} language={language} title={entity.label} /></div>
                  <span className="scientific-figure-status">{snapshot.status}</span>
                </div>;
              })}
            </div>
          ))}
        </div>
        {connections.filter(connection => keyedRelations || connection.relation.label).map(connection => (
          <span key={connection.relation.id} className={`scientific-figure-relation-label ${keyedRelations ? "is-number" : ""}`} style={{ left: connection.labelX, top: connection.labelY }} aria-hidden="true">{keyedRelations ? connection.number : <VisualRichText text={connection.relation.label!} language={model.source?.language} />}</span>
        ))}
      </div>
      {!!relations.length && <ol className={keyedRelations ? "scientific-figure-relation-key" : "scientific-figure-relation-text"} aria-label="Figure relationships">
        {relations.map(relation => <li key={relation.id}><VisualRichText text={byId.get(relation.from)!.label} /> → <VisualRichText text={byId.get(relation.to)!.label} />{relation.label ? <>: <VisualRichText text={relation.label} language={model.source?.language} /></> : null} <span>({relation.kind})</span></li>)}
      </ol>}
    </section>
  );
}

export function ScientificFigure({ model, onInteract, notes = [], takeaway, language }: ScientificFigureProps) {
  const safe = useMemo(() => validateStateModel(model), [model]);
  return safe ? <ScientificWalkthrough key={JSON.stringify(safe)} model={safe} language={language} onInteract={onInteract} notes={notes} takeaway={takeaway} />
    : <p className="walkthrough-invalid" role="status">This figure is incomplete. Ask for a corrected figure; your lesson and answer are unchanged.</p>;
}

function ScientificWalkthrough({ model, onInteract, notes, takeaway, language }: ScientificFigureProps) {
  const codeLanguage = model.source?.language || language;
  const hasCode = model.states.some(state => state.entities.some(snapshot => !!figureCode(snapshot, codeLanguage)));
  const { theme, toggleTheme } = useFigureTheme();
  const [history, setHistory] = useState(() => startWalkthrough(model));
  const caption = useRef<HTMLDivElement>(null);
  const previousHistory = useRef(history);
  const rows = useMemo(() => scientificEntityRows(model), [model]);
  const highlightedSource = useMemo(() => model.source ? highlightSource(model.source.code, model.source.language) : null, [model.source]);
  const visit = history.visits[history.index];
  const state = model.states.find(item => item.id === visit.stateId)!;
  const initial = model.states.find(item => item.id === model.initialStateId)!;
  const transition = model.transitions.find(item => item.id === visit.transitionId);
  const actions = model.transitions.filter(item => item.from === state.id);
  const limitReached = history.index + 1 >= WALKTHROUGH_LIMIT;
  const comparison = model.presentation?.layout === "comparison";
  useEffect(() => {
    if (previousHistory.current === history) return;
    previousHistory.current = history;
    caption.current?.focus({ preventScroll: true });
    caption.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [history]);
  const change = (next: typeof history) => { if (next !== history) { onInteract(); setHistory(next); } };
  return <figure className={`scientific-figure${hasCode ? " has-code-values" : ""}`} data-theme={theme} aria-label="Interactive teaching figure">
    <div className="scientific-figure-context"><span>Illustrative states · changes follow the authored model</span><button type="button" className="scientific-figure-theme" aria-pressed={theme === "light"} title="Toggle light paper" onClick={toggleTheme}>Light paper</button></div>
    <div className={`scientific-figure-panels ${comparison ? "is-comparison" : ""}`}>
      {comparison && <StateDiagram model={model} state={initial} label="Starting state" rows={rows} language={codeLanguage} />}
      <StateDiagram model={model} state={state} label={comparison ? "Current state" : state.label} rows={rows} language={codeLanguage} />
    </div>
    <figcaption className="scientific-figure-caption">
      <div ref={caption} tabIndex={-1} aria-live="polite" aria-atomic="true">
        <strong>Figure. <VisualRichText text={state.label} language={model.source?.language} /></strong>
        <p><VisualRichText text={transition?.explanation || state.description} language={model.source?.language} /></p>
      </div>
    </figcaption>
    <div className="scientific-figure-actions" role="group" aria-label="Explore the figure">
      {limitReached ? <p>That’s 32 steps. Reset to explore a different path.</p> : actions.length ? actions.map((action, index) => <button key={action.id} type="button" className={index === 0 ? "is-primary" : ""} onClick={() => change(advanceWalkthrough(model, history, action.id))}><VisualRichText text={action.label} language={model.source?.language} /><ChevronRight size={13} aria-hidden="true" /></button>) : <p>End of this path. Go back to compare another choice.</p>}
    </div>
    <nav className="scientific-figure-history" aria-label="Figure history">
      <button type="button" disabled={history.index === 0} onClick={() => change(seekWalkthrough(history, history.index - 1))}><ChevronLeft size={13} aria-hidden="true" />Back</button>
      <span>Step {history.index + 1} of {history.visits.length}</span>
      <button type="button" disabled={history.index >= history.visits.length - 1} onClick={() => change(seekWalkthrough(history, history.index + 1))}>Forward<ChevronRight size={13} aria-hidden="true" /></button>
      <button type="button" className="scientific-figure-reset" disabled={history.index === 0 && history.visits.length === 1} onClick={() => change(startWalkthrough(model))}><RotateCcw size={12} aria-hidden="true" />Reset</button>
    </nav>
    <details className="scientific-figure-text"><summary>Explanation and current state</summary>
      <p><VisualRichText text={state.description} language={model.source?.language} /></p>
      <ul>{model.entities.map(entity => { const snapshot = state.entities.find(item => item.entityId === entity.id)!; return <li key={entity.id}><strong><VisualRichText text={entity.label} language={codeLanguage} /></strong>: {snapshot.status}. <FigureValue snapshot={snapshot} language={codeLanguage} title={entity.label} /></li>; })}</ul>
      {(notes || []).map((note, index) => <p key={index}><strong><VisualRichText text={note.label} language={model.source?.language} /></strong> — <VisualRichText text={note.description} language={model.source?.language} /></p>)}
      {takeaway && <p><strong>Remember.</strong> <VisualRichText text={takeaway} language={model.source?.language} /></p>}
      {model.source && <details className="scientific-figure-source"><summary>Related source · {model.source.language}</summary><pre>{highlightedSource === null ? <code>{model.source.code}</code> : <code dangerouslySetInnerHTML={{ __html: highlightedSource }} />}</pre></details>}
    </details>
  </figure>;
}
