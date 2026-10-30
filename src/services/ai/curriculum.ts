/**
 * LearnForge Dynamic Curriculum Generator
 *
 * Generates subject-appropriate learning plans while preserving the learner’s intent
 * using the local AI proxy (Gemini 3.8 / Argon).
 */

import {
  validateVisualExample,
  visualForSubject,
  VISUAL_INSTRUCTIONS,
} from "../learning/visuals";
import { MATH_INSTRUCTIONS, TABLE_INSTRUCTIONS } from "../learning/visualContract";
import { loadLearningPreferences } from "../learning/preferences";
import { CourseTrack } from "./types";
import { aiJsonRequest, loadAIConnection, recordUsage } from "./connection";
import { LearningReference, SupportedLanguage } from "../../types";
import { validPrerequisiteGraph } from "../learning/roadmap";
import { validateLearningCheck } from "../learning/checks";
import { FREE_RESPONSE_INSTRUCTIONS } from "../learning/freeResponse";
import {
  referenceContext,
  resolveLearningReferences,
  GROUNDING_INSTRUCTIONS,
} from "../learning/grounding";
import {
  formatPriorConceptsForPrompt,
  relevantPriorConcepts,
} from "../learning/conceptLedger";

export interface GenerateTrackOptions {
  topic: string;
  unitContext?: string;
  interest?: string;
  signal?: AbortSignal;
  language?: SupportedLanguage;
  level?: "Beginner" | "Intermediate" | "Advanced";
  references?: LearningReference[];
  referenceMaterial?: {
    name: string;
    content: string;
  };
}

