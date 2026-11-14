import type {
  ChatMessage,
  LearningCheck,
  LearningPractice,
  Milestone,
  SupportedLanguage,
} from "../../types";
import { extractCleanResponse } from "../ai/parser";
import {
  extractVisualExample,
  hideCustomCanvasBlocks,
  visualForScientificPresentation,
  visualForSubject,
} from "./visuals";
import { acceptsReadiness, extractAssessment, extractRepair } from "./adaptation";
import { extractLearningCheck } from "./checks";
import { nextTeachingStep } from "./teaching";

/** How the turn was requested; each flag narrows what a reply may contain. */
export interface ReplyRequest {
  independent?: boolean;
  answerTutoringFor?: string;
  scientificFigure?: boolean;
  teachOnly?: boolean;
  visual?: boolean;
  practice?: LearningPractice;
}

export interface ReplyContext {
  activeMilestone: Milestone | null;
  milestones: Milestone[];
  /** The conversation including the learner turn this reply answers. */
  history: ChatMessage[];
  language: SupportedLanguage | null | undefined;
  /** The roadmap planner already decided to stay on this concept. */
  plannerDecidedStay: boolean;
  now?: number;
  newCheckId?: () => string;
}

/**
 * Turn a finished model reply into the structured pieces the session stores:
 * the visible text, an optional question, visual, readiness review, repair
 * proposal or coding challenge. Pure: saving and navigation stay with the caller.
 */
export function interpretAssistantReply(fullText: string, request: ReplyRequest, context: ReplyContext) {
  const { activeMilestone, milestones, history, language, plannerDecidedStay } = context;
  const now = context.now ?? Date.now();
  const { challenge, conversationalText, hasChallenge } = extractCleanResponse(fullText);

  const candidateVisual =
    request.independent || request.answerTutoringFor
      ? null
      : visualForSubject(extractVisualExample(conversationalText), language ?? null);
  const visual = request.scientificFigure
    ? visualForScientificPresentation(candidateVisual)
    : candidateVisual;

  const review = request.teachOnly ? null : extractAssessment(conversationalText);
  const acceptedReview =
    review &&
    activeMilestone &&
    (review.decision === "practice" || acceptsReadiness(history, activeMilestone.id, review))
      ? { ...review, milestoneId: activeMilestone.id, createdAt: now }
      : undefined;

  const repairProposal =
    activeMilestone && !request.teachOnly && !plannerDecidedStay
      ? extractRepair(conversationalText, history, activeMilestone, milestones)
      : null;

  const checkResult = extractLearningCheck(
    request.scientificFigure ? hideCustomCanvasBlocks(conversationalText) : conversationalText
  );
  const learningCheck: LearningCheck | undefined =
    checkResult.check && activeMilestone && !request.teachOnly
      ? {
          ...checkResult.check,
          id: context.newCheckId?.() ?? `check-${now}-${Math.random().toString(36).slice(2, 7)}`,
          milestoneId: activeMilestone.id,
          practice: request.practice ?? nextTeachingStep(history, activeMilestone.id).practice,
        }
      : undefined;

  const reviewProblem =
    review?.decision === "ready" && !acceptedReview
      ? "\n\nThe readiness evidence could not be verified. The next concept stays in preview."
      : "";
  const visualProblem =
    request.visual && !visual
      ? request.scientificFigure
        ? "\n\nI couldn’t prepare the typeset figure. Please try again."
        : "\n\nI couldn’t prepare the visual example. Try ‘Show me visually’ again, or ask for a plain-language explanation."
      : "";
  const content =
    checkResult.hasBlock && !learningCheck && !request.teachOnly
      ? `${checkResult.text}\n\nThis question could not be displayed. Ask for a new knowledge check.`
      : checkResult.text + reviewProblem + visualProblem;

  return {
    content,
    /** Tutoring that produced no visible text is recorded as a failed generation. */
    generationError: Boolean(request.answerTutoringFor && !checkResult.text.trim()),
    visual: visual || undefined,
    learningCheck,
    acceptedReview,
    repairProposal,
    /** Coding challenges only apply to coding topics and never to teach-only turns. */
    challenge: hasChallenge && challenge && language && !request.teachOnly ? challenge : null,
  };
}

/** Review card for a concept the learner was judged ready on. */
export function readinessCard(milestone: Milestone, check: LearningCheck | null) {
  return {
    prompt: check
      ? [check.context, check.question].filter(Boolean).join("\n\n")
      : `What did you learn about ${milestone.title}?`,
    answer: check
      ? check.expectedAnswer ||
        [
          ...check.options
            .filter((option) => check.correctOptionIds.includes(option.id))
            .map((option) => option.label),
          check.explanation,
        ].join("\n\n")
      : milestone.lesson,
  };
}
