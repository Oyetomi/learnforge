import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Crosshair,
  Minus,
  Plus,
  Route,
  Lock,
  X,
} from "lucide-react";
import type { ChatMessage, Milestone } from "../../types";
import {
  layoutRoadmap,
  roadmapEdges,
  roadmapNeighborhood,
  roadmapConnection,
} from "../../services/learning/roadmap";
import {
  approvedLessonIds,
  isLessonUnlocked,
} from "../../services/learning/adaptation";
import { learningEvidence } from "../../services/learning/checks";
import {
  LESSON_STEP_EVENT,
  readLessonProgress,
  type LessonProgress,
} from "../../services/learning/steps";

interface MilestoneSidebarProps {
  milestones: Milestone[];
  messages?: ChatMessage[];
  activeMilestoneId?: string;
  onSelectMilestone: (milestone: Milestone) => void;
  onClose: () => void;
}
export const cleanMilestoneTitle = (title: string) =>
  title.replace(/^Milestone\s*\d+\s*:\s*/i, "");

const Roadmap: React.FC<{
  milestones: Milestone[];
  messages: ChatMessage[];
  activeId?: string;
  onSelect: (milestone: Milestone) => void;
  zoom?: number;
  spotlight?: boolean;
  horizontal?: boolean;
}> = ({
  milestones,
  messages,
  activeId,
  onSelect,
  zoom = 1,
  spotlight = true,
  horizontal = false,
}) => {
  const graph = useMemo(
    () => layoutRoadmap(milestones, horizontal ? "horizontal" : "vertical"),
    [milestones, horizontal]
  );
  const marker = useId().replace(/:/g, "");
  const approved = approvedLessonIds(messages);
  const neighbours = new Set(
    roadmapNeighborhood(milestones, activeId).map((m) => m.id)
  );
  return (
    <div
      className="roadmap-canvas-size"
      style={{ width: graph.width * zoom, height: graph.height * zoom }}
    >
      <div
        className="roadmap-canvas"
        style={{
          width: graph.width,
          height: graph.height,
          transform: `scale(${zoom})`,
        }}
      >
        <svg
          className="roadmap-connectors"
          width={graph.width}
          height={graph.height}
          aria-hidden="true"
        >
          <defs>
            <marker
              id={marker}
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path
                d="M0,0 L6,3 L0,6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const points = roadmapConnection(graph, edge, horizontal);
            const related = edge.from === activeId || edge.to === activeId;
            return (
              <g
                key={`${edge.from}-${edge.to}`}
                className={`roadmap-edge ${related ? "is-related" : ""}`}
              >
                <path
                  d={points
                    .map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`)
                    .join(" ")}
                  strokeLinejoin="round"
                  markerEnd={`url(#${marker})`}
                  strokeDasharray={edge.kind === "sequence" ? "3 4" : undefined}
                />
              </g>
            );
          })}
        </svg>
        {graph.nodes.map((node) => {
          const m = node.milestone,
            current = m.id === activeId,
            evidence = learningEvidence(messages, m.id);
          const explored = messages.some(
            (message) =>
              message.milestone_id === m.id ||
              message.learning_check?.milestoneId === m.id
          );
          const available = isLessonUnlocked(m, milestones, approved);
          const status = current
            ? "Current"
            : m.status === "completed"
            ? approved.has(m.id)
              ? "Ready"
              : "Past activity"
            : explored
            ? "Explored"
            : !available
            ? "Prerequisite needed"
            : m.deferred
            ? "Kept for later"
            : "Available";
          return (
            <button
              key={m.id}
              className={`roadmap-node ${current ? "is-current" : ""} ${
                m.status === "completed" ? "is-complete" : ""
              } ${
                spotlight && activeId && !neighbours.has(m.id)
                  ? "is-distant"
                  : ""
              }`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
              }}
              aria-current={current ? "step" : undefined}
              aria-label={`${available ? "Open" : "Preview"} lesson ${
                node.index + 1
              }: ${cleanMilestoneTitle(m.title)}. ${status}`}
              onClick={() => onSelect(m)}
            >
              <span className="roadmap-node-status">
                {m.status === "completed" ? (
                  <Check size={11} />
                ) : available ? (
                  <i />
                ) : (
                  <Lock size={10} />
                )}
                {status}
                <span>{String(node.index + 1).padStart(2, "0")}</span>
              </span>
              <span className="roadmap-node-title">
                {cleanMilestoneTitle(m.title)}
              </span>
              {m.adaptive && (
                <small className="roadmap-adaptive-note">
                  Added for a learning gap
                </small>
              )}
              {evidence.independentCorrect > 0 && (
                <small>
                  {evidence.independentCorrect} independent{" "}
                  {evidence.independentCorrect === 1
                    ? "application"
                    : "applications"}
                </small>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const MilestoneSidebar: React.FC<MilestoneSidebarProps> = ({
  milestones,
  messages = [],
  activeMilestoneId,
  onSelectMilestone,
  onClose,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 900px)").matches
  );
  useEffect(() => {
    const screen = window.matchMedia("(min-width: 900px)");
    const update = () => setHorizontal(screen.matches);
    screen.addEventListener("change", update);
    return () => screen.removeEventListener("change", update);
  }, []);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null),
    stageRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const current = milestones.find(
    (m) => m.id === (previewId || activeMilestoneId)
  );
  const approved = approvedLessonIds(messages);
  const shown = focusOnly
    ? roadmapNeighborhood(milestones, activeMilestoneId)
    : milestones;
  const graph = layoutRoadmap(shown, horizontal ? "horizontal" : "vertical");
  const completed = milestones.filter((m) => m.status === "completed").length;
  const edges = roadmapEdges(milestones);
  const [stepProgress, setStepProgress] = useState<LessonProgress | null>(() =>
    readLessonProgress(activeMilestoneId)
  );
  useEffect(() => {
    setStepProgress(readLessonProgress(activeMilestoneId));
    const onStep = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.milestoneId === activeMilestoneId)
        setStepProgress({ seen: detail.seen, total: detail.total });
    };
    window.addEventListener(LESSON_STEP_EVENT, onStep);
    return () => window.removeEventListener(LESSON_STEP_EVENT, onStep);
  }, [activeMilestoneId]);
  const stepperRow = (m: Milestone, index: number) => {
    const current = m.id === activeMilestoneId;
    const done = m.status === "completed";
    const available = isLessonUnlocked(m, milestones, approved);
    const explored = messages.some(
      (message) =>
        message.milestone_id === m.id ||
        message.learning_check?.milestoneId === m.id
    );
    const blocker = !available
      ? edges
          .filter(
            (e) =>
              e.to === m.id && e.kind === "requires" && !approved.has(e.from)
          )
          .map((e) => milestones.findIndex((x) => x.id === e.from))
          .find((i) => i >= 0)
      : undefined;
    const status = current
      ? stepProgress &&
        stepProgress.total > 1 &&
        stepProgress.seen < stepProgress.total
        ? `Current · step ${stepProgress.seen}/${stepProgress.total}`
        : "Current"
      : done
      ? approved.has(m.id)
        ? "Ready"
        : "Done"
      : !available
      ? blocker !== undefined
        ? `Needs ${String(blocker + 1).padStart(2, "0")}`
        : "Locked"
      : explored
      ? "Explored"
      : m.deferred
      ? "Kept for later"
      : "Available";
    return (
      <li
        key={m.id}
        className={`roadmap-step ${current ? "is-current" : ""} ${
          done ? "is-complete" : ""
        } ${!available ? "is-locked" : ""}`}
      >
        <button
          type="button"
          onClick={() => select(m)}
          aria-current={current ? "step" : undefined}
          aria-label={`${available ? "Open" : "Preview"} lesson ${
            index + 1
          }: ${cleanMilestoneTitle(m.title)}. ${status}`}
        >
          <span className="roadmap-step-marker" aria-hidden="true">
            {done ? (
              <Check size={11} />
            ) : !available ? (
              <Lock size={10} />
            ) : (
              <i />
            )}
          </span>
          <span className="roadmap-step-body">
            <span className="roadmap-step-title">
              <em>{String(index + 1).padStart(2, "0")}</em>
              {cleanMilestoneTitle(m.title)}
            </span>
            <span className="roadmap-step-status">
              {status}
              {current && m.adaptive && (
                <span className="roadmap-step-adaptive">gap fill</span>
              )}
            </span>
            {current && stepProgress && stepProgress.total > 1 && (
              <span className="roadmap-step-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.round(
                      (stepProgress.seen / stepProgress.total) * 100
                    )}%`,
                  }}
                />
              </span>
            )}
          </span>
        </button>
      </li>
    );
  };
  const parents = edges
    .filter((e) => e.to === (previewId || activeMilestoneId))
    .map((e) => ({
      milestone: milestones.find((m) => m.id === e.from)!,
      kind: e.kind,
    }));
  const next = edges
    .filter((e) => e.from === (previewId || activeMilestoneId))
    .map((e) => milestones.find((m) => m.id === e.to)!);
  const fit = (keepReadable = false) => {
    const box = stageRef.current;
    if (box)
      setZoom(
        Math.min(
          1.4,
          Math.max(
            keepReadable ? 0.9 : 0.4,
            Math.min(
              (box.clientWidth - 50) / graph.width,
              (box.clientHeight - 40) / graph.height
            )
          )
        )
      );
  };
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null,
      dialog = dialogRef.current;
    dialog?.showModal();
    fit(true);
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [expanded]);
  useEffect(() => {
    if (expanded) fit(true);
  }, [focusOnly, horizontal]);
  useEffect(() => {
    const viewport = miniRef.current;
    const node = viewport?.querySelector<HTMLElement>('[aria-current="step"]');
    if (viewport && node)
      viewport.scrollTop +=
        node.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        viewport.clientHeight / 2 +
        node.clientHeight / 2;
  }, [activeMilestoneId]);
  const select = (milestone: Milestone) => {
    if (!isLessonUnlocked(milestone, milestones, approved)) {
      setPreviewId(milestone.id);
      setExpanded(true);
      return;
    }
    setPreviewId(null);
    setExpanded(false);
    onSelectMilestone(milestone);
  };
  return (
    <aside
      id="learning-path"
      className="learning-sidebar roadmap-sidebar"
      aria-label="Learning path"
    >
      <div className="sidebar-heading">
        <span>
          <Route size={16} />
          Roadmap
        </span>
        <button
          className="icon-button mobile-sidebar-close"
          onClick={onClose}
          aria-label="Close learning path"
        >
          <X size={18} />
        </button>
      </div>
      <div className="roadmap-orientation">
        <span>
          {milestones.some((m) => m.adaptive)
            ? "Adjusted from your answers"
            : "Provisional roadmap"}
        </span>
        <strong>
          {Math.max(
            1,
            milestones.findIndex((m) => m.id === activeMilestoneId) + 1
          )}{" "}
          <span>/ {milestones.length}</span>
        </strong>
      </div>
      <div
        className="roadmap-mini"
        ref={miniRef}
        role="navigation"
        aria-label="Course roadmap"
      >
        <ol className="roadmap-stepper">{milestones.map(stepperRow)}</ol>
      </div>
      <button
        className="roadmap-expand"
        onClick={() => {
          setPreviewId(null);
          setExpanded(true);
        }}
      >
        Explore full roadmap
        <ArrowUpRight size={14} />
      </button>
      <div className="roadmap-summary">
        <span>
          {completed} of {milestones.length} activities complete
        </span>
      </div>
      {expanded && (
        <dialog
          ref={dialogRef}
          className="review-dialog roadmap-dialog"
          aria-labelledby="roadmap-title"
          onCancel={(e) => {
            e.preventDefault();
            setExpanded(false);
          }}
        >
          <div className="review-surface">
            <header className="review-header">
              <div>
                <Route size={18} />
                <h2 id="roadmap-title">Your learning roadmap</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setExpanded(false)}
                aria-label="Close roadmap"
              >
                <X size={18} />
              </button>
            </header>
            <div className="roadmap-controls">
              <button
                onClick={() => setFocusOnly((value) => !value)}
                aria-pressed={focusOnly}
              >
                <Crosshair size={14} />
                {focusOnly ? "Show whole path" : "Focus current concept"}
              </button>
              <span>
                {shown.length} / {milestones.length} concepts
              </span>
              <div>
                <button
                  aria-label="Zoom out roadmap"
                  onClick={() =>
                    setZoom((value) => Math.max(0.5, value - 0.15))
                  }
                >
                  <Minus size={15} />
                </button>
                <button onClick={() => fit()}>Fit</button>
                <button
                  aria-label="Zoom in roadmap"
                  onClick={() => setZoom((value) => Math.min(2, value + 0.15))}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div ref={stageRef} className="roadmap-stage">
              <Roadmap
                milestones={shown}
                messages={messages}
                activeId={activeMilestoneId}
                onSelect={select}
                horizontal={horizontal}
                zoom={zoom}
              />
            </div>
            <div className="roadmap-context">
              <div>
                <span>
                  {previewId ? "PREVIEW · PREREQUISITE REVIEW NEEDED" : "NOW"}
                </span>
                <strong>
                  {current
                    ? cleanMilestoneTitle(current.title)
                    : "Choose a concept"}
                </strong>
                {parents.length > 0 && (
                  <p>
                    {parents.every((p) => p.kind === "requires")
                      ? "Builds on"
                      : "Comes after"}
                    :{" "}
                    {parents
                      .map((p) => cleanMilestoneTitle(p.milestone.title))
                      .join(" · ")}
                  </p>
                )}
                {next.length > 0 && (
                  <p>
                    Leads to:{" "}
                    {next.map((m) => cleanMilestoneTitle(m.title)).join(" · ")}
                  </p>
                )}
              </div>
              <p>
                Current = where you are.
                <br />
                Explored = opened in this session.
                <br />
                Activity complete = demonstrated or tested.
                <br />
              </p>
            </div>
          </div>
        </dialog>
      )}
    </aside>
  );
};