export function normalizeLanguage(lang: unknown): SupportedLanguage | null {
  if (typeof lang !== "string") return null;
  const clean = lang.toLowerCase().trim();
  const aliases: Record<string, SupportedLanguage> = {
    golang: "go", py: "python", python3: "python", rs: "rust",
    js: "javascript", node: "javascript", ts: "typescript",
    "c++": "cpp", cxx: "cpp", "c#": "csharp", cs: "csharp",
    sh: "bash", shell: "bash", rb: "ruby", ex: "elixir", exs: "elixir", sqlite: "sql",
  };
  // A learning plan may teach a language even when its execution service lacks
  // a runtime. Do not silently substitute one of the original five languages.
  if (!/^[a-z][a-z0-9+#.-]{0,39}$/.test(clean) || ["none", "null", "general"].includes(clean)) return null;
  return aliases[clean] || clean;
}

export async function generateCustomTrack(
  options: GenerateTrackOptions,
  onStatusUpdate?: (status: string) => void
): Promise<CourseTrack> {
  const { topic, level = "Beginner" } = options;
  const interest = options.interest?.trim() || topic;
  const resolvedRefs = resolveLearningReferences(
    options.references,
    options.referenceMaterial
  );
  onStatusUpdate?.("Preparing your learning plan…");

  const systemPrompt = `You design LearnForge learning plans for ANY subject, at the learner's requested level and for their actual purpose.

${GROUNDING_INSTRUCTIONS}

PRESERVE INTENT
The original interest is the source of truth. The selected goal narrows it; it must never replace its subject or purpose. Do not recast ordinary learning as engineering, programming, academic research, or professional analysis. Learning a spoken language means learning to understand and use that language, unless the learner explicitly asks for linguistics or speech technology. For example, learning Yoruba should begin with practical words, greetings or a tiny everyday exchange, not acoustic modeling, frequency extraction, Unicode engineering or software. Likewise, cooking means preparing food, not building a recipe application. Keep titles and questions understandable to the learner. Do not assume intermediate knowledge. Use a gentle first activity to find their starting point.

${FREE_RESPONSE_INSTRUCTIONS}

SUBJECT-APPROPRIATE PRACTICE
Return practice_mode="general" and language=null for language learning, history, art, everyday skills and other goals that do not ask for coding. General lessons must have no starter_code or test_code. Only return practice_mode="coding" and a programming language when learning or writing code directly serves the stated goal. A technical topic does not automatically require code. For coding, preserve the requested programming language and return its lowercase identifier (for example cpp, csharp, sql, lua); do not substitute Go or Python. Runtime availability is checked separately by the editor.
For spoken languages, use accurate, natural phrases with translations and correct diacritics, then ask about meaning or use in a short exchange. Explain new terms in plain words. Do not claim to hear, evaluate pronunciation, or assess listening without actual audio; text questions establish written understanding only. Do not invent translations when uncertain.

TEACHING AND STRUCTURE
${options.unitContext ? `This request prepares EXACTLY ONE focused lesson or unit for the supplied learning context. Do not create a new path or change its scope. Return exactly one milestone with a nonempty lesson and a valid check. Use a new example, not any prior placement question. Approved context: ${options.unitContext}` : ""}
Each activity teaches one small idea with a short concrete example and an interactive check, then waits for the learner. Do not dump advanced terminology or reveal the answer key outside the check. Put substantial code, if relevant, in a fenced context block. The initial map is provisional, with 1–8 concepts suited to this goal. Each prerequisite_ids array references existing milestone ids; independent roots use [], dependencies must be real and acyclic.

VISUAL SUPPORT
Learner presentation preferences: ${JSON.stringify(loadLearningPreferences())}.
When visuals=auto, optionally add a visual object to a milestone ONLY when a genuine interactive illustration (kind="canvas" 3D/D3/Rough/2D simulation with $LaTeX$, kind="explorer" Mafs mathematical curve lab, kind="diagram" React Flow + Dagre node-edge blueprint schematic, kind="state-model", kind="graph", or spoken-language kind="phrase-builder") makes the concept tactile and crystal clear. NEVER attach static kind="parts" or kind="comparison" boxes of code lines. Use an analogous example different from the assessment. The object follows the schema below as a JSON field named visual, not a fenced block in lesson.
${VISUAL_INSTRUCTIONS}
${MATH_INSTRUCTIONS}
${TABLE_INSTRUCTIONS}

Return valid JSON only, using this structure. The single milestone here is a schema example, not a required plan length:
{
 "title":"Plain, subject-appropriate course title",
 "tagline":"What the learner will be able to do",
 "practice_mode":"general or coding",
 "language":null,
 "difficulty":"${level}",
 "estimatedHours":2,
 "description":"Short learner-facing overview",
 "concepts":["First idea"],
 "initialPrompt":"A short welcome grounded in their goal",
 "milestones":[{
   "id":"m1", "prerequisite_ids":[],
   "title":"One small skill", "concept":"The idea to understand",
   "prompt":"A clear learning goal in this subject",
   "lesson":"One plain-language explanation and a tiny concrete example",
   "check":{
     "question":"A short question about meaning, use, or an appropriate application",
     "context":"Optional short example or dialogue",
     "options":[{"id":"a","label":"Plausible answer"},{"id":"b","label":"Another answer"}],
     "correctOptionIds":["b"], "multiple":false,
     "explanation":"Plain explanation of the answer"
   },
   "starter_code":"", "test_code":"", "hints":["A helpful hint"]
 }]
}`;
  onStatusUpdate?.("Creating lessons and interactive questions…");
  const hasReference = resolvedRefs.length > 0;
  const matchedPrior = relevantPriorConcepts(`${interest} ${topic}`, {
    limit: 6,
  });
  const userPrompt = JSON.stringify({
    originalInterest: interest,
    selectedGoal: topic,
    statedLevel:
      options.level ||
      "Not specified; start accessibly and diagnose through practice",
    preferredProgrammingLanguage: options.language || null,
    ...(matchedPrior.length
      ? {
          priorDemonstratedConcepts: formatPriorConceptsForPrompt(matchedPrior),
        }
      : {}),
    ...(hasReference
      ? {
          referenceMaterial: {
            name:
              resolvedRefs.map((r) => r.name).join(", ") || "Uploaded reference",
            excerpt: referenceContext(resolvedRefs, topic, 8000),
          },
        }
      : {}),
    instruction: hasReference
      ? "Preserve the original subject and practical purpose throughout the plan. Ground the milestones, lessons, and checks directly in the supplied referenceMaterial, referencing its specific sections, examples, or functions."
      : "Preserve the original subject and practical purpose throughout the plan. Coding is only appropriate when it directly serves the goal.",
  });

  const payload = {
    model: loadAIConnection().model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  };

  const response = await aiJsonRequest(payload, { signal: options.signal });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `AI service returned HTTP ${response.status}: ${
        errorText || response.statusText
      }`
    );
  }

  const data = await response.json();
  recordUsage(data?.usage);
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("AI returned an empty curriculum response");
  }

  onStatusUpdate?.("Checking your learning plan…");

  // Strip any accidental markdown formatting
  let cleanJson = rawContent.trim();
  if (cleanJson.startsWith("```json")) {
    cleanJson = cleanJson
      .replace(/^```json/, "")
      .replace(/```$/, "")
      .trim();
  } else if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanJson);
  } catch {
    throw new Error(
      "The AI service returned an incomplete learning plan. Please try again."
    );
  }
  if (
    !parsed ||
    !Array.isArray(parsed.milestones) ||
    parsed.milestones.length < 1 ||
    parsed.milestones.length > 8 ||
    (options.unitContext && (parsed.milestones.length !== 1 || !parsed.milestones[0]?.lesson?.trim())) ||
    parsed.milestones.some(
      (m: any) =>
        !m ||
        typeof m.prompt !== "string" ||
        !m.prompt.trim() ||
        (m.check != null && !validateLearningCheck(m.check)) ||
        (!validateLearningCheck(m.check) &&
          (parsed.practice_mode !== "coding" ||
            !m.starter_code?.trim() ||
            !m.test_code?.trim()))
    )
  ) {
    throw new Error(
      "The AI service did not return a complete learning plan. Please try again."
    );
  }
  const sourceIds: string[] = parsed.milestones.map((m: any, index: number) =>
    typeof m.id === "string" && m.id.trim() ? m.id.trim() : `m${index + 1}`
  );
  if (
    !validPrerequisiteGraph(
      parsed.milestones.map((m: any, index: number) => ({
        id: sourceIds[index],
        prerequisite_ids: m.prerequisite_ids,
      }))
    )
  )
    throw new Error(
      "The learning plan contains invalid prerequisite connections. Please try again."
    );
  const trackId = `custom-${topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 32)}-${Date.now().toString(36)}`;
  const practiceMode =
    parsed.practice_mode === "coding" || options.language
      ? "coding"
      : "general";
  const chosenLanguage =
    practiceMode === "coding"
      ? normalizeLanguage(parsed.language || options.language)
      : null;
  if (practiceMode === "coding" && !chosenLanguage)
    throw new Error(
      "The coding plan did not specify a programming language. Please try again."
    );

  const track: CourseTrack = {
    references: resolvedRefs.length > 0 ? resolvedRefs : undefined,
    id: trackId,
    title: parsed.title || topic,
    tagline: parsed.tagline || `Master ${topic}`,
    language: chosenLanguage,
    learningIntent: {
      interest,
      goal: topic,
      level: options.level,
      practiceMode,
      programmingLanguage: chosenLanguage || undefined,
    },
    difficulty: parsed.difficulty || level,
    estimatedHours: parsed.estimatedHours || 4,
    description: parsed.description || `Hands-on guided track for ${topic}.`,
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [topic],
    initialPrompt:
      parsed.initialPrompt ||
      `Welcome to **${
        parsed.title || topic
      }**! Let's get started with Milestone 1.`,
    milestones: (parsed.milestones || []).map((m: any, idx: number) => ({
      id: `${trackId}-m${idx + 1}`,
      title: m.title || `Milestone ${idx + 1}`,
      concept: m.concept || m.title,
      prompt: m.prompt || "Complete the exercise according to the tests.",
      starter_code:
        practiceMode === "coding" && typeof m.starter_code === "string"
          ? m.starter_code
          : "",
      test_code:
        practiceMode === "coding" && typeof m.test_code === "string"
          ? m.test_code
          : "",
      prerequisite_ids: Array.isArray(m.prerequisite_ids)
        ? m.prerequisite_ids.map(
            (id: string) => `${trackId}-m${sourceIds.indexOf(id) + 1}`
          )
        : undefined,
      lesson: typeof m.lesson === "string" ? m.lesson : undefined,
      check: validateLearningCheck(m.check) || undefined,
      visual:
        visualForSubject(validateVisualExample(m.visual), chosenLanguage) ||
        undefined,
      hints: Array.isArray(m.hints) ? m.hints : [],
    })),
  };

  return track;
}
