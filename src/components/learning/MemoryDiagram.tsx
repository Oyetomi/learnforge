import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import {
  parsePointerTarget,
  validateMemoryModel,
  type MemoryBlock,
  type MemoryModelSpec,
} from "../../services/learning/memoryModel";
import { highlightSource } from "../chat/CodeBlock";
import { useFigureTheme } from "./useFigureTheme";
import { VisualRichText } from "./VisualRichText";
import "./memory-diagram.css";

export interface MemoryDiagramProps {
  spec: MemoryModelSpec;
  language?: string;
  onInteract: () => void;
}

export interface RectBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PointerAnchorInput {
  id: string;
  origin: RectBox;
  originBlock: RectBox;
  target: RectBox;
  targetBlock: RectBox;
  isCellTarget: boolean;
  sameBlock: boolean;
  changed: boolean;
  stale: boolean;
}

export interface MemoryPointerRoute {
  id: string;
  path: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  changed: boolean;
  stale: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute smooth non-overlapping SVG Bezier pointer curves from field ports
 * to target cells or blocks without cutting across block text.
 */
export function computeMemoryPointerRoutes(
  anchors: PointerAnchorInput[],
  stageWidth: number
): MemoryPointerRoute[] {
  const routes: MemoryPointerRoute[] = [];
  let gutterSlot = 0;

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const originRight = a.originBlock.left + a.originBlock.width;
    const targetRight = a.targetBlock.left + a.targetBlock.width;
    const x1 = a.origin.left + a.origin.width / 2;
    const y1 = a.origin.top + a.origin.height / 2;

    if (a.sameBlock) {
      const loopX = Math.min(
        stageWidth - 6,
        originRight + 18 + gutterSlot * 10
      );
      gutterSlot += 1;
      const x2 = originRight + 4;
      const y2 = a.targetBlock.top + Math.min(18, a.targetBlock.height / 2);
      const path = `M ${x1} ${y1} C ${loopX} ${y1}, ${loopX} ${y2}, ${x2} ${y2}`;
      routes.push({
        id: a.id,
        path,
        x1,
        y1,
        x2,
        y2,
        changed: a.changed,
        stale: a.stale,
      });
      continue;
    }

    const leftToRight = originRight <= a.targetBlock.left + 6;
    const rightToLeft = targetRight <= a.originBlock.left + 6;

    if (leftToRight) {
      const gap = Math.max(24, a.targetBlock.left - originRight);
      const isInnerCell =
        a.isCellTarget && a.target.left > a.targetBlock.left + 20;

      if (isInnerCell) {
        const x2 = a.target.left + a.target.width / 2;
        const y2 = a.target.top - 4;
        const midX = originRight + gap * 0.45 + (i % 3) * 4;
        const liftY = Math.min(y1, y2) - 18;
        const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${liftY}, ${x2} ${y2}`;
        routes.push({
          id: a.id,
          path,
          x1,
          y1,
          x2,
          y2,
          changed: a.changed,
          stale: a.stale,
        });
      } else {
        const x2 = a.target.left - 4;
        const y2 = a.isCellTarget
          ? a.target.top + a.target.height / 2
          : clamp(
              y1,
              a.target.top + 16,
              a.target.top + Math.max(16, a.target.height - 16)
            );
        const curveSpan = Math.max(26, (x2 - x1) * 0.48);
        const verticalSpread = ((i % 3) - 1) * 4;
        const path = `M ${x1} ${y1} C ${x1 + curveSpan} ${y1 + verticalSpread}, ${x2 - curveSpan} ${y2 - verticalSpread}, ${x2} ${y2}`;
        routes.push({
          id: a.id,
          path,
          x1,
          y1,
          x2,
          y2,
          changed: a.changed,
          stale: a.stale,
        });
      }
      continue;
    }

    if (rightToLeft) {
      const sx = a.originBlock.left - 2;
      const x2 = a.target.left + a.target.width + 4;
      const y2 = a.isCellTarget
        ? a.target.top + a.target.height / 2
        : clamp(
            y1,
            a.target.top + 16,
            a.target.top + Math.max(16, a.target.height - 16)
          );
      const curveSpan = Math.max(26, (sx - x2) * 0.48);
      const path = `M ${sx} ${y1} C ${sx - curveSpan} ${y1}, ${x2 + curveSpan} ${y2}, ${x2} ${y2}`;
      routes.push({
        id: a.id,
        path,
        x1: sx,
        y1,
        x2,
        y2,
        changed: a.changed,
        stale: a.stale,
      });
      continue;
    }

    // Same-column routing (narrow viewport or intra-region pointers): route via right outer gutter.
    const gutterX = Math.min(
      stageWidth - 6,
      Math.max(originRight, targetRight) + 18 + gutterSlot * 10
    );
    gutterSlot += 1;
    const x2 = a.isCellTarget
      ? a.target.left + a.target.width / 2
      : targetRight + 4;
    const y2 = a.isCellTarget
      ? a.target.top - 4
      : clamp(
          y1,
          a.target.top + 16,
          a.target.top + Math.max(16, a.target.height - 16)
        );
    const path = a.isCellTarget
      ? `M ${x1} ${y1} C ${gutterX} ${y1}, ${gutterX} ${y2 - 18}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${gutterX} ${y1}, ${gutterX} ${y2}, ${x2} ${y2}`;

    routes.push({
      id: a.id,
      path,
      x1,
      y1,
      x2,
      y2,
      changed: a.changed,
      stale: a.stale,
    });
  }

  return routes;
}

function formatStepNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function renderBlock(
  block: MemoryBlock,
  blockLabelMap: Map<string, string>,
  codeLanguage?: string
) {
  const classes = [
    "memory-block",
    `is-kind-${block.kind}`,
    block.changed ? "is-changed" : "",
    block.stale ? "is-stale" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      key={block.id}
      className={classes}
      data-memory-block={block.id}
      aria-label={`${block.label} (${block.region} ${block.kind})`}
    >
      <header className="memory-block-header">
        <div className="memory-block-title-group">
          <strong className="memory-block-label">
            <VisualRichText text={block.label} language={codeLanguage} />
          </strong>
          <span className="memory-kind-tag">{block.kind}</span>
        </div>
        <div className="memory-block-badges">
          {block.meta && (
            <span className="memory-badge memory-meta-badge">{block.meta}</span>
          )}
          {block.stale && (
            <span className="memory-badge memory-stale-badge">detached</span>
          )}
          {block.changed && !block.stale && (
            <span className="memory-badge memory-changed-badge">updated</span>
          )}
        </div>
      </header>

      {block.fields && block.fields.length > 0 && (
        <dl className="memory-fields">
          {block.fields.map((field, fieldIndex) => {
            const parsedTarget = field.pointsTo
              ? parsePointerTarget(field.pointsTo)
              : null;
            const targetLabel = parsedTarget
              ? blockLabelMap.get(parsedTarget.blockId) || parsedTarget.blockId
              : "";
            const pointerDescription = parsedTarget
              ? parsedTarget.cellIndex !== undefined
                ? `points to ${targetLabel} index ${parsedTarget.cellIndex}`
                : `points to ${targetLabel}`
              : "";

            return (
              <div
                key={`${field.name}-${fieldIndex}`}
                className={`memory-field${field.changed ? " is-changed" : ""}${
                  field.pointsTo ? " has-pointer" : ""
                }`}
              >
                <dt className="memory-field-name">{field.name}</dt>
                <dd className="memory-field-value">
                  <code>{field.value || "\u00A0"}</code>
                  {field.pointsTo && (
                    <>
                      <span
                        className="memory-pointer-port"
                        data-pointer-origin={`${block.id}:${fieldIndex}`}
                        data-pointer-target={field.pointsTo}
                        data-pointer-changed={
                          field.changed || block.changed ? "true" : "false"
                        }
                        data-pointer-stale={block.stale ? "true" : "false"}
                        aria-hidden="true"
                      />
                      <span className="memory-sr-only">
                        {" "}
                        ({pointerDescription})
                      </span>
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {block.cells && block.cells.length > 0 && (
        <div
          className="memory-cells"
          role="list"
          aria-label={`${block.label} memory cells`}
        >
          {block.cells.map((cell, cellIndex) => (
            <div
              key={`${cell.index}-${cellIndex}`}
              role="listitem"
              data-memory-cell={`${block.id}:${cell.index}`}
              className={`memory-cell${cell.highlight ? " is-highlight" : ""}${
                cell.inactive ? " is-inactive" : ""
              }`}
              aria-label={`Index ${cell.index}: ${
                cell.inactive
                  ? `${cell.value || "empty"} (spare capacity)`
                  : cell.value || "empty"
              }`}
            >
              <span className="memory-cell-index">{cell.index}</span>
              <span className="memory-cell-value">
                {cell.value === "" ? "\u00A0" : cell.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function MemoryDiagram({
  spec,
  language,
  onInteract,
}: MemoryDiagramProps) {
  const safe = useMemo(() => validateMemoryModel(spec), [spec]);
  const { theme, toggleTheme } = useFigureTheme();
  const markerBase = useId().replace(/:/g, "");
  const stageRef = useRef<HTMLDivElement>(null);

  const [trackedSpec, setTrackedSpec] = useState(safe);
  const [frameIndex, setFrameIndex] = useState(0);
  const [predictionPending, setPredictionPending] = useState(false);
  const [routes, setRoutes] = useState<MemoryPointerRoute[]>([]);
  const [stageHeight, setStageHeight] = useState(0);

  if (safe !== trackedSpec) {
    setTrackedSpec(safe);
    setFrameIndex(0);
    setPredictionPending(false);
  }

  const effectiveIndex = safe
    ? Math.min(frameIndex, safe.frames.length - 1)
    : 0;
  const frame = safe ? safe.frames[effectiveIndex] : null;
  const nextFrame = safe ? safe.frames[effectiveIndex + 1] : undefined;
  const codeLanguage = safe?.language || language;

  const sourceLines = useMemo(
    () => (safe?.source ? safe.source.split("\n") : []),
    [safe?.source]
  );

  const highlightedSourceLines = useMemo(
    () =>
      sourceLines.map((line) =>
        codeLanguage ? highlightSource(line, codeLanguage) : null
      ),
    [sourceLines, codeLanguage]
  );

  const measurePointers = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !frame) return;
    const stageBox = stage.getBoundingClientRect();
    if (stageBox.width <= 0) return;

    const toRelative = (rect: DOMRect): RectBox => ({
      left: rect.left - stageBox.left,
      top: rect.top - stageBox.top,
      width: rect.width,
      height: rect.height,
    });

    const blockEls = Array.from(
      stage.querySelectorAll<HTMLElement>("[data-memory-block]")
    );
    const cellEls = Array.from(
      stage.querySelectorAll<HTMLElement>("[data-memory-cell]")
    );
    const originEls = Array.from(
      stage.querySelectorAll<HTMLElement>("[data-pointer-origin]")
    );

    const blockById = new Map<string, HTMLElement>();
    for (const el of blockEls) {
      if (el.dataset.memoryBlock) blockById.set(el.dataset.memoryBlock, el);
    }

    const cellByKey = new Map<string, HTMLElement>();
    for (const el of cellEls) {
      if (el.dataset.memoryCell) cellByKey.set(el.dataset.memoryCell, el);
    }

    const anchors: PointerAnchorInput[] = [];
    for (const originEl of originEls) {
      const originId = originEl.dataset.pointerOrigin;
      const targetSpec = originEl.dataset.pointerTarget;
      if (!originId || !targetSpec) continue;

      const originBlockEl = originEl.closest<HTMLElement>("[data-memory-block]");
      if (!originBlockEl) continue;

      const parsed = parsePointerTarget(targetSpec);
      const targetBlockEl = blockById.get(parsed.blockId);
      if (!targetBlockEl) continue;

      const targetCellEl =
        parsed.cellIndex !== undefined
          ? cellByKey.get(`${parsed.blockId}:${parsed.cellIndex}`)
          : undefined;
      const targetEl = targetCellEl || targetBlockEl;

      anchors.push({
        id: originId,
        origin: toRelative(originEl.getBoundingClientRect()),
        originBlock: toRelative(originBlockEl.getBoundingClientRect()),
        target: toRelative(targetEl.getBoundingClientRect()),
        targetBlock: toRelative(targetBlockEl.getBoundingClientRect()),
        isCellTarget: Boolean(targetCellEl),
        sameBlock: originBlockEl === targetBlockEl,
        changed: originEl.dataset.pointerChanged === "true",
        stale:
          originEl.dataset.pointerStale === "true" ||
          targetBlockEl.classList.contains("is-stale"),
      });
    }

    setRoutes(computeMemoryPointerRoutes(anchors, stageBox.width));
    setStageHeight(stageBox.height);
  }, [frame]);

  useEffect(() => {
    measurePointers();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measurePointers);
    observer.observe(stage);
    stage
      .querySelectorAll("[data-memory-block], [data-memory-cell]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [measurePointers, effectiveIndex]);

  if (!safe || !frame) {
    return (
      <p className="memory-diagram-invalid" role="status">
        This memory diagram is incomplete. Ask for a corrected diagram; your
        lesson and answer are unchanged.
      </p>
    );
  }

  const stackBlocks = frame.blocks.filter((b) => b.region === "stack");
  const heapBlocks = frame.blocks.filter((b) => b.region === "heap");
  const hasBothRegions = stackBlocks.length > 0 && heapBlocks.length > 0;
  const hasAnyPointers = frame.blocks.some((b) =>
    b.fields?.some((f) => Boolean(f.pointsTo))
  );

  const blockLabelMap = new Map(frame.blocks.map((b) => [b.id, b.label]));

  const handlePrevious = () => {
    if (effectiveIndex <= 0) return;
    onInteract();
    setPredictionPending(false);
    setFrameIndex(effectiveIndex - 1);
  };

  const handleNext = () => {
    if (!nextFrame) return;
    onInteract();
    if (nextFrame.predictionPrompt && !predictionPending) {
      setPredictionPending(true);
      return;
    }
    setPredictionPending(false);
    setFrameIndex(effectiveIndex + 1);
  };

  const handleRevealNext = () => {
    if (!nextFrame) return;
    onInteract();
    setPredictionPending(false);
    setFrameIndex(effectiveIndex + 1);
  };

  const handleSelectFrame = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= safe.frames.length) return;
    if (targetIndex !== effectiveIndex || predictionPending) {
      onInteract();
    }
    setPredictionPending(false);
    setFrameIndex(targetIndex);
  };

  const handleReset = () => {
    if (effectiveIndex === 0 && !predictionPending) return;
    onInteract();
    setPredictionPending(false);
    setFrameIndex(0);
  };

  const defaultMarkerId = `${markerBase}-ptr`;
  const changedMarkerId = `${markerBase}-ptr-changed`;
  const staleMarkerId = `${markerBase}-ptr-stale`;

  return (
    <figure
      className="memory-diagram"
      data-theme={theme}
      aria-label="Interactive memory diagram"
    >
      <div className="memory-diagram-context">
        <span>
          Memory layout &middot; Frame {formatStepNumber(effectiveIndex)} of{" "}
          {formatStepNumber(safe.frames.length - 1)}
        </span>
        <button
          type="button"
          className="memory-diagram-theme"
          aria-pressed={theme === "light"}
          title="Toggle light paper"
          onClick={toggleTheme}
        >
          Light paper
        </button>
      </div>

      {sourceLines.length > 0 && (
        <div className="memory-source" aria-label="Source code">
          <div className="memory-source-header">
            <span>
              Source{codeLanguage ? ` · ${codeLanguage}` : ""}
            </span>
            {frame.codeLine !== undefined && (
              <span className="memory-source-line-badge">
                Line {frame.codeLine}
              </span>
            )}
          </div>
          <pre>
            <code>
              {sourceLines.map((line, lineIndex) => {
                const lineNumber = lineIndex + 1;
                const isActive = frame.codeLine === lineNumber;
                const html = highlightedSourceLines[lineIndex];
                return (
                  <span
                    key={lineNumber}
                    className={`memory-source-line${
                      isActive ? " is-active-line" : ""
                    }`}
                    data-line-number={lineNumber}
                    data-active-line={isActive ? "true" : undefined}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span className="memory-source-gutter" aria-hidden="true">
                      {lineNumber}
                    </span>
                    {html !== null ? (
                      <span
                        className="memory-source-code"
                        dangerouslySetInnerHTML={{ __html: html || " " }}
                      />
                    ) : (
                      <span className="memory-source-code">{line || " "}</span>
                    )}
                  </span>
                );
              })}
            </code>
          </pre>
        </div>
      )}

      <div
        ref={stageRef}
        className={`memory-stage${
          hasBothRegions ? " is-two-column" : " is-single-column"
        }${hasAnyPointers ? " has-pointers" : ""}`}
      >
        <svg
          className="memory-pointers"
          width="100%"
          height={stageHeight || "100%"}
          aria-hidden="true"
        >
          <defs>
            <marker
              id={defaultMarkerId}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path
                d="M1 1.2 L7 4 L1 6.8"
                fill="none"
                stroke="var(--mem-pointer)"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
            <marker
              id={changedMarkerId}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path
                d="M1 1.2 L7 4 L1 6.8"
                fill="none"
                stroke="var(--mem-pointer-changed)"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
            <marker
              id={staleMarkerId}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path
                d="M1 1.2 L7 4 L1 6.8"
                fill="none"
                stroke="var(--mem-pointer-stale)"
                strokeWidth="1.15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>
          {routes.map((route) => {
            const markerId = route.stale
              ? staleMarkerId
              : route.changed
              ? changedMarkerId
              : defaultMarkerId;
            return (
              <g
                key={route.id}
                className={`memory-pointer-route${
                  route.changed ? " is-changed" : ""
                }${route.stale ? " is-stale" : ""}`}
              >
                <path
                  d={route.path}
                  fill="none"
                  markerEnd={`url(#${markerId})`}
                />
                <circle cx={route.x1} cy={route.y1} r="2.75" />
              </g>
            );
          })}
        </svg>

