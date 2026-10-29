/**
 * Pre-Outline Adaptive Boundary Probing
 *
 * Generates 2–3 quick diagnostic questions BEFORE freezing a curriculum outline
 * so learners with partial prior knowledge can locate their exact conceptual
 * frontier and skip redundant introductory units.
 */

import type { ConfidenceLevel } from "../../types";
import { aiJsonRequest, loadAIConnection, recordUsage } from "./connection";
import {
  formatPriorConceptsForPrompt,
  type ConceptLedgerEntry,
} from "../learning/conceptLedger";

export interface BoundaryProbeOption {
  id: string;
  label: string;
}

export interface BoundaryProbeQuestion {
  id: string;
  conceptTested: string;
  tier: "foundation" | "intermediate" | "frontier";
  question: string;
  options: BoundaryProbeOption[];
  correctOptionId: string;
}

export interface BoundaryProbeResponse {
  selectedOptionId: string | null;
  dontKnow: boolean;
  confidence: ConfidenceLevel | null;
  thinking: string;
}

export interface BoundaryProbeOutcome {
  conceptTested: string;
  tier: BoundaryProbeQuestion["tier"];
  outcome:
    | "correct-confident"
    | "correct-tentative"
    | "unsure"
    | "incorrect";
  learnerThinking?: string;
}

export interface BoundaryEvidence {
  summary: string;
  demonstratedBasics: string[];
  frontierGaps: string[];
  probes: BoundaryProbeOutcome[];
}

export interface GenerateBoundaryProbesOptions {
  goal: string;
  destination: string;
  startingPoint: string;
  priorConcepts?: ConceptLedgerEntry[];
  signal?: AbortSignal;
}

function clean(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function validateBoundaryProbes(
  raw: unknown
): BoundaryProbeQuestion[] | null {
  if (!raw || typeof raw !== "object") return null;
  const list = Array.isArray((raw as { probes?: unknown }).probes)
    ? ((raw as { probes: unknown[] }).probes)
    : null;
  if (!list || list.length < 2 || list.length > 4) return null;

  const validated: BoundaryProbeQuestion[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < list.length; i++) {
    const item = list[i] as Record<string, unknown> | null;
    if (!item || typeof item !== "object") return null;
    const id = clean(item.id, 40) || `probe-${i + 1}`;
    if (seenIds.has(id)) return null;
    seenIds.add(id);

    const conceptTested = clean(item.conceptTested, 140);
    const question = clean(item.question, 380);
    const tier: BoundaryProbeQuestion["tier"] =
      item.tier === "foundation" ||
      item.tier === "intermediate" ||
      item.tier === "frontier"
        ? item.tier
        : i === 0
        ? "foundation"
        : i === list.length - 1
        ? "frontier"
        : "intermediate";

    if (!conceptTested || !question) return null;
    if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4)
      return null;

    const options: BoundaryProbeOption[] = [];
    const optIds = new Set<string>();
    for (const rawOpt of item.options) {
      if (!rawOpt || typeof rawOpt !== "object") return null;
      const opt = rawOpt as Record<string, unknown>;
      const optId = clean(opt.id, 32);
      const label = clean(opt.label, 220);
      if (!optId || !label || optIds.has(optId)) return null;
      optIds.add(optId);
      options.push({ id: optId, label });
    }

    const correctOptionId = clean(item.correctOptionId, 32);
    if (!optIds.has(correctOptionId)) return null;

    validated.push({
      id,
      conceptTested,
      tier,
      question,
      options,
      correctOptionId,
    });
  }

  return validated.slice(0, 3);
}

