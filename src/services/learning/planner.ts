import { aiJsonRequest, loadAIConnection, recordUsage } from "../ai/connection";
import type { ChatMessage, LearningCheck, Milestone } from "../../types";
import { extractRepair, type RepairProposal } from "./adaptation";
import { referenceContext, GROUNDING_INSTRUCTIONS } from "./grounding";

/** An explicit planning decision precedes teaching after a gap; it is not a decorative diagram prompt. */
export async function planAdaptiveRepair(
  current: Milestone,
  currentCheck: LearningCheck | null,
  messages: ChatMessage[],
  milestones: Milestone[],
  signal: AbortSignal
): Promise<RepairProposal | null> {
  const last = messages
    .filter((message) => message.check_attempt?.milestoneId === current.id)
    .slice(-1)[0]?.check_attempt;
  if (current.adaptive || milestones.some(m=>m.adaptive&&m.status!=='completed') ||
      milestones.filter(m=>m.adaptive&&m.return_to_milestone_id===current.id).length>=2) return null;
  if (!last || last.grading?.status === "uncertain" || (last.correct && last.confidence !== "unsure")) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 20_000);
  try {
    const response = await aiJsonRequest({
        model: loadAIConnection().model,
        response_format: { type: "json_object" },
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content: `You plan a learner's next step in their actual subject from evidence. Preserve their original interest, practical purpose, and level. A language learner needs communication practice, not speech technology or software. Only use coding when the saved intent allows it. Decide explicitly whether their latest attempt exposes a missing prerequisite outside the current concept or a mistake to repair within it. Choose a smaller step within the subject they asked to learn, not an adjacent discipline. Do not add a generic beginner lesson, duplicate an existing repair, or invent a gap without evidence. Uncertainty alone does not prove a specific misconception. If the learner only says they do not know, stay and ask a simpler diagnostic choice. Return JSON only. For an in-concept error return {"action":"stay","reason":"specific diagnosis"}. For a missing prerequisite return {"action":"add_prerequisite","title":"short specific concept","reason":"One plain second-person sentence in at most 20 words about what this smaller step will help you do; no diagnosis or unexplained terms","lesson":"Teach ONE distinction in everyday words with one tiny concrete example, at most 4–6 code lines in a fenced block if useful. Define unfamiliar words. Do not describe runtime internals or formal rules before their prerequisites. Stop for the check instead of writing a lecture","check":{"question":"One easy prediction about the tiny example, phrased plainly. Put substantial code in context, never inline in the question","options":[{"id":"a","label":"plausible claim"},{"id":"b","label":"plausible claim"}],"correctOptionIds":["a"],"multiple":false,"explanation":"reasoning"}}. The application supplies trusted milestone/check ids. Keep prose concise and the check answer hidden from its question.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              learningIntent: current.learning_intent,
              referencePolicy: GROUNDING_INSTRUCTIONS,
              referenceExcerpts: referenceContext(current.references, current.title),
              current: {
                id: current.id,
                title: current.title,
                goal: current.prompt,
              },
              question: currentCheck,
              latestAttempt: last,
              recentAttempts: messages
                .filter((m) => m.check_attempt)
                .slice(-5)
                .map((m) => m.check_attempt),
              roadmap: milestones.map((m) => ({
                id: m.id,
                title: m.title,
                reason: m.adaptation_reason,
                returnTo: m.return_to_milestone_id,
              })),
            }),
          },
        ],
      }, { signal: controller.signal });
    if (!response.ok)
      throw new Error(`Planning service returned ${response.status}`);
    const envelope = await response.json();
    recordUsage(envelope?.usage);
    const raw = envelope.choices?.[0]?.message?.content;
    const decision = JSON.parse(
      typeof raw === "string"
        ? raw.replace(/^```(?:json)?\s*|\s*```$/g, "")
        : "{}"
    );
    if (decision.action !== "add_prerequisite") return null;
    return extractRepair(
      "```forge-repair\n" +
        JSON.stringify({
          ...decision,
          beforeMilestoneId: current.id,
          triggerCheckId: last.checkId,
        }) +
        "\n```",
      messages,
      current,
      milestones
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
