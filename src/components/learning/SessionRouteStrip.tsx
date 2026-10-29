import React from "react";
import { ArrowRight, CheckCircle2, CornerUpLeft, GitBranch } from "lucide-react";
import type { ChatMessage, Milestone } from "../../types";
import { approvedLessonIds } from "../../services/learning/adaptation";
import { cleanMilestoneTitle } from "../milestones/MilestoneSidebar";

interface SessionRouteStripProps {
  milestones?: Milestone[];
  activeMilestone: Milestone | null;
  messages: ChatMessage[];
}

/**
 * Quiet in-session route minimap showing how the active unit connects to its
 * immediate foundation and what it unlocks next (or where an adaptive repair
 * detour returns), without leaving the focused session.
 */
export const SessionRouteStrip: React.FC<SessionRouteStripProps> = ({
  milestones,
  activeMilestone,
  messages,
}) => {
  if (!activeMilestone) return null;

  const list = milestones || [];
  const isAdaptiveRepair = Boolean(activeMilestone.adaptive);

  if (!isAdaptiveRepair && list.length <= 1) return null;

  const approved = approvedLessonIds(messages);
  const byId = new Map(list.map((m) => [m.id, m]));
  const currentIdx = list.findIndex((m) => m.id === activeMilestone.id);

  if (isAdaptiveRepair) {
    const returnTarget = activeMilestone.return_to_milestone_id
      ? byId.get(activeMilestone.return_to_milestone_id)
      : list[currentIdx + 1];
    return (
      <nav className="session-route-strip is-repair" aria-label="Lesson route">
        <span className="route-node is-repair-badge">
          <GitBranch size={12} aria-hidden="true" />
          Repair detour
        </span>
        <span className="route-node is-current" aria-current="step">
          {cleanMilestoneTitle(activeMilestone.title)}
        </span>
        {returnTarget && (
          <>
            <ArrowRight size={11} className="route-arrow" aria-hidden="true" />
            <span className="route-node is-return">
              <CornerUpLeft size={11} aria-hidden="true" />
              Returns to {cleanMilestoneTitle(returnTarget.title)}
            </span>
          </>
        )}
      </nav>
    );
  }

  const explicitPrereqs = (activeMilestone.prerequisite_ids || [])
    .map((id) => byId.get(id))
    .filter((m): m is Milestone => Boolean(m));
  const foundation =
    explicitPrereqs.length > 0
      ? explicitPrereqs[explicitPrereqs.length - 1]
      : currentIdx > 0
      ? list[currentIdx - 1]
      : null;

  const explicitDependents = list.filter((m) =>
    m.prerequisite_ids?.includes(activeMilestone.id)
  );
  const unlocks =
    explicitDependents.length > 0
      ? explicitDependents[0]
      : currentIdx >= 0 && currentIdx < list.length - 1
      ? list[currentIdx + 1]
      : null;

  const foundationDone = foundation
    ? approved.has(foundation.id) || foundation.status === "completed"
    : false;

  return (
    <nav className="session-route-strip" aria-label="Lesson route">
      {foundation ? (
        <>
          <span
            className={`route-node is-foundation ${
              foundationDone ? "is-done" : ""
            }`}
            title={`Foundation: ${cleanMilestoneTitle(foundation.title)}`}
          >
            {foundationDone && (
              <CheckCircle2 size={11} aria-hidden="true" />
            )}
            <span>{cleanMilestoneTitle(foundation.title)}</span>
          </span>
          <ArrowRight size={11} className="route-arrow" aria-hidden="true" />
        </>
      ) : null}

      <span className="route-node is-current" aria-current="step">
        <strong>{cleanMilestoneTitle(activeMilestone.title)}</strong>
        {currentIdx >= 0 && (
          <small>
            {currentIdx + 1}/{list.length}
          </small>
        )}
      </span>

      {unlocks ? (
        <>
          <ArrowRight size={11} className="route-arrow" aria-hidden="true" />
          <span
            className="route-node is-next"
            title={`Unlocks next: ${cleanMilestoneTitle(unlocks.title)}`}
          >
            <span>{cleanMilestoneTitle(unlocks.title)}</span>
            {explicitDependents.length > 1 && (
              <small>+{explicitDependents.length - 1}</small>
            )}
          </span>
        </>
      ) : null}
    </nav>
  );
};
