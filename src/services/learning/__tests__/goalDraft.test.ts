import { afterEach, expect, it, vi } from "vitest";
import { GOAL_DRAFT_EVENT, GOAL_DRAFT_KEY, loadGoalDraft, saveGoalDraft, STARTING_POINTS } from "../goalDraft";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}

it("shares the edited home goal without discarding the detailed form's outcome and starting point", () => {
  storage();
  const events = new EventTarget(), listener = vi.fn();
  vi.stubGlobal("window", events);
  events.addEventListener(GOAL_DRAFT_EVENT, listener);
  saveGoalDraft({ interest: "Old goal", destination: "Compare sale prices", startingPoint: STARTING_POINTS[1] });
  saveGoalDraft({ interest: "Understand percentages" });
  expect(loadGoalDraft()).toEqual({ interest: "Understand percentages", destination: "Compare sale prices", startingPoint: STARTING_POINTS[1] });
  expect(listener).toHaveBeenCalledTimes(2);
});

it("restores bounded text and treats corrupt saved drafts as empty", () => {
  const values = storage();
  values.set(GOAL_DRAFT_KEY, JSON.stringify({ interest: "x".repeat(600), destination: "y".repeat(900), startingPoint: "unknown" }));
  expect(loadGoalDraft().interest).toHaveLength(400);
  expect(loadGoalDraft().destination).toHaveLength(800);
  expect(loadGoalDraft().startingPoint).toBe(STARTING_POINTS[0]);
  values.set(GOAL_DRAFT_KEY, "broken json");
  expect(loadGoalDraft()).toEqual({});
});

it("does not block entering a goal when storage is unavailable", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("Unavailable"); }, setItem: () => { throw new Error("Full"); } });
  expect(loadGoalDraft()).toEqual({});
  expect(() => saveGoalDraft({ interest: "My new skill" })).not.toThrow();
});