        <div
          className={`memory-regions${
            hasBothRegions ? " is-two-column" : " is-single-column"
          }`}
        >
          {stackBlocks.length > 0 && (
            <section
              className="memory-region memory-region-stack"
              aria-label="Stack memory"
            >
              <h4 className="memory-region-title">
                <span>Stack</span>
              </h4>
              <div className="memory-region-blocks">
                {stackBlocks.map((block) =>
                  renderBlock(block, blockLabelMap, codeLanguage)
                )}
              </div>
            </section>
          )}

          {heapBlocks.length > 0 && (
            <section
              className="memory-region memory-region-heap"
              aria-label="Heap memory"
            >
              <h4 className="memory-region-title">
                <span>Heap</span>
              </h4>
              <div className="memory-region-blocks">
                {heapBlocks.map((block) =>
                  renderBlock(block, blockLabelMap, codeLanguage)
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <figcaption className="memory-caption" aria-live="polite" aria-atomic="true">
        <strong>
          Step {formatStepNumber(effectiveIndex)}.{" "}
          <VisualRichText text={frame.label} language={codeLanguage} />
        </strong>
        <p>
          <VisualRichText text={frame.explanation} language={codeLanguage} />
        </p>
      </figcaption>

      {predictionPending && nextFrame?.predictionPrompt && (
        <div
          className="memory-prediction"
          role="region"
          aria-label="Prediction prompt"
        >
          <p className="memory-prediction-prompt">
            <em>
              Before stepping:{" "}
              <VisualRichText
                text={nextFrame.predictionPrompt}
                language={codeLanguage}
              />
            </em>
          </p>
          <button
            type="button"
            className="memory-btn is-primary"
            onClick={handleRevealNext}
          >
            Reveal next frame
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        </div>
      )}

      <nav className="memory-controls" aria-label="Memory diagram steps">
        <button
          type="button"
          className="memory-btn"
          disabled={effectiveIndex === 0}
          onClick={handlePrevious}
        >
          <ChevronLeft size={13} aria-hidden="true" />
          Previous
        </button>

        <div className="memory-step-pills" role="group" aria-label="Frames">
          {safe.frames.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={`memory-pill${
                idx === effectiveIndex ? " is-current" : ""
              }`}
              aria-current={idx === effectiveIndex ? "step" : undefined}
              aria-label={`Frame ${idx + 1}: ${item.label}`}
              title={item.label}
              onClick={() => handleSelectFrame(idx)}
            >
              {formatStepNumber(idx)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="memory-btn is-primary"
          disabled={!nextFrame}
          onClick={handleNext}
        >
          Next
          <ChevronRight size={13} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="memory-btn memory-reset-btn"
          disabled={effectiveIndex === 0 && !predictionPending}
          onClick={handleReset}
        >
          <RotateCcw size={12} aria-hidden="true" />
          Reset
        </button>
      </nav>
    </figure>
  );
}
