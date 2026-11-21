import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Cog,
  Compass,
  Cpu,
  Layers,
  Lock,
  Monitor,
  Network,
  Play,
  Radio,
  RotateCcw,
  Server,
  Terminal,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  validateTimelineModel,
  type LaneStateKind,
  type TimelineActorRole,
  type TimelineMessage,
  type TimelineMessageKind,
  type TimelineModelSpec,
} from "../../services/learning/timelineModel";
import { highlightSource } from "../chat/CodeBlock";
import { VisualRichText } from "./VisualRichText";
import { useFigureTheme } from "./useFigureTheme";
import "./timeline-diagram.css";

export interface TimelineDiagramProps {
  spec: TimelineModelSpec;
  language?: string;
  onInteract: () => void;
}

const ROLE_ICONS: Record<TimelineActorRole, LucideIcon> = {
  participant: User,
  entity: CircleDot,
  system: Layers,
  stage: Compass,
  signal: Radio,
  agent: Activity,
  goroutine: Cpu,
  channel: ArrowLeftRight,
  client: Monitor,
  server: Server,
  worker: Cog,
  lock: Lock,
  node: Network,
  process: Terminal,
};

const STATE_LABELS: Record<LaneStateKind, string> = {
  idle: "Idle",
  running: "Active",
  blocked: "Blocked",
  waiting: "Waiting",
  done: "Done",
  error: "Error",
};

const MESSAGE_KIND_LABELS: Record<TimelineMessageKind, string> = {
  send: "send",
  receive: "receive",
  call: "call",
  response: "response",
  cancel: "cancel",
  lock: "lock",
  signal: "signal",
  transfer: "transfer",
  trigger: "trigger",
};

function getRoleIcon(role?: TimelineActorRole): LucideIcon {
  if (role && Object.prototype.hasOwnProperty.call(ROLE_ICONS, role)) {
    return ROLE_ICONS[role];
  }
  return CircleDot;
}

function getMessageKindLabel(kind?: TimelineMessageKind): string | null {
  if (kind && Object.prototype.hasOwnProperty.call(MESSAGE_KIND_LABELS, kind)) {
    return MESSAGE_KIND_LABELS[kind];
  }
  return null;
}

function renderStateIcon(state: LaneStateKind) {
  switch (state) {
    case "running":
      return <Play size={10} className="timeline-state-icon" aria-hidden={true} />;
    case "blocked":
      return <Ban size={10} className="timeline-state-icon" aria-hidden={true} />;
    case "waiting":
      return <Clock size={10} className="timeline-state-icon" aria-hidden={true} />;
    case "done":
      return <Check size={11} className="timeline-state-icon" aria-hidden={true} />;
    case "error":
      return (
        <AlertTriangle size={10} className="timeline-state-icon" aria-hidden={true} />
      );
    default:
      return null;
  }
}

interface OverlayGeometry {
  width: number;
  height: number;
  rowCenters: Record<string, number>;
}

const DEFAULT_OVERLAY_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 68;

function fallbackOverlayGeometry(spec: TimelineModelSpec): OverlayGeometry {
  const rowCenters: Record<string, number> = {};
  for (let i = 0; i < spec.actors.length; i++) {
    rowCenters[spec.actors[i].id] = (i + 0.5) * DEFAULT_ROW_HEIGHT;
  }
  return {
    width: DEFAULT_OVERLAY_WIDTH,
    height: Math.max(DEFAULT_ROW_HEIGHT, spec.actors.length * DEFAULT_ROW_HEIGHT),
    rowCenters,
  };
}

interface ArrowOverlayProps {
  spec: TimelineModelSpec;
  activeStep: number;
  messages: TimelineMessage[];
  gridRef: React.RefObject<HTMLDivElement>;
}