export async function generateBoundaryProbes(
  options: GenerateBoundaryProbesOptions
): Promise<BoundaryProbeQuestion[]> {
  const prior = options.priorConcepts?.length
    ? formatPriorConceptsForPrompt(options.priorConcepts)
    : undefined;

  const response = await aiJsonRequest(
    {
      model: loadAIConnection().model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Create 3 fast diagnostic boundary questions BEFORE designing a curriculum for the learner's goal, in ANY subject. Preserve the exact subject (do not turn non-coding goals into software engineering).
Order the 3 probes from:
1. "foundation": an essential entry concept someone with basic familiarity would recognize.
2. "intermediate": an applied distinction midway toward their desired ability.
3. "frontier": a subtler trade-off or application near their target capability.
Rules:
- Keep each question short (1–2 sentences) and concrete.
- Provide 3 plausible options per question with balanced length (±25% word count) so the right answer is never obvious from length or hedging.
- Do not include an "I don't know" option in options (the UI adds that automatically).
Return JSON only:
{"probes":[{"id":"p1","tier":"foundation","conceptTested":"short name of ability","question":"concrete diagnostic question","options":[{"id":"a","label":"choice"},{"id":"b","label":"choice"},{"id":"c","label":"choice"}],"correctOptionId":"b"}]}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            goal: options.goal,
            desiredAbility: options.destination || options.goal,
            statedStartingPoint: options.startingPoint,
            ...(prior ? { priorDemonstratedConcepts: prior } : {}),
          }),
        },
      ],
    },
    { signal: options.signal }
  );

  if (!response.ok) {
    throw new Error(
      `Could not prepare boundary questions (${response.status}). You can still prepare the curriculum outline directly.`
    );
  }

  const envelope = await response.json();
  recordUsage(envelope?.usage);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(
      String(envelope?.choices?.[0]?.message?.content || "")
        .trim()
        .replace(/^```(?:json)?\s*|\s*```$/g, "")
    );
  } catch {
    throw new Error(
      "The boundary questions were incomplete. Try again or prepare the outline directly."
    );
  }

  const validated = validateBoundaryProbes(parsed);
  if (!validated) {
    throw new Error(
      "The boundary questions could not be verified. Try again or prepare the outline directly."
    );
  }
  return validated;
}

export function summarizeBoundaryProbes(
  questions: BoundaryProbeQuestion[],
  responses: Record<string, BoundaryProbeResponse>
): BoundaryEvidence {
  const demonstratedBasics: string[] = [];
  const frontierGaps: string[] = [];
  const probes: BoundaryProbeOutcome[] = [];

  for (const q of questions) {
    const reply = responses[q.id];
    const thinking = clean(reply?.thinking, 240) || undefined;
    if (!reply || reply.dontKnow || !reply.selectedOptionId) {
      frontierGaps.push(q.conceptTested);
      probes.push({
        conceptTested: q.conceptTested,
        tier: q.tier,
        outcome: "unsure",
        learnerThinking: thinking,
      });
      continue;
    }

    const isCorrect = reply.selectedOptionId === q.correctOptionId;
    if (isCorrect) {
      const tentative = reply.confidence === "unsure";
      if (!tentative) {
        demonstratedBasics.push(q.conceptTested);
      } else {
        frontierGaps.push(`${q.conceptTested} (correct but low confidence)`);
      }
      probes.push({
        conceptTested: q.conceptTested,
        tier: q.tier,
        outcome: tentative ? "correct-tentative" : "correct-confident",
        learnerThinking: thinking,
      });
    } else {
      frontierGaps.push(q.conceptTested);
      probes.push({
        conceptTested: q.conceptTested,
        tier: q.tier,
        outcome: "incorrect",
        learnerThinking: thinking,
      });
    }
  }

  const summary =
    demonstratedBasics.length > 0 && frontierGaps.length > 0
      ? `Demonstrated solid footing on ${demonstratedBasics.join(
          ", "
        )}; curriculum should begin at ${frontierGaps.join(", ")}.`
      : demonstratedBasics.length > 0
      ? `Answered all diagnostic probes confidently (${demonstratedBasics.join(
          ", "
        )}); skip elementary definitions and focus on deeper application.`
      : `Needs accessible grounding starting from ${
          frontierGaps[0] || "foundational concepts"
        }.`;

  return {
    summary,
    demonstratedBasics,
    frontierGaps,
    probes,
  };
}
