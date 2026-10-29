import type { CheckAttempt, FSRSRating, LearningCheck, LearningSession, Milestone, SRSCard } from "../../types";
import { aiJsonRequest, loadAIConnection, recordUsage } from "../ai/connection";
import { validateLearningCheck, gradeLearningCheck } from "./checks";
import { isAcceptedFreeResponseGrade, FREE_RESPONSE_INSTRUCTIONS } from "./freeResponse";
import { GROUNDING_INSTRUCTIONS, referenceContext } from "./grounding";

export function eligibleRetentionCards(cards: SRSCard[], session: LearningSession, milestones: Milestone[], now = Date.now()): SRSCard[] {
  return cards.filter((card) => card.session_id === session.id && card.milestone_id && milestones.some((m) => m.id === card.milestone_id) &&
    card.due_date <= now && now - (card.created_at ?? session.created_at) >= 20 * 60 * 60 * 1000)
    .sort((a, b) => a.due_date - b.due_date);
}

export function retentionRating(check: LearningCheck, attempt: CheckAttempt): FSRSRating | null {
  if (attempt.checkId !== check.id || attempt.milestoneId !== check.milestoneId) return null;
  if (attempt.dontKnow) return 1;
  if (attempt.grading?.status === "uncertain" || attempt.grading?.reviewRequested) return null;
  const correct = check.kind === "free-response" ? !!attempt.response?.trim() && isAcceptedFreeResponseGrade(check, attempt.grading)
    : gradeLearningCheck(check, attempt.selectedIds, attempt.dontKnow);
  if (attempt.dontKnow || !correct) return 1;
  return attempt.assisted || attempt.confidence === "unsure" ? 2 : 3;
}

export async function createRetentionCheck(card: SRSCard, milestone: Milestone, signal: AbortSignal, repair = false): Promise<LearningCheck> {
  const response = await aiJsonRequest({ model: loadAIConnection().model, temperature: 0.3, response_format: { type: "json_object" },
    messages: [{ role: "system", content: `Create ONE short retrieval activity for the learner's original goal. Use a new practical case, not the old question with its nouns replaced. Do not reveal the solution before submission. No readiness assessment and no roadmap changes. Return a single check JSON object. ${FREE_RESPONSE_INSTRUCTIONS} ${GROUNDING_INSTRUCTIONS} ${repair ? "This is supported repair: give one tiny analogous example in context and ask a simpler application. No lecture." : "Prefer a small written explanation, with no answer choices or worked answer visible."}` },
      { role: "user", content: JSON.stringify({ goal: milestone.learning_intent, concept: milestone.title,
        earlierQuestion: card.prompt, expectedConcept: card.answer, referenceExcerpts: referenceContext(milestone.references, milestone.title) }) }] }, { signal });
  if (!response.ok) throw new Error("Couldn’t prepare a revisit. Your current lesson is unchanged.");
  const envelope = await response.json(); recordUsage(envelope?.usage);
  let check = null;
  try { check = validateLearningCheck(JSON.parse(String(envelope?.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*|\s*```$/g, ""))); } catch {}
  if (!check || check.question.trim() === card.prompt.trim()) throw new Error("A fresh revisit wasn’t ready. Try again or return to your lesson.");
  return { ...check, id: `revisit-${card.id}-${Date.now()}`, milestoneId: milestone.id };
}
