import type {
  ChatMessage,
  CheckAttempt,
  LearningCheck,
  LearningReference,
  Milestone,
} from "../../types";
import { aiJsonRequest, loadAIConnection, recordUsage } from "../ai/connection";
import { parseChatJson } from "../ai/structuredResponse";
import { GROUNDING_INSTRUCTIONS } from "./grounding";
import { gradeLearningCheck, validateLearningCheck } from "./checks";
import { hasQuestionReview } from "./questionReview";
import { isAcceptedFreeResponseGrade } from "./freeResponse";
import { nextTeachingStep } from "./teaching";
import { answerTutoringPrompt } from "./tutoring";
import { PRACTICE_QUESTION_CONTRACT } from "./knowledgePractice";
import { MATH_INSTRUCTIONS, TABLE_INSTRUCTIONS } from "./visualContract";
import { READING_BOUNDARY } from "./readingBoundary";
import type { ReadingRound, ReadingStop } from "./readingStore";
import type { PdfSection } from "./pdfContents";

export function nextReadingSection(
  stop: ReadingStop,
  sections: PdfSection[],
  pageCount: number
) {
  if (stop.range.to >= pageCount) return null;
  const from = stop.range.to + 1;
  const section = sections
    .filter(
      (s) =>
        s.pageStart && s.pageStart <= from && s.pageEnd && s.pageEnd >= from
    )
    .sort((a, b) => b.level - a.level || b.pageStart! - a.pageStart!)[0];
  const plan = readingPlan(stop);
  return {
    from,
    to:
      plan.stage === "transfer" || plan.stage === "review"
        ? section?.pageEnd || from
        : from,
    title: section?.title,
    advice:
      plan.stage === "guided"
        ? `It may help to revisit PDF ${stop.range.from}–${stop.range.to} and try the smaller example before reading on.`
        : plan.stage === "independent"
        ? "Try the idea once without the cue, or read a short passage before your next pause."
        : "You can read the next section and pause at its next idea. Another application is available if you want it.",
  };
}

