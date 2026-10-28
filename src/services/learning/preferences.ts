export interface LearningPreferences {
  visuals: "auto" | "ask" | "text";
  detail: "brief" | "deeper";
  pace: "steps" | "overview";
  examples: string;
  retention: boolean;
}
export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
  visuals: "auto",
  detail: "brief",
  pace: "steps",
  examples: "",
  retention: false,
};
export const LEARNING_PREFERENCES_EVENT = "learnforge:learning-preferences";
const key = "learnforge:learning-preferences";
export function validatePreferences(value: unknown): LearningPreferences {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    retention: v.retention === true,
    visuals: ["auto", "ask", "text"].includes(String(v.visuals))
      ? (v.visuals as LearningPreferences["visuals"])
      : "auto",
    detail: v.detail === "deeper" ? "deeper" : "brief",
    pace: v.pace === "overview" ? "overview" : "steps",
    examples:
      typeof v.examples === "string" ? v.examples.trim().slice(0, 240) : "",
  };
}
export function loadLearningPreferences(): LearningPreferences {
  try {
    return validatePreferences(JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return { ...DEFAULT_LEARNING_PREFERENCES };
  }
}
export function saveLearningPreferences(value: Partial<LearningPreferences>) {
  const clean = validatePreferences(value);
  localStorage.setItem(key, JSON.stringify(clean));
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(LEARNING_PREFERENCES_EVENT));
}
const viewedSupport = new Map<string, Set<string>>();
export const PRACTICE_SUPPORT_EVENT = "learnforge:practice-support";
const supportKey = (checkId: string) => `learnforge:visual-support:${checkId}`;
export function visualSupportFor(checkId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(supportKey(checkId)) || "[]");
    const stored = Array.isArray(v)
      ? v.filter((x: unknown) => typeof x === "string")
      : [];
    return [
      ...new Set([...stored, ...(viewedSupport.get(checkId) || [])]),
    ].slice(-24);
  } catch {
    return [...(viewedSupport.get(checkId) || [])];
  }
}
export function recordVisualSupport(checkId: string, visualId: string) {
  if (visualSupportFor(checkId).includes(visualId)) return;
  viewedSupport.set(
    checkId,
    new Set([...visualSupportFor(checkId), visualId].slice(-24))
  );
  try {
    localStorage.setItem(
      supportKey(checkId),
      JSON.stringify(
        [...new Set([...visualSupportFor(checkId), visualId])].slice(-24)
      )
    );
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PRACTICE_SUPPORT_EVENT));
}

export function forgetVisualSupport(checkIds: Iterable<string>) {
  for (const id of checkIds) viewedSupport.delete(id);
}
