import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  ConceptDiagramEdge,
  ConceptDiagramNode,
  ConceptDiagramSpec,
  DiagramNodeTone,
} from "../../services/learning/conceptDiagram";
import { VisualRichText } from "./VisualRichText";

const TONE_STROKES: Record<DiagramNodeTone, string> = {
  accent: "#d4b08c",
  teal: "#8fc9bb",
  blue: "#92b6df",
  coral: "#e59888",
  neutral: "#7e8b9b",
};

interface AnalyzedTopology {
  orderedNodes: ConceptDiagramNode[];
  tiers: ConceptDiagramNode[][];
  isChain: boolean;
  chainEdges: (ConceptDiagramEdge | undefined)[];
}

/**
 * Topologically orders diagram nodes so numbered badges (`01`, `02`, `03`...)
 * and step controls always follow the true causal / dataflow sequence.
 */
export function analyzeDiagramTopology(spec: ConceptDiagramSpec): AnalyzedTopology {
  const byId = new Map<string, ConceptDiagramNode>();
  const origIdx = new Map<string, number>();
  spec.nodes.forEach((n, i) => {
    byId.set(n.id, n);
    origIdx.set(n.id, i);
  });

  if (spec.edges.length === 0) {
    return {
      orderedNodes: spec.nodes,
      tiers: [spec.nodes],
      isChain: false,
      chainEdges: [],
    };
  }

  const inDeg = new Map<string, number>();
  const outAdj = new Map<string, ConceptDiagramEdge[]>();
  for (const n of spec.nodes) {
    inDeg.set(n.id, 0);
    outAdj.set(n.id, []);
  }
  for (const e of spec.edges) {
    if (byId.has(e.from) && byId.has(e.to)) {
      inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
      outAdj.get(e.from)!.push(e);
    }
  }

  const remaining = new Set<string>(spec.nodes.map((n) => n.id));
  const rank = new Map<string, number>();
  const orderedNodes: ConceptDiagramNode[] = [];

  while (remaining.size > 0) {
    const ready = Array.from(remaining)
      .filter((id) => (inDeg.get(id) || 0) <= 0)
      .sort((a, b) => (origIdx.get(a) || 0) - (origIdx.get(b) || 0));

    const pickId =
      ready.length > 0
        ? ready[0]
        : Array.from(remaining).sort(
            (a, b) =>
              (inDeg.get(a) || 0) - (inDeg.get(b) || 0) ||
              (origIdx.get(a) || 0) - (origIdx.get(b) || 0)
          )[0];

    remaining.delete(pickId);
    const node = byId.get(pickId)!;
    orderedNodes.push(node);
    const currentRank = rank.get(pickId) ?? 0;
    rank.set(pickId, currentRank);

    for (const edge of outAdj.get(pickId) || []) {
      if (remaining.has(edge.to)) {
        inDeg.set(edge.to, (inDeg.get(edge.to) || 0) - 1);
        rank.set(edge.to, Math.max(rank.get(edge.to) ?? 0, currentRank + 1));
      }
    }
  }

  // Check if edges form a clean sequential chain orderedNodes[0] -> [1] -> ... -> [n-1]
  let isChain = spec.edges.length === orderedNodes.length - 1;
  const chainEdges: (ConceptDiagramEdge | undefined)[] = [];
  if (isChain) {
    for (let i = 0; i < orderedNodes.length - 1; i++) {
      const match = spec.edges.find(
        (e) => e.from === orderedNodes[i].id && e.to === orderedNodes[i + 1].id
      );
      if (!match) {
        isChain = false;
        break;
      }
      chainEdges.push(match);
    }
  }

  // Group into tiers by topological rank (capped at 3 nodes per visual row so nothing ever overflows)
  const rawTierMap = new Map<number, ConceptDiagramNode[]>();
  for (const n of orderedNodes) {
    const r = rank.get(n.id) ?? 0;
    if (!rawTierMap.has(r)) rawTierMap.set(r, []);
    rawTierMap.get(r)!.push(n);
  }
  const tiers: ConceptDiagramNode[][] = [];
  for (const r of Array.from(rawTierMap.keys()).sort((a, b) => a - b)) {
    const group = rawTierMap.get(r)!;
    for (let i = 0; i < group.length; i += 2) {
      tiers.push(group.slice(i, i + 2));
    }
  }

  return { orderedNodes, tiers, isChain, chainEdges };
}

