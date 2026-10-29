import type {
  ChatMessage,
  CompetencyAssessment,
  LearningCheckSpec,
  Milestone,
} from '../../types';
import {
  extractLearningCheck,
  learningEvidence,
  validateLearningCheck,
} from './checks';
import { roadmapEdges } from './roadmap';

export interface RepairProposal {
  beforeMilestoneId: string;
  triggerCheckId: string;
  title: string;
  reason: string;
  lesson: string;
  check: LearningCheckSpec;
}
function block(content: string, name: string): unknown {
  const found = new RegExp(
    '^[ \\t]*```' + name + '[^\\r\\n]*\\r?\\n([\\s\\S]*?)^[ \\t]*```[ \\t]*$',
    'im'
  ).exec(content);
  if (!found) return null;
  try {
    return JSON.parse(found[1]);
  } catch {
    return null;
  }
}
export function extractAssessment(
  content: string
): Omit<CompetencyAssessment, 'milestoneId' | 'createdAt'> | null {
  const value = block(content, 'forge-assessment') as any;
  return value &&
    ['ready', 'practice'].includes(value.decision) &&
    typeof value.rationale === 'string' &&
    value.rationale.trim() &&
    Array.isArray(value.evidenceCheckIds) &&
    value.evidenceCheckIds.every((id: unknown) => typeof id === 'string')
    ? {
        decision: value.decision,
        rationale: value.rationale.trim(),
        evidenceCheckIds: [...new Set(value.evidenceCheckIds)] as string[],
      }
    : null;
}
export function acceptsReadiness(
  messages: ChatMessage[],
  milestoneId: string,
  review: Omit<CompetencyAssessment, 'milestoneId' | 'createdAt'>
): boolean {
  const evidence = learningEvidence(messages, milestoneId);
  const eligible = new Set(
    messages.flatMap((message) => {
      const a = message.check_attempt;
      return a?.milestoneId === milestoneId &&
        a.correct &&
        a.grading?.status !== 'uncertain' && !a.grading?.reviewRequested &&
        !a.assisted &&
        a.confidence !== 'unsure'
        ? [a.checkId]
        : [];
    })
  );
  return (
    review.decision === 'ready' &&
    evidence.readyToAdvance &&
    new Set(review.evidenceCheckIds).size >= 2 &&
    review.evidenceCheckIds.every((id) => eligible.has(id))
  );
}
export function approvedLessonIds(messages: ChatMessage[]): Set<string> {
  const approved = new Set<string>();
  for (const message of messages) {
    const review = message.competency_assessment;
    if (!review || !acceptsReadiness(messages, review.milestoneId, review))
      continue;
    const last = messages
      .filter((m) => m.check_attempt?.milestoneId === review.milestoneId)
      .slice(-1)[0]?.check_attempt;
    if (last && last.submittedAt <= review.createdAt)
      approved.add(review.milestoneId);
  }
  return approved;
}
export function isLessonUnlocked(
  milestone: Milestone,
  milestones: Milestone[],
  approved: Set<string>
): boolean {
  if (milestone.status === 'completed') return true; // Existing work remains reviewable; it does not approve its dependents.
  const parents = roadmapEdges(milestones)
    .filter((edge) => edge.to === milestone.id)
    .map((edge) => edge.from);
  return parents.every((id) => approved.has(id));
}
export function extractRepair(
  content: string,
  messages: ChatMessage[],
  current: Milestone,
  milestones: Milestone[]
): RepairProposal | null {
  if (
    extractLearningCheck(content).hasBlock ||
    extractAssessment(content)?.decision === 'ready'
  )
    return null;
  const value = block(content, 'forge-repair') as any;
  if (
    !value ||
    value.beforeMilestoneId !== current.id ||
    typeof value.triggerCheckId !== 'string'
  )
    return null;
  const last = messages
    .filter((message) => message.check_attempt?.milestoneId === current.id)
    .slice(-1)[0]?.check_attempt;
  if (
    !last ||
    last.checkId !== value.triggerCheckId ||
    (last.correct && last.confidence !== 'unsure') ||
    current.adaptive ||
    milestones.some(m => m.adaptive && m.status !== 'completed') ||
    milestones.filter(m => m.adaptive && m.return_to_milestone_id === current.id).length >= 2 ||
    milestones.filter((m) => m.adaptive).length >= 6
  )
    return null;
  if (
    ['title', 'reason', 'lesson'].some(
      (key) => typeof value[key] !== 'string' || !value[key].trim()
    )
  )
    return null;
  const check = validateLearningCheck(value.check);
  if (
    !check ||
    milestones.some(
      (m) =>
        m.adaptive &&
        m.return_to_milestone_id === current.id &&
        m.title === value.title.trim()
    )
  )
    return null;
  return {
    beforeMilestoneId: current.id,
    triggerCheckId: value.triggerCheckId,
    title: value.title.trim(),
    reason: value.reason.trim(),
    lesson: value.lesson.trim(),
    check,
  };
}