export function readingReferences(stop: ReadingStop): LearningReference[] {
  return stop.range.pages
    .filter((p) => p.text.trim())
    .map((p) => ({
      id: `${stop.id}:page-${p.number}`,
      name: `PDF page ${p.number}${
        p.label && p.label !== String(p.number) ? ` (printed ${p.label})` : ""
      }`,
      content: p.text,
      truncated: false,
      pdfPageStart: p.number,
      pdfPageEnd: p.number,
    }));
}
export function readingMilestone(stop: ReadingStop): Milestone {
  return {
    id: stop.id,
    session_id: stop.id,
    title: `PDF pages ${stop.range.from}–${stop.range.to}`,
    prompt: "Help me understand only the pages I have read.",
    reading_context: { from: stop.range.from, to: stop.range.to },
    references: readingReferences(stop),
    starter_code: "",
    status: "active",
    created_at: 0,
  };
}
export function readingPlan(stop: ReadingStop) {
  const messages: ChatMessage[] = stop.rounds.flatMap((r, i) => [
    {
      id: `${i}:q`,
      session_id: stop.id,
      milestone_id: stop.id,
      role: "assistant" as const,
      content: "",
      learning_check: r.check,
      created_at: i * 2,
    },
    ...(r.attempt
      ? [
          {
            id: `${i}:a`,
            session_id: stop.id,
            milestone_id: stop.id,
            role: "user" as const,
            content: "",
            check_attempt: r.attempt,
            created_at: i * 2 + 1,
          },
        ]
      : []),
  ]);
  return nextTeachingStep(messages, stop.id);
}
export function acceptReadingAttempt(
  stop: ReadingStop,
  round: ReadingRound,
  attempt: CheckAttempt
): CheckAttempt {
  if (
    round.attempt ||
    attempt.checkId !== round.check.id ||
    attempt.milestoneId !== stop.id ||
    !hasQuestionReview(round.check, attempt, readingReferences(stop))
  )
    throw new Error(
      "This answer no longer matches the reviewed question. Your draft is unchanged."
    );
  const correct =
    !attempt.dontKnow &&
    (round.check.kind === "free-response"
      ? !!attempt.response?.trim() &&
        isAcceptedFreeResponseGrade(round.check, attempt.grading)
      : gradeLearningCheck(round.check, attempt.selectedIds, attempt.dontKnow));
  return {
    ...attempt,
    correct,
    practice: round.check.practice,
    assisted:
      attempt.assisted ||
      round.supported ||
      round.bookOpen ||
      round.check.practice === "guided" ||
      undefined,
  };
}
export function readingRequest(
  stop: ReadingStop,
  operation: "question" | "tutoring" | "ask",
  round?: ReadingRound,
  question?: string
) {
  const plan = readingPlan(stop);
  const task =
    operation === "question"
      ? `Ask one short check on the covered reading. Start with retrieval or an application, never a lecture or the answer. ${
          stop.rounds.length
            ? plan.stage === "review"
              ? "Offer another optional application of the same idea; do not assess curriculum readiness."
              : plan.instruction
            : "The learner has just read this passage. Ask one answerable question to find out what they understood."
        } ${PRACTICE_QUESTION_CONTRACT}`
      : operation === "tutoring" && round?.attempt
      ? `${answerTutoringPrompt(
          round.check,
          round.attempt
        )} Return JSON {"explanation":"Markdown tutoring"}.`
      : `Answer the learner's side question in plain language. Preserve the pending check and do not reveal its answer; use a smaller analogous example when needed. Do not start a new lesson or question. Return JSON {"explanation":"a concise explanation"}.`;
  return [
    {
      role: "system",
      content: `${READING_BOUNDARY}\n${GROUNDING_INSTRUCTIONS}\n${MATH_INSTRUCTIONS}\n${TABLE_INSTRUCTIONS}\n${task}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        operation: `reading-${operation}`,
        coveredPdfPages: { from: stop.range.from, to: stop.range.to },
        sourcePages: stop.range.pages,
        previousWork:
          operation === "question"
            ? stop.rounds.map((r) => ({
                question: r.check.question,
                response: r.attempt?.response,
                selectedAnswers: r.check.options
                  .filter((o) => r.attempt?.selectedIds.includes(o.id))
                  .map((o) => o.label),
                thinking: r.attempt?.thinking,
                correct: r.attempt?.correct,
                supported: r.attempt?.assisted,
              }))
            : undefined,
        pendingQuestion:
          operation === "ask" && round && !round.attempt
            ? { question: round.check.question, context: round.check.context }
            : undefined,
        question,
      }),
    },
  ];
}
async function request(
  stop: ReadingStop,
  operation: "question" | "tutoring" | "ask",
  signal: AbortSignal,
  round?: ReadingRound,
  question?: string
) {
  const response = await aiJsonRequest(
    {
      model: loadAIConnection().model,
      temperature: 0.2,
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: readingRequest(stop, operation, round, question),
    },
    { signal }
  );
  if (!response.ok)
    throw new Error(
      "The reading tutor couldn’t finish this request. Your place and submitted answer are saved. Try again."
    );
  const envelope = await response.json();
  recordUsage(envelope.usage);
  return parseChatJson(envelope, ["json", "forge-check"]) as Record<
    string,
    unknown
  >;
}
export async function generateReadingQuestion(
  stop: ReadingStop,
  signal: AbortSignal
): Promise<LearningCheck> {
  const spec = validateLearningCheck(await request(stop, "question", signal));
  if (!spec || stop.rounds.some((r) => r.check.question === spec.question))
    throw new Error(
      "A fresh question wasn’t ready. Your reading stop is saved; try again."
    );
  return {
    ...spec,
    id: `${stop.id}:${crypto.randomUUID()}`,
    milestoneId: stop.id,
    practice: stop.rounds.length ? readingPlan(stop).practice : "independent",
  };
}
export async function explainReading(
  stop: ReadingStop,
  signal: AbortSignal,
  round?: ReadingRound,
  question?: string
): Promise<string> {
  const data = await request(
    stop,
    question ? "ask" : "tutoring",
    signal,
    round,
    question
  );
  if (
    typeof data.explanation !== "string" ||
    data.explanation.trim().length < 20 ||
    data.explanation.length > 14000
  )
    throw new Error(
      "The explanation was incomplete. Your answer is saved; retry when you’re ready."
    );
  return data.explanation.trim();
}