function ActiveStepArrows({
  spec,
  activeStep,
  messages,
  gridRef,
}: ArrowOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const markerPrefix = useId().replace(/:/g, "");
  const fallback = useMemo(() => fallbackOverlayGeometry(spec), [spec]);
  const [measured, setMeasured] = useState<OverlayGeometry | null>(null);

  const measure = useCallback(() => {
    const grid = gridRef.current;
    const overlay = overlayRef.current;
    if (!grid || !overlay) return;
    const overlayBox = overlay.getBoundingClientRect();
    if (overlayBox.width <= 0 || overlayBox.height <= 0) return;
    const centers: Record<string, number> = {};
    const rows = grid.querySelectorAll<HTMLElement>("[data-actor-row]");
    rows.forEach((node) => {
      const actorId = node.dataset.actorRow;
      if (!actorId) return;
      const box = node.getBoundingClientRect();
      centers[actorId] = box.top + box.height / 2 - overlayBox.top;
    });
    if (Object.keys(centers).length === 0) return;
    setMeasured({
      width: overlayBox.width,
      height: overlayBox.height,
      rowCenters: centers,
    });
  }, [gridRef]);

  useEffect(() => {
    measure();
    if (
      !gridRef.current ||
      !overlayRef.current ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(gridRef.current);
    observer.observe(overlayRef.current);
    return () => observer.disconnect();
  }, [measure, activeStep, messages.length, gridRef]);

  if (messages.length === 0) return null;

  const geom = measured ?? fallback;
  const count = messages.length;
  const actorIndexById: Record<string, number> = {};
  spec.actors.forEach((actor, index) => {
    actorIndexById[actor.id] = index;
  });

  return (
    <div
      ref={overlayRef}
      className="timeline-arrows-overlay"
      style={{
        gridColumn: activeStep + 2,
        gridRow: `2 / span ${spec.actors.length}`,
      }}
      aria-hidden="true"
    >
      <svg
        className="timeline-arrows-svg"
        viewBox={`0 0 ${geom.width} ${geom.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          {(["default", "send", "receive", "call", "response", "cancel", "lock"] as const).map(
            (kind) => (
              <marker
                key={kind}
                id={`${markerPrefix}-${kind}`}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path
                  d="M1 1.2 L7 4 L1 6.8 Z"
                  className={`timeline-arrow-head is-kind-${kind}`}
                />
              </marker>
            )
          )}
        </defs>
        {messages.map((msg, idx) => {
          const fromY = Object.prototype.hasOwnProperty.call(
            geom.rowCenters,
            msg.from
          )
            ? geom.rowCenters[msg.from]
            : ((actorIndexById[msg.from] ?? 0) + 0.5) * DEFAULT_ROW_HEIGHT;
          const toY = Object.prototype.hasOwnProperty.call(
            geom.rowCenters,
            msg.to
          )
            ? geom.rowCenters[msg.to]
            : ((actorIndexById[msg.to] ?? 0) + 0.5) * DEFAULT_ROW_HEIGHT;
          const x = ((idx + 1) / (count + 1)) * geom.width;
          const dir = toY >= fromY ? 1 : -1;
          const pad = Math.min(12, Math.abs(toY - fromY) * 0.22);
          const y1 = fromY + dir * pad;
          const y2 = toY - dir * pad;
          const kindKey = msg.kind ?? "default";

          return (
            <g
              key={`${msg.from}-${msg.to}-${idx}`}
              className={`timeline-arrow-group is-kind-${kindKey}`}
            >
              <line
                x1={x}
                y1={y1}
                x2={x}
                y2={y2}
                className="timeline-arrow-line"
                markerEnd={`url(#${markerPrefix}-${kindKey})`}
              />
              {msg.kind === "lock" ? (
                <rect
                  x={x - 3}
                  y={y1 - 3}
                  width={6}
                  height={6}
                  className="timeline-arrow-origin"
                />
              ) : (
                <circle
                  cx={x}
                  cy={y1}
                  r={3}
                  className="timeline-arrow-origin"
                />
              )}
            </g>
          );
        })}
      </svg>

      {messages.map((msg, idx) => {
        const fromY = Object.prototype.hasOwnProperty.call(
          geom.rowCenters,
          msg.from
        )
          ? geom.rowCenters[msg.from]
          : ((actorIndexById[msg.from] ?? 0) + 0.5) * DEFAULT_ROW_HEIGHT;
        const toY = Object.prototype.hasOwnProperty.call(
          geom.rowCenters,
          msg.to
        )
          ? geom.rowCenters[msg.to]
          : ((actorIndexById[msg.to] ?? 0) + 0.5) * DEFAULT_ROW_HEIGHT;
        const midY = (fromY + toY) / 2;
        const stagger = count > 1 ? (idx - (count - 1) / 2) * 14 : 0;
        const clampedTopPct = Math.max(
          8,
          Math.min(92, ((midY + stagger) / geom.height) * 100)
        );
        const leftPct = ((idx + 1) / (count + 1)) * 100;
        const kindKey = msg.kind ?? "default";

        return (
          <span
            key={`pill-${msg.from}-${msg.to}-${idx}`}
            className={`timeline-arrow-pill is-kind-${kindKey}`}
            style={{
              top: `${clampedTopPct}%`,
              left: `${leftPct}%`,
            }}
            title={msg.label}
          >
            {msg.label}
          </span>
        );
      })}
    </div>
  );
}

