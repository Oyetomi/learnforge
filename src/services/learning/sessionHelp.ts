import { aiFetch, loadAIConnection, recordUsage } from "../ai/connection";
import type { LearningCheck, Milestone } from "../../types";
import { hideLearningCheckBlocks } from "./checks";
import { GROUNDING_INSTRUCTIONS, referenceContext } from "./grounding";
import { ILLUSTRATION_INSTRUCTIONS, MATH_INSTRUCTIONS, TABLE_INSTRUCTIONS } from "./visualContract";
import { extractVisualExample, hideCustomCanvasBlocks, validateVisualExample, visualForScientificPresentation, VISUAL_INSTRUCTIONS, type VisualExample } from "./visuals";

export type HelpKind = "hint" | "walkthrough" | "visual";
export interface HelpResult { content: string; visual?: VisualExample }
export const helpTitle = { hint: "Hint", walkthrough: "Walkthrough", visual: "Visual" };

export function helpRequest(kind: HelpKind, milestone: Milestone | null, check: LearningCheck | null, context: string, answered: boolean) {
  return [
    { role: "system", content: `You are providing optional ${kind} help alongside a learning activity. Preserve the exact subject and learner level. This is supported practice, never assessment or progress. Never emit forge-check, forge-assessment or forge-repair. Never start a new lesson, replace a question, or declare readiness. ${answered ? "Explain the submitted work when relevant." : "Do not reveal the answer to the pending question. Use a smaller analogous example."}
${kind === "hint" ? "Give one short nudge in 1–3 plain-language sentences, without solving the problem." : kind === "walkthrough" ? "Explain ONE concrete mechanism with a short introduction and ONE ladder/steps fenced block (title, initial, then --- with rule, why, state, optional eval, and result). Define unfamiliar terms. Use math only for actual mathematics and code only when the learner's goal requires it. Keep the example small; do not wrap each paragraph in a new section." : 'Return ONE forge-visual block using an app-owned scientific state-model (presentation style scientific, lanes or comparison), or a genuine owned graph/explorer. No custom HTML or canvas. Author meaningful visible state changes.'}
${kind === "visual" ? VISUAL_INSTRUCTIONS : MATH_INSTRUCTIONS + "\n" + TABLE_INSTRUCTIONS + "\n" + ILLUSTRATION_INSTRUCTIONS}
${GROUNDING_INSTRUCTIONS}` },
    { role: "user", content: JSON.stringify({ lesson: milestone ? { title: milestone.title, goal: milestone.prompt, intent: milestone.learning_intent } : null,
      currentActivity: hideLearningCheckBlocks(context).slice(0, 18000), question: check ? { question: check.question, context: check.context } : null,
      references: referenceContext(milestone?.references, context.slice(0, 1000)) }) },
  ];
}

export async function requestSessionHelp(kind: HelpKind, milestone: Milestone | null, check: LearningCheck | null, context: string, answered: boolean, signal: AbortSignal): Promise<HelpResult> {
  const response = await aiFetch({ model: loadAIConnection().model, temperature: .3, messages: helpRequest(kind, milestone, check, context, answered) }, { signal });
  if (!response.ok) throw new Error(`Could not prepare ${helpTitle[kind].toLowerCase()} (${response.status}).`);
  const envelope = await response.json(); recordUsage(envelope?.usage);
  const raw = envelope?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("No explanation returned. Try again.");
  const visual = kind === "visual" ? visualForScientificPresentation(extractVisualExample(raw)) : null;
  if (kind === "visual" && !visual) throw new Error("Could not prepare the figure. Your learning activity is unchanged.");
  const content = hideLearningCheckBlocks(hideCustomCanvasBlocks(raw));
  if (!content && !visual) throw new Error("No readable explanation returned. Try again.");
  return { content, ...(visual ? { visual } : {}) };
}

export function readHelp(key: string): HelpResult | null {
  try { const v = JSON.parse(localStorage.getItem(`learnforge:help:${key}`) || "null");
    if (!v || typeof v.content !== "string" || v.content.length > 60000) return null;
    const visual = v.visual ? validateVisualExample(v.visual) : null;
    return v.content.trim() || visual ? { content: v.content, ...(visual ? { visual } : {}) } : null;
  } catch { return null; }
}
export function saveHelp(key: string, result: HelpResult) {
  try { const data = JSON.stringify(result); if (data.length <= 140000) localStorage.setItem(`learnforge:help:${key}`, data); } catch { /* usable in memory */ }
}
