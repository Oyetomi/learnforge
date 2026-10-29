import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import type { CourseTrack } from "../../services/ai/types";
import type { ChatMessage, Milestone } from "../../types";
import {
  curriculumForTrack,
  curriculumProgress,
  milestoneForUnit,
  firstAvailableFoundation,
} from "../../services/learning/curriculumPlan";
import {
  approvedLessonIds,
  isLessonUnlocked,
} from "../../services/learning/adaptation";
import {
  layoutCurriculumOverview,
  curriculumConnection,
} from "../../services/learning/curriculumLayout";
import "./curriculum.css";

interface Props {
  track: CourseTrack;
  milestones: Milestone[];
  messages: ChatMessage[];
  active: Milestone | null;
  onSelect: (milestone: Milestone) => void;
  onResume: () => void;
  onDiagnostic: (milestone: Milestone) => void;
}
export function CurriculumWorkspace({
  track,
  milestones,
  messages,
  active,
  onSelect,
  onResume,
  onDiagnostic,
}: Props) {
  const plan = curriculumForTrack(track),
    approved = approvedLessonIds(messages),
    progress = curriculumProgress(track, milestones, messages);
  const activeUnit = active?.adaptive
    ? milestones.find((m) => m.id === active.return_to_milestone_id)
        ?.curriculum_unit_id
    : active?.curriculum_unit_id;
  const currentModule =
    plan.modules.find((m) => m.units.some((u) => u.id === activeUnit)) ||
    plan.modules[0];
  const [selectedId, setSelectedId] = useState(currentModule.id),
    [view, setView] = useState<"map" | "outline">("map");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const inspector = useRef<HTMLElement>(null),
    title = useRef<HTMLHeadingElement>(null),
    mapBox = useRef<HTMLDivElement>(null),
    unitHeading = useRef<HTMLHeadingElement>(null);
  const [mapWidth, setMapWidth] = useState(620);
  useEffect(() => {
    const box = mapBox.current;
    if (!box) return;
    const observer = new ResizeObserver(() =>
      setMapWidth(Math.floor(box.getBoundingClientRect().width) - 1)
    );
    observer.observe(box);
    setMapWidth(Math.floor(box.getBoundingClientRect().width) - 1);
    return () => observer.disconnect();
  }, [view]);
  const marker = useId().replace(/:/g, "");
  useEffect(() => {
    title.current?.focus();
  }, [track.id]);
  const selected =
    plan.modules.find((m) => m.id === selectedId) || currentModule;
  const count = (id: string) =>
    plan.modules
      .find((m) => m.id === id)!
      .units.filter((u) => {
        const m = milestoneForUnit(track, milestones, u.id);
        return m && approved.has(m.id);
      }).length;
  const moduleNodes = useMemo(
    () =>
      plan.modules.map((module) => ({
        id: module.id,
        session_id: "",
        title: module.title,
        prompt: module.outcome,
        starter_code: "",
        status: "pending" as const,
        created_at: 0,
        prerequisite_ids: [
          ...new Set(
            module.units
              .flatMap((u) => u.prerequisiteIds)
              .flatMap((id) => {
                const parent = plan.modules.find((m) =>
                  m.units.some((u) => u.id === id)
                );
                return parent && parent.id !== module.id ? [parent.id] : [];
              })
          ),
        ],
      })),
    [track]
  );
  const graph = layoutCurriculumOverview(moduleNodes, mapWidth);
  const select = (id: string) => {
    setSelectedId(id);
    setSelectedUnitId(null);
    requestAnimationFrame(() => {
      const h = inspector.current?.querySelector<HTMLElement>("h2");
      h?.focus({ preventScroll: true });
      h?.scrollIntoView({ block: "nearest" });
    });
  };
  const unit =
    selected.units.find((u) => u.id === selectedUnitId) ||
    selected.units.find((u) => u.id === activeUnit) ||
    selected.units[0];
  const runtime = milestoneForUnit(track, milestones, unit.id);
  const available = runtime && isLessonUnlocked(runtime, milestones, approved);
  const foundation =
    runtime && firstAvailableFoundation(runtime, milestones, approved);
  return (
    <section
      className="curriculum-workspace"
      aria-labelledby="curriculum-title"
    >
      <header className="curriculum-heading">
        <div>
          <span className="curriculum-eyebrow">
            {plan.scope === "curriculum"
              ? "Your curriculum"
              : "Your learning plan"}
          </span>
          <h1 id="curriculum-title" tabIndex={-1} ref={title}>
            {track.title}
          </h1>
          <p>{plan.destination}</p>
        </div>
        <span className="curriculum-version">
          {plan.legacy
            ? "Existing plan preserved"
            : `Approved scope · v${plan.version}`}
        </span>
      </header>
      <div
        className="curriculum-progress"
        aria-label="Evidence of understanding"
      >
        <span>
          <strong>
            {progress.demonstrated} / {progress.total}
          </strong>{" "}
          outcomes demonstrated
        </span>
        <span>{progress.practising} practising</span>
        <small>
          Progress reflects text/code checks; practical performance needs
          additional evidence.
        </small>
      </div>
      {active && (
        <section className="curriculum-next">
          <div>
            <span className="curriculum-eyebrow">Continue where you are</span>
            <h2>{active.title}</h2>
            <p>
              {active.adaptive
                ? `A smaller step before returning to ${
                    milestones.find(
                      (m) => m.id === active.return_to_milestone_id
                    )?.title || "your original task"
                  }.`
                : active.adaptation_reason ||
                  (active.curriculum_unit_id ===
                  track.placement?.startMilestoneId
                    ? track.placement?.reason
                    : undefined) ||
                  "Build evidence for this outcome through a small example and fresh practice."}
            </p>
          </div>
          <button className="dialog-primary-button" onClick={onResume}>
            {approved.has(active.id)
              ? "Review current unit"
              : "Continue learning"}
            <ArrowRight size={14} />
          </button>
        </section>
      )}
      <div className="curriculum-content">
        <section aria-label="Curriculum navigation">
          <div className="curriculum-viewbar">
            <div role="group" aria-label="Curriculum view">
              <button
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                Map
              </button>
              <button
                aria-pressed={view === "outline"}
                onClick={() => setView("outline")}
              >
                Outline
              </button>
            </div>
            <small>
              {plan.modules.length} modules · {progress.total} outcomes
            </small>
          </div>
          {view === "map" ? (
            <div className="curriculum-map-scroll" ref={mapBox}>
              <div
                className="curriculum-map"
                style={{ width: graph.width, height: graph.height }}
              >
                <svg
                  width={graph.width}
                  height={graph.height}
                  aria-hidden="true"
                >
                  <defs>
                    <marker
                      id={marker}
                      markerWidth="7"
                      markerHeight="7"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path
                        d="M0 0 L6 3 L0 6"
                        fill="none"
                        stroke="currentColor"
                      />
                    </marker>
                  </defs>
                  {graph.edges.map((edge) => (
                    <path
                      key={`${edge.from}:${edge.to}`}
                      d={curriculumConnection(graph, edge)
                        .map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`)
                        .join(" ")}
                      markerEnd={`url(#${marker})`}
                    />
                  ))}
                </svg>
                {graph.nodes.map((node) => {
                  const module = plan.modules.find(
                      (m) => m.id === node.milestone.id
                    )!,
                    done = count(module.id);
                  return (
                    <button
                      key={module.id}
                      className={`curriculum-map-node ${
                        module.id === currentModule.id ? "is-current" : ""
                      }`}
                      style={{
                        left: node.x,
                        top: node.y,
                        width: node.width,
                        height: node.height,
                      }}
                      aria-pressed={module.id === selected.id}
                      aria-label={`Preview module ${node.index + 1}: ${
                        module.title
                      }. ${done} of ${
                        module.units.length
                      } outcomes demonstrated.${
                        module.id === currentModule.id ? " Current module." : ""
                      }`}
                      onClick={() => select(module.id)}
                    >
                      <small>
                        {done === module.units.length ? (
                          <Check size={11} />
                        ) : module.id === currentModule.id ? (
                          <span>●</span>
                        ) : (
                          <span>○</span>
                        )}
                        {done === module.units.length
                          ? "Demonstrated"
                          : module.id === currentModule.id
                          ? "Current"
                          : "Preview available"}
                      </small>
                      <strong>
                        <span className="curriculum-module-index">
                          {String(node.index + 1).padStart(2, "0")}
                        </span>
                        {module.title}
                      </strong>
                      <small>
                        {done} / {module.units.length} outcomes
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <ol className="curriculum-outline">
              {plan.modules.map((module, index) => (
                <li key={module.id}>
                  <button
                    aria-pressed={module.id === selected.id}
                    aria-label={`Preview module ${index + 1}: ${
                      module.title
                    }. ${count(module.id)} of ${
                      module.units.length
                    } outcomes demonstrated.${
                      module.id === currentModule.id ? " Current module." : ""
                    }`}
                    onClick={() => select(module.id)}
                  >
                    <span className="curriculum-unit-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{module.title}</strong>
                      <small>{module.outcome}</small>
                    </span>
                    <small>
                      {count(module.id)}/{module.units.length}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="curriculum-map-note">
            Arrows show prerequisites. The outline names the same requirements
            in each unit’s details.
          </p>
        </section>
        <aside
          className="curriculum-inspector"
          ref={inspector}
          aria-label="Selected module"
        >
          <span className="curriculum-eyebrow">
            {selected.id === currentModule.id
              ? "Current module"
              : "Previewing module"}
          </span>
          <h2 tabIndex={-1}>{selected.title}</h2>
          <p>{selected.outcome}</p>
          <h3>Outcomes</h3>
          <ol>
            {selected.units.map((u) => {
              const m = milestoneForUnit(track, milestones, u.id),
                done = m && approved.has(m.id);
              return (
                <li key={u.id}>
                  <button
                    aria-pressed={u.id === unit.id}
                    onClick={() => {
                      setSelectedUnitId(u.id);
                      requestAnimationFrame(() => {
                        unitHeading.current?.focus({ preventScroll: true });
                        unitHeading.current?.scrollIntoView({
                          block: "nearest",
                        });
                      });
                    }}
                  >
                    <strong>{u.title}</strong>
                    <small>
                      {done
                        ? "Demonstrated"
                        : m &&
                          messages.some(
                            (msg) => msg.check_attempt?.milestoneId === m.id
                          )
                        ? "Practising"
                        : m?.status === "completed"
                        ? "Past work · not rechecked"
                        : "Not checked"}{" "}
                      ·{" "}
                      {!m || m.content_status === "outline"
                        ? "lesson not prepared"
                        : "lesson available"}
                    </small>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="curriculum-unit-detail" aria-live="polite">
            <h3 ref={unitHeading} tabIndex={-1}>
              {unit.title}
            </h3>
            <p>{unit.outcome}</p>
            <h3>Evidence to build</h3>
            <p>{unit.assessment}</p>
            <h3>Before this</h3>
            <p>
              {unit.prerequisiteIds.length
                ? unit.prerequisiteIds
                    .map(
                      (id) =>
                        plan.modules
                          .flatMap((m) => m.units)
                          .find((u) => u.id === id)?.title
                    )
                    .join(" · ")
                : "No prior curriculum units."}
            </p>
            {available ? (
              <button
                className="dialog-primary-button"
                onClick={() => runtime && onSelect(runtime)}
              >
                {approved.has(runtime!.id)
                  ? "Review this unit"
                  : "Learn this unit"}
                <ArrowRight size={14} />
              </button>
            ) : foundation ? (
              <>
                <p className="curriculum-preview-note">
                  Previewing keeps your current task and evidence unchanged.
                </p>
                <button
                  className="dialog-secondary-button"
                  onClick={() => onDiagnostic(foundation)}
                >
                  Try a prerequisite check
                  <ArrowRight size={14} />
                </button>
                <small>
                  Starts with {foundation.title}. Fresh practice and tutor
                  review establish readiness.
                </small>
              </>
            ) : (
              <p>
                Complete the current foundation before starting assessed
                practice here.
              </p>
            )}
          </div>
        </aside>
      </div>
      <details className="curriculum-scope-details">
        <summary>Approved goal and scope</summary>
        <p>Original goal: {plan.originalGoal}</p>
        <p>Starting point: {plan.startingPoint}</p>
        {plan.exclusions.length > 0 && (
          <ul>
            {plan.exclusions.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        )}
        <p>
          The route can adapt to your answers. These approved outcomes stay on
          your path.
        </p>
      </details>
      <button className="check-coach-button" onClick={onResume}>
        <ArrowLeft size={13} /> Return to learning session
      </button>
    </section>
  );
}
