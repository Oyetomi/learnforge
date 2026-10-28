import type { Milestone, PlacementAttempt } from "../../types";
import type { CourseTrack } from "../ai/types";
import { gradeLearningCheck } from "./checks";
import { isLessonUnlocked } from "./adaptation";

export function recordPlacementAttempt(
  milestoneId: string,
  check: PlacementAttempt["check"],
  selectedIds: string[],
  confidence: PlacementAttempt["confidence"],
  dontKnow = false
): PlacementAttempt {
  return {
    milestoneId,
    check: structuredClone(check),
    selectedIds: dontKnow ? [] : [...new Set(selectedIds)],
    dontKnow,
    confidence,
    correct: gradeLearningCheck(check, selectedIds, dontKnow),
    helpUsed: [],
    submittedAt: Date.now(),
  };
}

/** Revisiting an area replaces its recommendation, never accumulates a stale pass. */
export function replacePlacementAttempt(
  attempts: PlacementAttempt[],
  next: PlacementAttempt
): PlacementAttempt[] {
  return [...attempts.filter((a) => a.milestoneId !== next.milestoneId), next];
}

export function approveLearningPlan(
  track: CourseTrack,
  attempts: PlacementAttempt[],
  deferredIds: Set<string>
): CourseTrack {
  const ids = new Set(track.milestones.map((m) => m.id));
  const deferred = new Set([...deferredIds].filter((id) => ids.has(id)));
  const latest = new Map<string, PlacementAttempt>();
  for (const attempt of attempts) {
    const milestone = track.milestones.find((m) => m.id === attempt.milestoneId);
    if (!milestone?.check) continue;
    // Never trust a caller's "correct" flag or carry evidence from a revised check.
    if (JSON.stringify(milestone.check) !== JSON.stringify(attempt.check)) continue;
    latest.set(attempt.milestoneId, {
      ...attempt,
      correct: gradeLearningCheck(milestone.check, attempt.selectedIds, attempt.dontKnow),
    });
  }
  const gap = track.milestones.find((m) => {
    const a = latest.get(m.id);
    return !deferred.has(m.id) && a && (!a.correct || a.confidence === "unsure");
  });
  const parentsOf = (id: string): string[] => {
    const index = track.milestones.findIndex((m) => m.id === id);
    const milestone = track.milestones[index];
    return milestone?.prerequisite_ids ?? (index > 0 ? [track.milestones[index - 1].id] : []);
  };
  const roots = track.milestones.filter((m) => parentsOf(m.id).length === 0);
  const ancestors = new Set<string>();
  const visit = (id: string) => {
    if (ancestors.has(id)) return;
    ancestors.add(id);
    parentsOf(id).forEach(visit);
  };
  if (gap) visit(gap.id);
  // Even a correct probe cannot approve a prerequisite. Start on an available root.
  const start = roots.find((m) => ancestors.has(m.id)) ||
    roots.find((m) => !deferred.has(m.id)) || roots[0] || track.milestones[0];
  if (!start) throw new Error("A learning plan needs at least one concept.");
  const reason = gap && gap.id !== start.id
    ? `Start with ${start.title} before working toward ${gap.title}. We’ll check this foundation with a fresh example.`
    : latest.get(start.id)?.correct
    ? `Start with ${start.title} and try a fresh example. One correct placement answer suggests familiarity; it doesn’t establish readiness.`
    : `Start with ${start.title}. We’ll take one small step and adjust from your answers.`;
  return {
    ...track,
    // No filtering, reordering, prerequisite removal, or completed statuses.
    placement: {
      attempts: [...latest.values()],
      deferredMilestoneIds: [...deferred],
      startMilestoneId: start.id,
      reason,
      approvedAt: Date.now(),
    },
  };
}

/** Used when seeding the approved plan, including its selected independent root. */
export function plannedMilestoneFields(track: CourseTrack, templateId: string) {
  const attempt = track.placement?.attempts.find((a) => a.milestoneId === templateId);
  const startId = track.placement?.startMilestoneId || track.milestones[0]?.id;
  return {
    status: (templateId === startId ? "active" : "pending") as Milestone["status"],
    deferred: track.placement?.deferredMilestoneIds.includes(templateId) || false,
    placement_attempt: attempt,
    // The placement question was already seen; it cannot become a fresh mastery check.
    check: attempt ? undefined : track.milestones.find((m) => m.id === templateId)?.check,
  };
}

export function nextLearningMilestone(
  milestones: Milestone[],
  currentId: string,
  approved: Set<string>
): Milestone | undefined {
  const available = milestones.filter((m) => m.id !== currentId &&
    m.status !== "completed" && isLessonUnlocked(m, milestones, approved));
  return available.find((m) => !m.deferred) || available[0];
}
