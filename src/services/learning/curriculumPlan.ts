import type { ChatMessage, Milestone } from "../../types";
import type { CourseTrack } from "../ai/types";
import { approvedLessonIds } from "./adaptation";
import { validPrerequisiteGraph } from "./roadmap";

export type LearningScope = "curriculum" | "focused";
export interface CurriculumUnit {
  id: string;
  title: string;
  outcome: string;
  assessment: string;
  prerequisiteIds: string[];
}
export interface CurriculumModule {
  id: string;
  title: string;
  outcome: string;
  units: CurriculumUnit[];
}
export interface CurriculumPlan {
  schemaVersion: 1;
  version: number;
  scope: LearningScope;
  originalGoal: string;
  destination: string;
  startingPoint: string;
  exclusions: string[];
  modules: CurriculumModule[];
  approvedAt?: number;
  /** Legacy tracks are wrapped without rewriting their lessons or evidence. */
  legacy?: boolean;
}
export const curriculumUnits = (plan: CurriculumPlan) =>
  plan.modules.flatMap((m) => m.units);

/** Structural validity is necessary; it is not a claim of expert-reviewed coverage. */
export function validCurriculumPlan(value: unknown): value is CurriculumPlan {
  const p = value as CurriculumPlan;
  const text = (s: unknown) =>
    typeof s === "string" && !!s.trim() && s.length <= 1200;
  if (
    !p ||
    p.schemaVersion !== 1 ||
    !Number.isInteger(p.version) ||
    p.version < 1 ||
    !["curriculum", "focused"].includes(p.scope) ||
    !text(p.originalGoal) ||
    !text(p.destination) ||
    !text(p.startingPoint) ||
    !Array.isArray(p.exclusions) ||
    p.exclusions.length > 12 ||
    !p.exclusions.every(text) ||
    !Array.isArray(p.modules) ||
    !p.modules.length ||
    p.modules.length > 10 ||
    p.modules.some(
      (m) =>
        !m ||
        !text(m.id) ||
        !text(m.title) ||
        !text(m.outcome) ||
        !Array.isArray(m.units) ||
        !m.units.length ||
        m.units.length > 8 ||
        m.units.some(
          (u) =>
            !u ||
            !text(u.id) ||
            !text(u.title) ||
            !text(u.outcome) ||
            !text(u.assessment) ||
            !Array.isArray(u.prerequisiteIds),
        ),
    )
  )
    return false;
  const units = curriculumUnits(p);
  if (
    units.length > 48 ||
    new Set(p.modules.map((m) => m.id)).size !== p.modules.length ||
    new Set(units.map((u) => u.outcome.trim().toLowerCase())).size !==
      units.length
  )
    return false;
  const moduleEdges = p.modules.map((m) => ({
    id: m.id,
    prerequisite_ids: [
      ...new Set(
        m.units
          .flatMap((u) => u.prerequisiteIds)
          .flatMap((id) => {
            const parent = p.modules.find((x) =>
              x.units.some((u) => u.id === id),
            );
            return parent && parent.id !== m.id ? [parent.id] : [];
          }),
      ),
    ],
  }));
  if (!validPrerequisiteGraph(moduleEdges)) return false;
  return validPrerequisiteGraph(
    units.map((u) => ({ id: u.id, prerequisite_ids: u.prerequisiteIds })),
  );
}

/** Pure compatibility view: existing IDs, order, attempts and saved sessions are untouched. */
export function curriculumForTrack(track: CourseTrack): CurriculumPlan {
  if (validCurriculumPlan(track.curriculum)) return track.curriculum;
  return {
    schemaVersion: 1,
    version: 1,
    scope: "focused",
    legacy: true,
    originalGoal: track.learningIntent?.interest || track.title,
    destination: track.tagline || track.title,
    startingPoint:
      track.learningIntent?.level || "Starting point not specified",
    exclusions: [],
    approvedAt: track.placement?.approvedAt,
    modules: [
      {
        id: `${track.id}:module`,
        title: track.title,
        outcome: track.tagline,
        units: track.milestones.map((m, i) => ({
          id: m.id,
          title: m.title,
          outcome: m.prompt,
          assessment:
            "Apply this idea through the saved lesson and fresh checks.",
          prerequisiteIds:
            m.prerequisite_ids ?? (i ? [track.milestones[i - 1].id] : []),
        })),
      },
    ],
  };
}

export function milestoneForUnit(
  track: CourseTrack,
  milestones: Milestone[],
  unitId: string,
) {
  const identified = milestones.find((m) => m.curriculum_unit_id === unitId);
  if (identified) return identified;
  // Only old sessions lack the template identifier. Repairs never occupy a unit slot.
  const index = track.milestones.findIndex((m) => m.id === unitId);
  return milestones.filter((m) => !m.adaptive)[index];
}
export function curriculumProgress(
  track: CourseTrack,
  milestones: Milestone[],
  messages: ChatMessage[],
) {
  const units = curriculumUnits(curriculumForTrack(track));
  const approved = approvedLessonIds(messages);
  const demonstrated = units.filter((u) => {
    const m = milestoneForUnit(track, milestones, u.id);
    return m && approved.has(m.id);
  }).length;
  const practising = units.filter((u) => {
    const m = milestoneForUnit(track, milestones, u.id);
    return (
      m &&
      !approved.has(m.id) &&
      messages.some((msg) => msg.check_attempt?.milestoneId === m.id)
    );
  }).length;
  return { demonstrated, practising, total: units.length };
}

/** Diagnose an available foundation instead of overriding prerequisite credit. */
export function firstAvailableFoundation(
  target: Milestone,
  milestones: Milestone[],
  approved: Set<string>,
): Milestone | undefined {
  const seen = new Set<string>();
  const find = (m: Milestone): Milestone | undefined => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    const index = milestones.findIndex((x) => x.id === m.id);
    const parents =
      m.prerequisite_ids ?? (index ? [milestones[index - 1].id] : []);
    for (const id of parents) {
      if (approved.has(id)) continue;
      const parent = milestones.find((x) => x.id === id);
      if (parent) return find(parent);
      return;
    }
    return m;
  };
  return find(target);
}
