export const GOAL_DRAFT_EVENT = "learnforge:goal-draft-changed";
export const GOAL_DRAFT_KEY = "learnforge:goal-draft";
export const STARTING_POINTS = [
  "I’m not sure — help me find my starting point",
  "I’m starting from the beginning",
  "I know the basics and want to apply them",
  "I have experience and want to deepen it",
];
export interface GoalDraft { interest?: string; destination?: string; startingPoint?: string }

export function loadGoalDraft(): GoalDraft {
  try {
    const draft = JSON.parse(localStorage.getItem(GOAL_DRAFT_KEY) || "{}");
    if (!draft || typeof draft !== "object") return {};
    return {
      interest: typeof draft.interest === "string" ? draft.interest.slice(0, 400) : "",
      destination: typeof draft.destination === "string" ? draft.destination.slice(0, 800) : "",
      startingPoint: STARTING_POINTS.includes(draft.startingPoint) ? draft.startingPoint : STARTING_POINTS[0],
    };
  } catch { return {}; }
}

/** The home prompt and detailed goal form edit the same draft. */
export function saveGoalDraft(patch: GoalDraft) {
  try {
    localStorage.setItem(GOAL_DRAFT_KEY, JSON.stringify({ ...loadGoalDraft(), ...patch }));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(GOAL_DRAFT_EVENT));
  } catch { /* A full storage area must not prevent entering a goal. */ }
}