export function TimelineDiagram({
  spec,
  language,
  onInteract,
}: TimelineDiagramProps) {
  const safe = useMemo(() => validateTimelineModel(spec), [spec]);
  const specKey = useMemo(() => (safe ? JSON.stringify(safe) : "invalid"), [safe]);

  if (!safe) {
    return (
      <p className="timeline-diagram-invalid" role="status">
        This timeline is incomplete. Ask for a corrected diagram; your lesson
        and answer are unchanged.
      </p>
    );
  }

  return (
    <TimelineContent
      key={specKey}
      spec={safe}
      language={language}
      onInteract={onInteract}
    />
  );
}

function TimelineContent({
  spec,
  language,
  onInteract,
}: {
  spec: TimelineModelSpec;
  language?: string;
  onInteract: () => void;
}) {
  const { theme, toggleTheme } = useFigureTheme();
  const [activeStep, setActiveStep] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const codeLanguage = spec.language || language || "";

  const clampedStep = Math.min(activeStep, spec.steps.length - 1);
  const currentStep = spec.steps[clampedStep];
  const activeMessages = currentStep.messages ?? [];

  const actorById = useMemo(() => {
    const map: Record<string, (typeof spec.actors)[number]> = {};
    for (const actor of spec.actors) {
      map[actor.id] = actor;
    }
    return map;
  }, [spec.actors]);

  const hasErrorState = useMemo(
    () =>
      spec.steps.some((step) =>
        step.lanes.some((lane) => lane.state === "error")
      ),
    [spec.steps]
  );

  const sourceLines = useMemo(() => {
    if (!spec.source) return null;
    return spec.source.split("\n").map((line, index) => ({
      number: index + 1,
      raw: line,
      html: codeLanguage ? highlightSource(line, codeLanguage) : null,
    }));
  }, [spec.source, codeLanguage]);

  const selectStep = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= spec.steps.length) return;
      if (nextIndex === clampedStep) return;
      setActiveStep(nextIndex);
      onInteract();
    },
    [spec.steps.length, clampedStep, onInteract]
  );

  const handleColumnKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectStep(Math.min(spec.steps.length - 1, index + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectStep(Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      selectStep(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectStep(spec.steps.length - 1);
    }
  };

  const legendStates: LaneStateKind[] = hasErrorState
    ? ["running", "blocked", "waiting", "done", "error"]
    : ["running", "blocked", "waiting", "done"];

  return (
    <figure
      className="timeline-diagram"
      data-theme={theme}
      aria-label="Interactive concurrency and protocol timeline"
    >
      <div className="timeline-header">
        <span className="timeline-context">
          Execution timeline · select any time column to trace actor states
        </span>
        <button
          type="button"
          className="timeline-theme-btn"
          aria-pressed={theme === "light"}
          title="Toggle light paper"
          onClick={toggleTheme}
        >
          Light paper
        </button>
      </div>

      <div className="timeline-legend" aria-label="Execution state legend">
        {legendStates.map((stateKind) => (
          <span
            key={stateKind}
            className={`timeline-legend-item is-state-${stateKind}`}
          >
            <span
              className={`timeline-legend-swatch is-${stateKind}`}
              aria-hidden="true"
            >
              {renderStateIcon(stateKind)}
            </span>
            <span>{STATE_LABELS[stateKind]}</span>
          </span>
        ))}
      </div>

      <div className="timeline-grid-scroll">
        <div
          ref={gridRef}
          className="timeline-grid"
          style={{
            gridTemplateColumns: `minmax(140px, 188px) repeat(${spec.steps.length}, minmax(98px, 1fr))`,
            gridTemplateRows: `auto repeat(${spec.actors.length}, minmax(66px, auto))`,
          }}
        >
          <div
            className="timeline-corner"
            style={{ gridColumn: 1, gridRow: 1 }}
          >
            <span>Actor</span>
            <span className="timeline-corner-axis">Time</span>
          </div>

          {spec.steps.map((step, stepIndex) => {
            const isActive = stepIndex === clampedStep;
            const isFuture = stepIndex > clampedStep;
            const msgCount = step.messages?.length ?? 0;

            return (
              <div
                key={`head-${step.id}`}
                className={`timeline-col-header${isActive ? " is-active" : ""}${
                  isFuture ? " is-future" : ""
                }`}
                style={{ gridColumn: stepIndex + 2, gridRow: 1 }}
              >
                <button
                  type="button"
                  className={`timeline-col-btn${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "step" : undefined}
                  aria-pressed={isActive}
                  aria-label={`Jump to step ${stepIndex + 1} (t${stepIndex + 1}): ${step.label}`}
                  title={step.label}
                  onClick={() => selectStep(stepIndex)}
                  onKeyDown={(event) => handleColumnKeyDown(event, stepIndex)}
                >
                  <span className="timeline-col-tick">t{stepIndex + 1}</span>
                  {msgCount > 0 && (
                    <span
                      className="timeline-col-msg-dot"
                      aria-label={`${msgCount} ${msgCount === 1 ? "message" : "messages"}`}
                    >
                      {msgCount}
                    </span>
                  )}
                </button>
              </div>
            );
          })}

          {spec.actors.map((actor, actorIndex) => {
            const RoleIcon = getRoleIcon(actor.role);
            const rowNumber = actorIndex + 2;

            return (
              <React.Fragment key={actor.id}>
                <div
                  className="timeline-actor-cell"
                  data-actor-row={actor.id}
                  style={{ gridColumn: 1, gridRow: rowNumber }}
                >
                  <div className="timeline-actor-name">
                    <RoleIcon
                      size={14}
                      className="timeline-actor-icon"
                      aria-hidden={true}
                    />
                    <span className="timeline-actor-label">
                      <VisualRichText
                        text={actor.label}
                        language={codeLanguage}
                        detectCodeLabel
                      />
                    </span>
                  </div>
                  {actor.role && (
                    <span className="timeline-actor-role">{actor.role}</span>
                  )}
                </div>

                {spec.steps.map((step, stepIndex) => {
                  const snapshot =
                    step.lanes.find((item) => item.actorId === actor.id) ?? {
                      actorId: actor.id,
                      state: "idle" as LaneStateKind,
                    };
                  const isActive = stepIndex === clampedStep;
                  const isPast = stepIndex < clampedStep;
                  const isFuture = stepIndex > clampedStep;

                  return (
                    <div
                      key={`${actor.id}-${step.id}`}
                      className={`timeline-cell is-state-${snapshot.state}${
                        isActive ? " is-active" : ""
                      }${isPast ? " is-past" : ""}${
                        isFuture ? " is-future" : ""
                      }`}
                      style={{
                        gridColumn: stepIndex + 2,
                        gridRow: rowNumber,
                      }}
                      data-step-index={stepIndex}
                      data-actor-id={actor.id}
                      data-lane-state={snapshot.state}
                      onClick={() => selectStep(stepIndex)}
                      title={`${actor.label} at t${stepIndex + 1}: ${
                        STATE_LABELS[snapshot.state]
                      }${snapshot.label ? ` — ${snapshot.label}` : ""}`}
                    >
                      <span
                        className="timeline-cell-hairline"
                        aria-hidden="true"
                      />
                      <div
                        className={`timeline-bar is-${snapshot.state}`}
                        aria-label={`${actor.label} at t${stepIndex + 1}: ${
                          STATE_LABELS[snapshot.state]
                        }${snapshot.label ? `, ${snapshot.label}` : ""}`}
                      >
                        {renderStateIcon(snapshot.state)}
                        {snapshot.state === "blocked" && (
                          <span className="timeline-bar-cue">blocked</span>
                        )}
                        {snapshot.state === "error" && (
                          <span className="timeline-bar-cue">error</span>
                        )}
                        {snapshot.state === "waiting" && !snapshot.label && (
                          <span className="timeline-bar-cue">wait</span>
                        )}
                      </div>
                      {snapshot.label && (
                        <span className="timeline-cell-label">
                          {snapshot.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          <ActiveStepArrows
            spec={spec}
            activeStep={clampedStep}
            messages={activeMessages}
            gridRef={gridRef}
          />
        </div>
      </div>

      {activeMessages.length > 0 && (
        <div
          className="timeline-messages-panel"
          aria-label={`Messages at step ${clampedStep + 1}`}
        >
          <span className="timeline-messages-heading">
            Messages at t{clampedStep + 1}
          </span>
          <ul className="timeline-messages-list">
            {activeMessages.map((msg, idx) => {
              const fromActor = Object.prototype.hasOwnProperty.call(
                actorById,
                msg.from
              )
                ? actorById[msg.from].label
                : msg.from;
              const toActor = Object.prototype.hasOwnProperty.call(
                actorById,
                msg.to
              )
                ? actorById[msg.to].label
                : msg.to;
              const kindLabel = getMessageKindLabel(msg.kind);

              return (
                <li
                  key={`${msg.from}-${msg.to}-${idx}`}
                  className={`timeline-message-row is-kind-${msg.kind ?? "default"}`}
                >
                  <span className="timeline-message-route">
                    <strong>{fromActor}</strong>
                    <ArrowRight
                      size={12}
                      className="timeline-message-route-icon"
                      aria-hidden={true}
                    />
                    <strong>{toActor}</strong>
                  </span>
                  {kindLabel && (
                    <span className="timeline-message-kind">{kindLabel}</span>
                  )}
                  <span className="timeline-message-text">
                    <VisualRichText text={msg.label} language={codeLanguage} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <figcaption
        className="timeline-caption"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="timeline-caption-title">
          <span className="timeline-caption-tick">t{clampedStep + 1}</span>
          <strong>
            <VisualRichText text={currentStep.label} language={codeLanguage} />
          </strong>
        </div>
        <p className="timeline-caption-explanation">
          <VisualRichText
            text={currentStep.explanation}
            language={codeLanguage}
          />
        </p>
      </figcaption>

      {sourceLines && (
        <div className="timeline-source">
          <div className="timeline-source-header">
            <span>
              Related source{codeLanguage ? ` · ${codeLanguage}` : ""}
            </span>
            <span className="timeline-source-line-badge">
              {currentStep.codeLine
                ? `Line ${currentStep.codeLine}`
                : "Overview"}
            </span>
          </div>
          <pre
            className="timeline-source-pre"
            tabIndex={0}
            aria-label="Timeline source code"
          >
            <code>
              {sourceLines.map((line) => {
                const isHighlighted = currentStep.codeLine === line.number;
                return (
                  <span
                    key={line.number}
                    className={`timeline-code-line${
                      isHighlighted ? " is-highlighted" : ""
                    }`}
                    data-code-line={line.number}
                    data-active-line={isHighlighted ? "true" : undefined}
                  >
                    <span
                      className="timeline-line-number"
                      aria-hidden="true"
                    >
                      {line.number}
                    </span>
                    {line.html !== null ? (
                      <span
                        className="timeline-line-text"
                        dangerouslySetInnerHTML={{ __html: line.html }}
                      />
                    ) : (
                      <span className="timeline-line-text">
                        {line.raw || " "}
                      </span>
                    )}
                  </span>
                );
              })}
            </code>
          </pre>
        </div>
      )}

      <nav className="timeline-controls" aria-label="Timeline step controls">
        <button
          type="button"
          className="timeline-nav-btn"
          disabled={clampedStep === 0}
          onClick={() => selectStep(clampedStep - 1)}
        >
          <ChevronLeft size={13} aria-hidden={true} />
          Previous
        </button>
        <span className="timeline-step-counter">
          Step {clampedStep + 1} of {spec.steps.length}
        </span>
        <button
          type="button"
          className="timeline-nav-btn is-primary"
          disabled={clampedStep >= spec.steps.length - 1}
          onClick={() => selectStep(clampedStep + 1)}
        >
          Next
          <ChevronRight size={13} aria-hidden={true} />
        </button>
        <button
          type="button"
          className="timeline-nav-btn timeline-reset-btn"
          disabled={clampedStep === 0}
          onClick={() => selectStep(0)}
        >
          <RotateCcw size={12} aria-hidden={true} />
          Reset
        </button>
      </nav>
    </figure>
  );
}
