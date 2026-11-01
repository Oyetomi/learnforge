import type { ChatMessage, LearningPractice } from "../../types";
import { isIndependentAttempt, learningEvidence } from "./checks";

/** A teaching strategy, not a learner type, global level, or mastery award. */
export const ADAPTIVE_TEACHING_INSTRUCTIONS = `ADAPTIVE TEACHING
Choose guidance separately for the current concept from recorded work, not a fixed personality or a global beginner/expert label. A stated level is only a starting assumption.
- Demonstrate when the idea is new or unclear: explain in plain language, show one complete small worked example, and explain the causal steps. Do not make a novice guess facts they have not been taught or answer confusion with an endless chain of questions.
- Guide after difficulty: follow the worked explanation with a smaller, different case. Supply an initial step or useful cue and ask the learner to complete ONE remaining decision. This is supported practice, not independent evidence. Never solve that remaining decision in the introduction.
- Fade support after supported success: use a fresh case at the same difficulty without the cue. Do not keep repeating a full demonstration when the learner can apply the idea.
- Test transfer after independent success: change a relevant condition or context and ask the learner to apply the same principle. Merely changing names, numbers, or option order is not evidence of transfer. Do not add a new prerequisite or unrelated difficulty just to make a task harder.
Socratic questions deepen reasoning when the learner has enough foundation; explanations, worked examples and direct answers remain available. If their reasoning is missing, ask for it rather than infer it from a selected option. A correct answer with flawed reasoning needs correction.
Compare two approaches when their difference teaches the current idea. Label an alternative as an example, never as another learner's work. Use the existing paper figures, manipulable models, tables, math, sources or code only when they clarify the actual subject. Keep the example, its visual and explanation together. Preserve the original goal and language; do not substitute programming for another subject.
After feedback, pause for the learner. Reading, imitation, supported practice and model-generated stage labels never confer mastery. Keep answer keys private until submission. Honour the dedicated teaching-only and help-only turn boundaries; do not append another assessment when those turns forbid it.`;

export interface TeachingPlan {
  stage: "learn" | "guided" | "independent" | "transfer" | "review" | "clarify";
  practice: LearningPractice;
  label: string;
  reason: string;
  instruction: string;
  allowRepair: boolean;
}

export function nextTeachingStep(messages: ChatMessage[], milestoneId: string): TeachingPlan {
  const last = messages.filter(m => m.check_attempt?.milestoneId === milestoneId).slice(-1)[0]?.check_attempt;
  const base = { allowRepair: false };
  if (!last) return { ...base, stage: "learn", practice: "independent", label: "Try it yourself",
    reason: "Start with one clear example, then try a small application.",
    instruction: "Introduce one concrete idea with a complete small worked example and explain its steps before a different applied check. Do not expose the check's answer in the example." };
  if (last.grading?.reviewRequested || (last.grading?.status === "uncertain" && !last.dontKnow)) {
    return { ...base, stage: "clarify", practice: "independent", label: "Try a clearer case",
      reason: "The feedback is unresolved. A clearer case can help us check the idea fairly.",
      instruction: "The judgment is unresolved or disputed. Do not infer a misconception, readiness or a missing prerequisite from it. Ask one fresh, smaller, unambiguous applied check addressing the learner's concern. Do not repeat or defend the disputed key." };
  }
  if (last.dontKnow || !last.correct) return { ...base, stage: "guided", practice: "guided", label: "Try a guided step",
    reason: "We'll make the next case smaller and work through one decision at a time.",
    allowRepair: !last.dontKnow && !!(last.thinking.trim() || last.response?.trim()),
    instruction: "The learner has just reviewed a worked explanation after difficulty. Use ONE smaller, different example with an initial step or cue, then ask them to complete one remaining decision in a forge-check block. Put the example and cue in check.context so they remain visible beside the question. Define needed words, keep the assessment's answer hidden, and do not repeat the same solved case. This guided task is supported practice. Only consider a prerequisite if their actual written reasoning demonstrates that specific gap; otherwise stay on this concept." };
  if (!isIndependentAttempt(last, messages)) return { ...base, stage: "independent", practice: "independent", label: "Try it without the cue",
    reason: "Try a fresh case at the same difficulty, with help available if you need it.",
    instruction: "The learner succeeded with support or uncertainty. Fade the cue in ONE fresh case at the same conceptual difficulty. Keep the example self-contained, but do not demonstrate its solution or add a visual that solves it. Ask for a brief explanation where appropriate; do not infer reasoning from an option. Help remains available and using it marks supported practice." };
  if (learningEvidence(messages, milestoneId).readyToAdvance) return { ...base, stage: "review", practice: "transfer", label: "Review readiness",
    reason: "We'll review your independent applications and reasoning before moving on.",
    instruction: "Review readiness from the actual independent applications, changed-situation evidence, reasoning, confidence, and prior mistakes. Emit forge-assessment with actual eligible evidenceCheckIds and decision ready or practice. Include the independent transfer check when one is recorded. A count or a transfer label alone is insufficient: check that the task really changed a relevant condition and the reasoning supports the principle. If ready, recap without another check. If practice, explain the specific uncertainty and ask one fresh application that addresses it. Never declare mastery." };
  return { ...base, stage: "transfer", practice: "transfer", label: "Try a new situation",
    reason: "You've applied the idea independently. Next, see what changes in a different situation.",
    instruction: "Ask ONE fresh application that changes a relevant condition or context while testing the SAME principle. Do not merely rename variables, shuffle choices or substitute numbers in the solved example. Keep difficulty close to the learner's demonstrated understanding; do not add unrelated concepts. Ask for reasoning or prediction, without teaching the answer first. Use a choice or free-response check appropriate to the subject; do not force code. This is a transfer opportunity, not proof of transfer or mastery." };
}

export function teachingContinuationPrompt(plan: TeachingPlan): string {
  return `The learner reviewed the post-answer teaching and explicitly chose the next activity. ${plan.instruction}
Do not repeat the worked explanation they just read. Keep pre-question prose concise and keep answer keys and explanations inside the question block until submission. Do not emit a visual that gives away an independent question. Reading a teaching turn provides no new competency evidence.`;
}

export function practiceLabel(practice?: LearningPractice, supported = false): string {
  return practice === "guided" ? "Guided practice" : supported ? "Supported practice"
    : practice === "transfer" ? "New situation" : "Independent practice";
}
