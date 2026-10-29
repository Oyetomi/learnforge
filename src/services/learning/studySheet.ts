import { aiFetch, loadAIConnection, recordUsage } from "../ai/connection";
import type { ChatMessage, LearningCheck, Milestone } from "../../types";
import { hideLearningCheckBlocks } from "./checks";
import { ILLUSTRATION_INSTRUCTIONS, MATH_INSTRUCTIONS, TABLE_INSTRUCTIONS } from "./visualContract";
import { GROUNDING_INSTRUCTIONS, referenceContext } from "./grounding";
import { approvedLessonIds } from "./adaptation";

/**
 * Ephemeral "/btw" side-question helper (inspired by LearnHarness #16).
 * Answers a quick tangential or clarifying question in 2-4 sentences
 * without mutating the main session timeline or stealing stage focus.
 */
export async function askBtwQuestion(
  question: string,
  milestone: Milestone | null,
  activeCheck: LearningCheck | null,
  signal?: AbortSignal
): Promise<string> {
  const cleanQuestion = question.replace(/^\/btw\b\s*/i, "").trim();
  if (!cleanQuestion) return "Ask a quick side question after `/btw`.";

  const response = await aiFetch(
    {
      model: loadAIConnection().model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `Answer a quick /btw side question in 2–4 plain-language sentences without changing the lesson. ${ILLUSTRATION_INSTRUCTIONS} ${MATH_INSTRUCTIONS} ${TABLE_INSTRUCTIONS} ${GROUNDING_INSTRUCTIONS} Do not emit forge-check, forge-visual, forge-repair or forge-assessment. Never reveal the answer to an active unanswered check.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            sideQuestion: cleanQuestion,
            currentLesson: milestone
              ? { title: milestone.title, goal: milestone.prompt }
              : null,
            referenceExcerpts: referenceContext(milestone?.references, cleanQuestion),
            activeQuestion: activeCheck
              ? {
                  question: activeCheck.question,
                  context: activeCheck.context,
                }
              : null,
          }),
        },
      ],
    },
    { signal }
  );

  if (!response.ok) {
    throw new Error(`Side question failed (${response.status})`);
  }
  const envelope = await response.json();
  recordUsage(envelope?.usage);
  const raw = envelope?.choices?.[0]?.message?.content;
  return typeof raw === "string" && raw.trim()
    ? hideLearningCheckBlocks(raw.trim())
    : "No response returned.";
}

export interface StudySheetSummary {
  concepts: {
    id: string;
    title: string;
    status: Milestone["status"];
    takeaway: string;
  }[];
  verifiedChecks: {
    id: string;
    question: string;
    answer: string;
    explanation: string;
  }[];
  repairedMistakes: {
    id: string;
    question: string;
    chosenAnswer: string;
    correctAnswer: string;
    explanation: string;
  }[];
  calibration: {
    calibratedMasteryCount: number;
    overconfidentTraps: {
      id: string;
      question: string;
      chosenAnswer: string;
      correctAnswer: string;
    }[];
    underconfidentStrengths: {
      id: string;
      question: string;
      answer: string;
    }[];
  };
}

export function buildStudySheet(
  milestones: Milestone[],
  messages: ChatMessage[]
): StudySheetSummary {
  const checksById = new Map<string, LearningCheck>();
  for (const m of milestones) {
    if (m.check) {
      checksById.set(`${m.id}:intro-check-v1`, {
        ...m.check,
        id: `${m.id}:intro-check-v1`,
        milestoneId: m.id,
      });
    }
  }
  for (const msg of messages) {
    if (msg.learning_check) {
      checksById.set(msg.learning_check.id, msg.learning_check);
    }
  }

  const concepts = milestones.map((m) => {
    const firstParagraph =
      (m.lesson || m.prompt || "")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .find((p) => p && !p.startsWith("#") && !p.startsWith("```")) ||
      m.prompt;
    return {
      id: m.id,
      title: m.title,
      status: m.status,
      takeaway: firstParagraph,
    };
  });

  const verifiedChecks: StudySheetSummary["verifiedChecks"] = [];
  const repairedMistakes: StudySheetSummary["repairedMistakes"] = [];
  const overconfidentTraps: StudySheetSummary["calibration"]["overconfidentTraps"] =
    [];
  const underconfidentStrengths: StudySheetSummary["calibration"]["underconfidentStrengths"] =
    [];
  let calibratedMasteryCount = 0;
  const seenCheckIds = new Set<string>();

  for (const msg of messages) {
    const attempt = msg.check_attempt;
    if (!attempt || seenCheckIds.has(attempt.checkId)) continue;
    const check = checksById.get(attempt.checkId);
    if (!check) continue;
    seenCheckIds.add(attempt.checkId);

    const correctLabels = check.expectedAnswer || check.options
      .filter((o) => check.correctOptionIds.includes(o.id))
      .map((o) => o.label)
      .join("; ");
    const chosenLabels = attempt.response || check.options
      .filter((o) =>
        (attempt.retriedOptionIds?.length
          ? attempt.retriedOptionIds
          : attempt.selectedIds
        ).includes(o.id)
      )
      .map((o) => o.label)
      .join("; ");

    const hadInitialMiss =
      !attempt.correct || Boolean(attempt.retriedOptionIds?.length);
    if (hadInitialMiss) {
      repairedMistakes.push({
        id: check.id,
        question: check.question,
        chosenAnswer: attempt.dontKnow
          ? "I don’t know yet"
          : chosenLabels || "Previous attempt",
        correctAnswer: correctLabels,
        explanation: check.explanation,
      });
      if (attempt.confidence === "confident" && !attempt.dontKnow && attempt.grading?.status !== "uncertain") {
        overconfidentTraps.push({
          id: check.id,
          question: check.question,
          chosenAnswer: chosenLabels || "Initial selection",
          correctAnswer: correctLabels,
        });
      }
    }
    if (attempt.correct) {
      verifiedChecks.push({
        id: check.id,
        question: check.question,
        answer: correctLabels,
        explanation: check.explanation,
      });
      if (!hadInitialMiss && !attempt.assisted) {
        if (attempt.confidence === "confident") {
          calibratedMasteryCount++;
        } else if (
          attempt.confidence === "unsure" ||
          attempt.confidence === "somewhat"
        ) {
          underconfidentStrengths.push({
            id: check.id,
            question: check.question,
            answer: correctLabels,
          });
        }
      }
    }
  }

  return {
    concepts,
    verifiedChecks,
    repairedMistakes,
    calibration: {
      calibratedMasteryCount,
      overconfidentTraps,
      underconfidentStrengths,
    },
  };
}

