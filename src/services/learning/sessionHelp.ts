import { aiFetch, aiJsonRequest, loadAIConnection, recordUsage } from "../ai/connection";
import type { LearningCheck, Milestone } from "../../types";
import { hideLearningCheckBlocks } from "./checks";
import { GROUNDING_INSTRUCTIONS, referenceContext } from "./grounding";
import { ILLUSTRATION_INSTRUCTIONS, MATH_INSTRUCTIONS, TABLE_INSTRUCTIONS } from "./visualContract";
import { hideCustomCanvasBlocks, validateVisualExample, visualForScientificPresentation, type VisualExample } from "./visuals";

import { SCIENTIFIC_HELP_INSTRUCTIONS, VisualHelpError, decodeVisualHelp } from "./scientificVisualHelp";
import { readChatText, StructuredResponseError } from "../ai/structuredResponse";
import { READING_BOUNDARY } from "./readingBoundary";

export type HelpKind = "hint" | "walkthrough" | "visual";
export interface HelpResult { content: string; visual?: VisualExample }
export const helpTitle = { hint: "Hint", walkthrough: "Walkthrough", visual: "Visual" };

export function helpRequest(kind: HelpKind, milestone: Milestone | null, check: LearningCheck | null, context: string, answered: boolean) {
  return [
    { role: "system", content: `You are providing optional ${kind} help alongside a learning activity. Preserve the exact subject and learner level. This is supported practice, never assessment or progress. Never emit forge-check, forge-assessment or forge-repair. Never start a new lesson, replace a question, or declare readiness. ${answered ? "Explain the submitted work when relevant." : "Do not reveal the answer to the pending question. Use a smaller analogous example."}
${kind === "hint" ? "Give one short nudge in 1–3 plain-language sentences, without solving the problem." : kind === "walkthrough" ? "Explain ONE concrete mechanism with a short introduction and ONE ladder/steps fenced block (title, initial, then --- with rule, why, state, optional eval, and result). Define unfamiliar terms. Use math only for actual mathematics and code only when the learner's goal requires it. Keep the example small; do not wrap each paragraph in a new section." : 'Return one supported paper figure following the FIGURE RESPONSE CONTRACT below. Author meaningful visible state changes.'}
${kind === "visual" ? SCIENTIFIC_HELP_INSTRUCTIONS : MATH_INSTRUCTIONS + "\n" + TABLE_INSTRUCTIONS + "\n" + ILLUSTRATION_INSTRUCTIONS}
${GROUNDING_INSTRUCTIONS}
${milestone?.reading_context ? READING_BOUNDARY : ""}` },
    { role: "user", content: JSON.stringify({ lesson: milestone ? { title: milestone.title, goal: milestone.prompt, intent: milestone.learning_intent } : null,
      coveredPdfPages: milestone?.reading_context,
      currentActivity: hideLearningCheckBlocks(context).slice(0, 18000), question: check ? { question: check.question, context: check.context } : null,
      references: referenceContext(milestone?.references, context.slice(0, 1000)) }) },
  ];
}

export async function requestSessionHelp(kind: HelpKind, milestone: Milestone | null, check: LearningCheck | null, context: string, answered: boolean, signal: AbortSignal, onProgress?: (phase:"generating"|"repairing")=>void): Promise<HelpResult> {
  const messages=helpRequest(kind,milestone,check,context,answered);
  for(let attempt=0;attempt<(kind==="visual"?2:1);attempt++) {
    signal.throwIfAborted();
    onProgress?.(attempt?"repairing":"generating");
    const body={model:loadAIConnection().model,temperature:.2,messages:attempt?[...messages,{role:"system",content:"The previous figure was not displayable. Rebuild a smaller figure from the same activity using exactly two reachable states and one meaningful action. List every declared entity once in each state. Keep code in format=code values. Follow the FIGURE RESPONSE CONTRACT exactly. Return JSON only. Do not change the lesson, question, or learner's subject."}]:messages,...(kind==="visual"?{max_tokens:6000,response_format:{type:"json_object"}}:{})};
    const response=kind==="visual"?await aiJsonRequest(body,{signal}):await aiFetch(body,{signal});
    if(!response.ok)throw new Error(`Could not prepare ${helpTitle[kind].toLowerCase()} (HTTP ${response.status}). Check your AI connection or try again.`);
    let envelope:unknown;
    try {envelope=await response.json();}catch {envelope=null;}
    recordUsage((envelope as {usage?:Parameters<typeof recordUsage>[0]})?.usage);
    try {
      if(kind==="visual")return decodeVisualHelp(envelope);
      const content=hideLearningCheckBlocks(hideCustomCanvasBlocks(readChatText(envelope)));
      if(!content)throw new Error("No readable explanation returned. Try again.");
      return {content};
    }catch(error) {
      if(signal.aborted)throw error;
      const canRebuild=error instanceof VisualHelpError||error instanceof StructuredResponseError&&error.reason!=="refused";
      if(kind==="visual"&&attempt===0&&canRebuild)continue;
      throw error;
    }
  }
  throw new VisualHelpError();
}

export function readHelp(key: string, kind?: HelpKind): HelpResult | null {
  try { const v = JSON.parse(localStorage.getItem(`learnforge:help:${key}`) || "null");
    if (!v || typeof v.content !== "string" || v.content.length > 60000) return null;
    const visual = v.visual ? validateVisualExample(v.visual) : null;
    if(kind==="visual"&&!visualForScientificPresentation(visual))return null;
    return v.content.trim() || visual ? { content: v.content, ...(visual ? { visual } : {}) } : null;
  } catch { return null; }
}
export function saveHelp(key: string, result: HelpResult) {
  try { const data = JSON.stringify(result); if (data.length <= 140000) localStorage.setItem(`learnforge:help:${key}`, data); } catch { /* usable in memory */ }
}
