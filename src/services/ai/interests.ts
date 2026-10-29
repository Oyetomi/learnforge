import { aiJsonRequest, loadAIConnection, recordUsage } from "./connection";
import { GROUNDING_INSTRUCTIONS } from "../learning/grounding";
export interface TopicSuggestion {
  title: string;
  why: string;
  goal: string;
}
export async function suggestTopics(
  interest: string,
  signal?: AbortSignal,
  referenceMaterial?: { name: string; content: string }
): Promise<TopicSuggestion[]> {
  const hasRef = Boolean(referenceMaterial?.content?.trim());
  const userContent = hasRef
    ? `${interest.trim() || `Teach the concepts in ${referenceMaterial!.name}`}\n\nAttached reference material (${
        referenceMaterial!.name || "Reference"
      }):\n${referenceMaterial!.content.trim().slice(0, 6000)}`
    : interest.trim();
  const response = await aiJsonRequest(
    {
      model: loadAIConnection().model,
      response_format: { type: "json_object" },
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            GROUNDING_INSTRUCTIONS + ' Help a curious adult choose a concrete learning topic from their interests. Return JSON only: {"topics":[{"title":"short specific topic","why":"one concise sentence connecting it to this interest","goal":"a concrete learning objective for an adaptive tutor"}]}. Suggest 3–5 distinct useful directions, not a fixed catalog. If attached reference material or source code is provided, ground every suggested topic directly in the concepts, sections, or functions inside that material. Do not assume their skill level, invent personal history, add promotional language, or require coding where it is not useful. Preserve the learner’s subject and purpose. Learning a spoken language means practical communication, not linguistics or speech engineering unless explicitly requested. Cooking means making food, not software. Do not turn nontechnical interests into technical topics. Use plain topic titles and accessible starting points unless a level is stated. If the interest is already precise, suggest meaningfully different angles or applications rather than random adjacent subjects.',
        },
        { role: "user", content: userContent },
      ],
    },
    { signal }
  );
  if (!response.ok)
    throw new Error(
      "The topic service could not connect. Your interest is saved here; try again."
    );
  const envelope = await response.json();
  recordUsage(envelope?.usage);
  let parsed: any;
  try {
    parsed = JSON.parse(
      envelope.choices?.[0]?.message?.content?.replace(
        /^```(?:json)?\s*|\s*```$/g,
        ""
      ) || "{}"
    );
  } catch {
    throw new Error("The topic suggestions were incomplete. Try again.");
  }
  if (
    !Array.isArray(parsed.topics) ||
    parsed.topics.length < 2 ||
    parsed.topics.length > 5 ||
    parsed.topics.some((topic: any) =>
      ["title", "why", "goal"].some(
        (key) => typeof topic?.[key] !== "string" || !topic[key].trim()
      )
    ) ||
    new Set(parsed.topics.map((topic: any) => topic.title.trim().toLowerCase()))
      .size !== parsed.topics.length
  )
    throw new Error("The topic suggestions were incomplete. Try again.");
  return parsed.topics.map((topic: TopicSuggestion) => ({
    title: topic.title.trim(),
    why: topic.why.trim(),
    goal: topic.goal.trim(),
  }));
}