export function buildStudySheetMarkdown(
  trackTitle: string,
  milestones: Milestone[],
  messages: ChatMessage[]
): string {
  const sheet = buildStudySheet(milestones, messages);
  const readyIds = approvedLessonIds(messages);
  const lines: string[] = [`# ${trackTitle} — Study Sheet`, ""];

  lines.push("## Core Concepts");
  for (const c of sheet.concepts) {
    const badge = readyIds.has(c.id)
      ? "[Readiness reviewed]"
      : c.status === "completed"
      ? "[Past activity]"
      : c.status === "active"
      ? "[In Progress]"
      : "[Not started]";
    lines.push(`### ${c.title} ${badge}`);
    lines.push(c.takeaway);
    lines.push("");
  }

  if (sheet.repairedMistakes.length > 0) {
    lines.push("## Answers to Revisit");
    for (const item of sheet.repairedMistakes) {
      lines.push(`- **Question:** ${item.question}`);
      lines.push(`  - *Initial trap:* ${item.chosenAnswer}`);
      lines.push(`  - *Key invariant:* ${item.correctAnswer} — ${item.explanation}`);
    }
    lines.push("");
  }

  if (sheet.verifiedChecks.length > 0) {
    lines.push("## Correctly Answered Checks");
    for (const item of sheet.verifiedChecks) {
      lines.push(`- **Q:** ${item.question}`);
      lines.push(`  - **A:** ${item.answer} (${item.explanation})`);
    }
    lines.push("");
  }

  if (
    sheet.calibration.overconfidentTraps.length > 0 ||
    sheet.calibration.underconfidentStrengths.length > 0 ||
    sheet.calibration.calibratedMasteryCount > 0
  ) {
    lines.push("## Confidence Calibration");
    lines.push(
      `- **Confident, independent correct answers:** ${sheet.calibration.calibratedMasteryCount}`
    );
    for (const trap of sheet.calibration.overconfidentTraps) {
      lines.push(
        `- **Confident answer to revisit:** ${trap.question} (picked *${trap.chosenAnswer}* vs. *${trap.correctAnswer}*)`
      );
    }
    for (const strength of sheet.calibration.underconfidentStrengths) {
      lines.push(
        `- **Correct answer with lower confidence:** ${strength.question}`
      );
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Generates an Anki-compatible tab-separated deck (Front \t Back \t Tags)
 * from the session's verified checks and repaired mistakes (#11).
 */
export function buildAnkiTsv(
  trackTitle: string,
  milestones: Milestone[],
  messages: ChatMessage[]
): string {
  const sheet = buildStudySheet(milestones, messages);
  const tag = trackTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const rows: string[] = [];
  const sanitize = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");

  for (const item of sheet.repairedMistakes) {
    rows.push(
      `${sanitize(item.question)}\t<strong>${sanitize(item.correctAnswer)}</strong><br><br>${sanitize(item.explanation)}\tlearnforge ${tag} revisit`
    );
  }
  for (const item of sheet.verifiedChecks) {
    if (sheet.repairedMistakes.some((m) => m.id === item.id)) continue;
    rows.push(
      `${sanitize(item.question)}\t<strong>${sanitize(item.answer)}</strong><br><br>${sanitize(item.explanation)}\tlearnforge ${tag}`
    );
  }
  if (rows.length === 0) {
    for (const c of sheet.concepts) {
      rows.push(
        `${sanitize(`Key idea: ${c.title}`)}\t${sanitize(
          c.takeaway
        )}\tlearnforge ${tag}`
      );
    }
  }
  return rows.join("\n") + "\n";
}