function compactCodePreview(code: string): string {
  const oneLine = code.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  return oneLine.length > 54 ? `${oneLine.slice(0, 52)}…` : oneLine;
}

interface DagOverlayLine {
  id: string;
  d: string;
  label?: string;
  lx: number;
  ly: number;
  stroke: string;
  highlighted: boolean;
  animated: boolean;
}

export interface ConceptSchematicGraphProps {
  spec: ConceptDiagramSpec;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  language?: string;
  showStepControls?: boolean;
}

export function ConceptSchematicGraph({
  spec,
  selectedIndex,
  onSelectIndex,
  language,
}: ConceptSchematicGraphProps) {
  const topology = useMemo(() => analyzeDiagramTopology(spec), [spec]);
  const { orderedNodes, tiers, isChain, chainEdges } = topology;

  const safeIndex = Math.min(
    Math.max(0, selectedIndex),
    Math.max(0, orderedNodes.length - 1)
  );
  const current = orderedNodes[safeIndex];

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    orderedNodes.forEach((n, idx) => map.set(n.id, idx));
    return map;
  }, [orderedNodes]);

  // Measured SVG Bezier lines for general branching DAGs (!isChain && edges.length > 0)
  const dagStageRef = useRef<HTMLDivElement>(null);
  const [dagLines, setDagLines] = useState<DagOverlayLine[]>([]);

  const measureDagEdges = useCallback(() => {
    if (isChain || spec.edges.length === 0 || !dagStageRef.current) return;
    const stageEl = dagStageRef.current;
    const stageRect = stageEl.getBoundingClientRect();
    if (stageRect.width <= 0) return;

    const lines: DagOverlayLine[] = [];
    for (const edge of spec.edges) {
      const fromEl = stageEl.querySelector<HTMLElement>(
        `[data-schematic-node="${CSS.escape(edge.from)}"]`
      );
      const toEl = stageEl.querySelector<HTMLElement>(
        `[data-schematic-node="${CSS.escape(edge.to)}"]`
      );
      if (!fromEl || !toEl) continue;
      const r1 = fromEl.getBoundingClientRect();
      const r2 = toEl.getBoundingClientRect();

      const sameRow = Math.abs(r1.top - r2.top) < 28;
      let x1: number, y1: number, x2: number, y2: number, d: string;
      if (sameRow) {
        const leftToRight = r1.left < r2.left;
        x1 = (leftToRight ? r1.right : r1.left) - stageRect.left;
        y1 = r1.top + r1.height / 2 - stageRect.top;
        x2 = (leftToRight ? r2.left : r2.right) - stageRect.left;
        y2 = r2.top + r2.height / 2 - stageRect.top;
        const dx = Math.max(24, Math.abs(x2 - x1) * 0.4);
        d = `M ${x1} ${y1} C ${x1 + (leftToRight ? dx : -dx)} ${y1}, ${
          x2 + (leftToRight ? -dx : dx)
        } ${y2}, ${x2} ${y2}`;
      } else {
        const downward = r1.top < r2.top;
        x1 = r1.left + r1.width / 2 - stageRect.left;
        y1 = (downward ? r1.bottom : r1.top) - stageRect.top;
        x2 = r2.left + r2.width / 2 - stageRect.left;
        y2 = (downward ? r2.top : r2.bottom) - stageRect.top;
        const dy = Math.max(22, Math.abs(y2 - y1) * 0.48);
        d = `M ${x1} ${y1} C ${x1} ${y1 + (downward ? dy : -dy)}, ${x2} ${
          y2 + (downward ? -dy : dy)
        }, ${x2} ${y2}`;
      }

      const sourceNode = orderedNodes.find((n) => n.id === edge.from);
      const highlighted =
        current?.id === edge.from || current?.id === edge.to;
      const stroke = highlighted
        ? TONE_STROKES[sourceNode?.tone || "accent"]
        : "#4c5868";

      lines.push({
        id: edge.id,
        d,
        label: edge.label,
        lx: (x1 + x2) / 2,
        ly: (y1 + y2) / 2,
        stroke,
        highlighted,
        animated: edge.animated !== false,
      });
    }
    setDagLines(lines);
  }, [isChain, spec.edges, orderedNodes, current?.id]);

  useEffect(() => {
    if (isChain || spec.edges.length === 0) return;
    measureDagEdges();
    if (typeof ResizeObserver === "undefined" || !dagStageRef.current) return;
    const ro = new ResizeObserver(() => measureDagEdges());
    ro.observe(dagStageRef.current);
    return () => ro.disconnect();
  }, [isChain, spec.edges.length, measureDagEdges]);

  const renderNodeCard = (node: ConceptDiagramNode, idx: number, fullSpan = false) => {
    const selected = idx === safeIndex;
    const tone = node.tone || "neutral";
    const showDistinctTitle =
      !node.code ||
      (node.label &&
        node.label.toUpperCase() !== (node.badge || "").toUpperCase());

    const connectedToSelected =
      !selected &&
      spec.edges.some(
        (e) =>
          (e.from === current?.id && e.to === node.id) ||
          (e.to === current?.id && e.from === node.id)
      );

    return (
      <div
        key={node.id}
        data-schematic-node={node.id}
        className={`schematic-card tone-${tone} ${
          selected ? "is-selected" : ""
        } ${connectedToSelected ? "is-neighbor" : ""} ${
          fullSpan ? "is-full-span" : ""
        }`}
      >
        <button
          type="button"
          aria-pressed={selected}
          className="schematic-card-btn"
          onClick={() => onSelectIndex(idx)}
        >
          <span className="schematic-card-eyebrow">
            <span className="schematic-card-idx">
              {String(idx + 1).padStart(2, "0")}
            </span>
            {node.badge && (
              <span className="schematic-card-badge">{node.badge}</span>
            )}
          </span>
          {showDistinctTitle && (
            <strong className="schematic-card-title">
              <VisualRichText text={node.label} language={language} />
            </strong>
          )}
          {node.formula ? (
            <span className="schematic-card-preview is-formula">
              <VisualRichText
                text={
                  node.formula.startsWith("$")
                    ? node.formula
                    : `$${node.formula}$`
                }
              />
            </span>
          ) : node.code ? (
            <span className="schematic-card-preview is-code">
              <VisualRichText
                text={compactCodePreview(node.code)}
                language={language}
                detectCodeLabel
              />
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  const renderEdgeConduit = (
    edge: ConceptDiagramEdge | undefined,
    direction: "right" | "left" | "down",
    alignSide?: "right" | "left" | "center"
  ) => {
    const highlighted =
      !!edge && (current?.id === edge.from || current?.id === edge.to);
    return (
      <div
        className={`schematic-conduit is-${direction} ${
          alignSide ? `align-${alignSide}` : ""
        } ${highlighted ? "is-active" : ""}`}
        aria-hidden="true"
      >
        <span className="schematic-conduit-line" />
        <span className="schematic-conduit-pill">
          {direction === "left" && <ArrowLeft size={12} />}
          {edge?.label && <span>{edge.label}</span>}
          {direction === "right" && <ArrowRight size={12} />}
          {direction === "down" && <ArrowDown size={12} />}
        </span>
        <span className="schematic-conduit-line" />
      </div>
    );
  };

  // Build 2-column serpentine rows for sequential chains (`01 -> 02` then `▼` then `04 <- 03`)
  const serpentineRows = useMemo(() => {
    if (!isChain) return [];
    const rows: {
      rowIndex: number;
      reversed: boolean;
      items: { node: ConceptDiagramNode; idx: number }[];
      horizontalEdge?: ConceptDiagramEdge;
      dropEdgeAfterRow?: ConceptDiagramEdge;
      dropSide: "right" | "left" | "center";
    }[] = [];

    for (let i = 0; i < orderedNodes.length; i += 2) {
      const rowIndex = Math.floor(i / 2);
      const reversed = rowIndex % 2 === 1 && i + 1 < orderedNodes.length;
      const pair = orderedNodes
        .slice(i, i + 2)
        .map((node, offset) => ({ node, idx: i + offset }));
      rows.push({
        rowIndex,
        reversed,
        items: pair,
        horizontalEdge: i + 1 < orderedNodes.length ? chainEdges[i] : undefined,
        dropEdgeAfterRow:
          i + 2 < orderedNodes.length ? chainEdges[i + 1] : undefined,
        dropSide:
          i + 2 >= orderedNodes.length
            ? "center"
            : rowIndex % 2 === 0
            ? "right"
            : "left",
      });
    }
    return rows;
  }, [isChain, orderedNodes, chainEdges]);

  const currentRelationships = useMemo(() => {
    if (!current) return [];
    return spec.edges
      .filter((e) => e.from === current.id || e.to === current.id)
      .map((e) => {
        const incoming = e.to === current.id;
        const otherId = incoming ? e.from : e.to;
        const otherIdx = indexById.get(otherId) ?? 0;
        const otherNode = orderedNodes[otherIdx];
        return {
          id: e.id,
          incoming,
          label: e.label,
          otherIdx,
          otherTitle: otherNode?.label || otherId,
        };
      });
  }, [current, spec.edges, indexById, orderedNodes]);

  return (
    <div className="concept-schematic-studio">
      <div
        className="concept-schematic-stage"
        role="group"
        aria-label="Interactive architecture blueprint"
      >
        {spec.edges.length === 0 ? (
          <div className="schematic-contrast-grid">
            {orderedNodes.map((node, idx) => renderNodeCard(node, idx))}
          </div>
        ) : isChain && orderedNodes.length === 2 ? (
          <div className="schematic-pair-row">
            {renderNodeCard(orderedNodes[0], 0)}
            <div className="schematic-slot-conduit-desktop">
              {renderEdgeConduit(chainEdges[0], "right")}
            </div>
            <div className="schematic-slot-conduit-mobile">
              {renderEdgeConduit(chainEdges[0], "down")}
            </div>
            {renderNodeCard(orderedNodes[1], 1)}
          </div>
        ) : isChain ? (
          <div className="schematic-serpentine">
            {serpentineRows.map((row) => {
              const singleItem = row.items.length === 1;
              return (
                <React.Fragment key={row.rowIndex}>
                  {singleItem ? (
                    <div className="schematic-serpentine-single">
                      {renderNodeCard(
                        row.items[0].node,
                        row.items[0].idx,
                        true
                      )}
                    </div>
                  ) : row.reversed ? (
                    <div className="schematic-pair-row is-reversed">
                      <div className="schematic-slot-second">
                        {renderNodeCard(row.items[1].node, row.items[1].idx)}
                      </div>
                      <div className="schematic-slot-conduit-desktop">
                        {renderEdgeConduit(row.horizontalEdge, "left")}
                      </div>
                      <div className="schematic-slot-first">
                        {renderNodeCard(row.items[0].node, row.items[0].idx)}
                      </div>
                      <div className="schematic-slot-conduit-mobile">
                        {renderEdgeConduit(row.horizontalEdge, "down")}
                      </div>
                    </div>
                  ) : (
                    <div className="schematic-pair-row">
                      {renderNodeCard(row.items[0].node, row.items[0].idx)}
                      <div className="schematic-slot-conduit-desktop">
                        {renderEdgeConduit(row.horizontalEdge, "right")}
                      </div>
                      <div className="schematic-slot-conduit-mobile">
                        {renderEdgeConduit(row.horizontalEdge, "down")}
                      </div>
                      {renderNodeCard(row.items[1].node, row.items[1].idx)}
                    </div>
                  )}
                  {row.dropEdgeAfterRow &&
                    renderEdgeConduit(
                      row.dropEdgeAfterRow,
                      "down",
                      row.items.length === 2 &&
                        orderedNodes.length - (row.rowIndex * 2 + 2) === 1
                        ? "right"
                        : row.dropSide
                    )}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className="schematic-dag-stage" ref={dagStageRef}>
            <svg className="schematic-dag-svg" aria-hidden="true">
              <defs>
                <marker
                  id="schematic-arrow-accent"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#d4b08c" />
                </marker>
                <marker
                  id="schematic-arrow-muted"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#5b687a" />
                </marker>
              </defs>
              {dagLines.map((line) => (
                <path
                  key={line.id}
                  d={line.d}
                  fill="none"
                  stroke={line.stroke}
                  strokeWidth={line.highlighted ? 2.1 : 1.4}
                  strokeDasharray={line.animated ? "5 4" : undefined}
                  className={line.animated ? "schematic-svg-animated" : undefined}
                  markerEnd={
                    line.highlighted
                      ? "url(#schematic-arrow-accent)"
                      : "url(#schematic-arrow-muted)"
                  }
                />
              ))}
            </svg>
            {dagLines.map((line) =>
              line.label ? (
                <span
                  key={`${line.id}-lbl`}
                  className={`schematic-dag-edge-pill ${
                    line.highlighted ? "is-active" : ""
                  }`}
                  style={{ left: `${line.lx}px`, top: `${line.ly}px` }}
                >
                  {line.label}
                </span>
              ) : null
            )}
            <div className="schematic-dag-tiers">
              {tiers.map((tier, tIdx) => (
                <div key={tIdx} className="schematic-dag-tier">
                  {tier.map((node) =>
                    renderNodeCard(node, indexById.get(node.id) ?? 0)
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {current && (
        <div className="schematic-inspector" aria-live="polite">
          <div className="schematic-inspector-bar">
            <div className="schematic-inspector-head">
              <span
                className={`schematic-inspector-pill tone-${
                  current.tone || "neutral"
                }`}
              >
                {String(safeIndex + 1).padStart(2, "0")} ·{" "}
                {current.badge || "LAYER"}
              </span>
              <strong className="schematic-inspector-title">
                <VisualRichText text={current.label} language={language} />
              </strong>
            </div>

            {orderedNodes.length > 1 && (
              <div
                className="schematic-stepper-nav"
                role="group"
                aria-label="Navigate blueprint layers"
              >
                <button
                  type="button"
                  className="schematic-step-arrow"
                  disabled={safeIndex === 0}
                  onClick={() => onSelectIndex(safeIndex - 1)}
                  aria-label="Previous visual step"
                >
                  <ChevronLeft size={14} />
                </button>
                <div className="schematic-step-dots">
                  {orderedNodes.map((n, idx) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`schematic-step-dot ${
                        idx === safeIndex ? "is-current" : ""
                      }`}
                      onClick={() => onSelectIndex(idx)}
                      aria-label={`Layer ${idx + 1}: ${n.label}`}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="schematic-step-arrow"
                  disabled={safeIndex === orderedNodes.length - 1}
                  onClick={() => onSelectIndex(safeIndex + 1)}
                  aria-label="Next visual step"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          <div
            className={`schematic-inspector-grid ${
              current.code || current.formula ? "has-plaque" : ""
            }`}
          >
            <div className="schematic-inspector-prose">
              <p className="schematic-inspector-detail">
                <VisualRichText text={current.detail} language={language} />
              </p>
              {currentRelationships.length > 0 && (
                <div className="schematic-relations">
                  {currentRelationships.map((rel) => (
                    <button
                      key={rel.id}
                      type="button"
                      className="schematic-relation-chip"
                      onClick={() => onSelectIndex(rel.otherIdx)}
                    >
                      <span>{rel.incoming ? "← from" : "→ to"}</span>
                      <strong>
                        {String(rel.otherIdx + 1).padStart(2, "0")}{" "}
                        {rel.otherTitle}
                      </strong>
                      {rel.label && <em>({rel.label})</em>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(current.formula || current.code) && (
              <div className="schematic-inspector-plaque">
                {current.formula && (
                  <div className="schematic-plaque-formula">
                    <VisualRichText
                      text={
                        current.formula.startsWith("$")
                          ? current.formula
                          : `$${current.formula}$`
                      }
                    />
                  </div>
                )}
                {current.code && (
                  <div className="schematic-plaque-code">
                    <VisualRichText
                      text={current.code}
                      language={language}
                      detectCodeLabel
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
