import type { ChatMessage, Milestone } from "../../types";
import type { CourseTrack } from "../ai/types";
import { approvedLessonIds } from "./adaptation";
import { validPrerequisiteGraph } from "./roadmap";

export type LearningScope = "curriculum" | "focused";
export type ProjectStructure = "auto" | "single" | "multi";
export interface LocalServiceSpec {
  name: string;
  endpoint: string;
  notes?: string;
}
export interface ProjectEnvironment {
  structure?: ProjectStructure;
  allowExternalPackages?: boolean;
  localServices?: LocalServiceSpec[];
}

const LOCALHOST_ENDPOINT_RE = /^(?:localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})$/i;

export function isLocalhostEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = LOCALHOST_ENDPOINT_RE.exec(value.trim());
  if (!m) return false;
  const port = Number(m[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
export interface CurriculumUnit {
  id: string;
  title: string;
  outcome: string;
  assessment: string;
  prerequisiteIds: string[];
  sourceSectionIds?: string[];
  /** Project mode: identifier of the project this unit belongs to. */
  projectId?: string;
  /** Project mode: what this unit adds to the shared project; absent for concept-only units. */
  projectStep?: string;
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
  sourceDocument?: import("./pdfContents").CurriculumSource;
  /** Project mode: one project built across the units (docs/project-mode.md). */
  project?: import("./project").ProjectPlan;
  /** Multi-project mode: one or more distinct projects built across units. */
  projects?: import("./project").ProjectPlan[];
  /** Optional project architecture & sandbox environment settings (e.g. Go modules, localhost services). */
  projectEnvironment?: ProjectEnvironment;
  approvedAt?: number;
  /** Legacy tracks are wrapped without rewriting their lessons or evidence. */
  legacy?: boolean;
}
export type ResolvedProjectPlan = import("./project").ProjectPlan & { id: string };

export const curriculumUnits = (plan: CurriculumPlan) =>
  plan.modules.flatMap((m) => m.units);

export function planProjects(plan: CurriculumPlan): ResolvedProjectPlan[] {
  if (Array.isArray(plan.projects) && plan.projects.length > 0) {
    return plan.projects.map((p, i) => ({ ...p, id: p.id?.trim() || `p${i + 1}` }));
  }
  if (plan.project) {
    return [{ ...plan.project, id: plan.project.id?.trim() || "main" }];
  }
  return [];
}

export function hasProjectMode(plan: CurriculumPlan): boolean {
  return planProjects(plan).length > 0;
}

export function projectForUnit(
  plan: CurriculumPlan,
  unitId?: string,
): ResolvedProjectPlan | undefined {
  const projects = planProjects(plan);
  if (!projects.length) return undefined;
  if (!unitId) return projects[0];
  const unit = curriculumUnits(plan).find((u) => u.id === unitId);
  if (unit?.projectId) {
    return projects.find((p) => p.id === unit.projectId);
  }
  if (projects.length === 1) return projects[0];
  return undefined;
}

export function unitsForProject(
  plan: CurriculumPlan,
  projectId: string,
): CurriculumUnit[] {
  const projects = planProjects(plan);
  return curriculumUnits(plan).filter(
    (u) =>
      Boolean(u.projectStep?.trim()) &&
      (u.projectId
        ? u.projectId === projectId
        : projects.length === 1 && projects[0].id === projectId),
  );
}

const PROJECT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

/** Structural validity is necessary; it is not a claim of expert-reviewed coverage. */
export function validCurriculumPlan(value: unknown): value is CurriculumPlan {
  const p = value as CurriculumPlan;
  const text = (s: unknown): s is string =>
    typeof s === "string" && !!s.trim() && s.length <= 1200;
  const validProjectSource = (s: unknown) =>
    s === undefined || s === "book" || s === "designed";
  const validProject = (pr: unknown, requireId: boolean): boolean => {
    if (!pr || typeof pr !== "object") return false;
    const item = pr as import("./project").ProjectPlan;
    if (!text(item.title) || !text(item.summary) || !validProjectSource(item.source))
      return false;
    if (requireId) {
      if (!text(item.id) || !PROJECT_ID_RE.test(item.id)) return false;
    } else if (item.id !== undefined && (!text(item.id) || !PROJECT_ID_RE.test(item.id))) {
      return false;
    }
    return true;
  };
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
  const hasProjects = p.project !== undefined || p.projects !== undefined;
  if (hasProjects) {
    if (p.project !== undefined && !validProject(p.project, false)) return false;
    if (p.projects !== undefined) {
      if (
        !Array.isArray(p.projects) ||
        p.projects.length < 1 ||
        p.projects.length > 12 ||
        !p.projects.every((pr) => validProject(pr, true)) ||
        new Set(p.projects.map((pr) => pr.id!.toLowerCase())).size !== p.projects.length
      )
        return false;
    }
    // An emptied step means a concepts-only unit; at least one step must remain.
    if (
      units.some(
        (u) =>
          u.projectStep !== undefined &&
          (typeof u.projectStep !== "string" || u.projectStep.length > 1200),
      )
    )
      return false;
    if (!units.some((u) => u.projectStep?.trim())) return false;
    if (p.projects !== undefined) {
      const projectIds = new Set(p.projects.map((pr) => pr.id!));
      if (
        units.some(
          (u) =>
            u.projectId !== undefined &&
            (typeof u.projectId !== "string" || !projectIds.has(u.projectId)),
        )
      )
        return false;
      if (
        p.projects.length > 1 &&
        units.some(
          (u) =>
            Boolean(u.projectStep?.trim()) &&
            (typeof u.projectId !== "string" || !projectIds.has(u.projectId)),
        )
      )
        return false;
    } else if (p.project !== undefined) {
      const soloId = p.project.id?.trim() || "main";
      if (
        units.some(
          (u) =>
            u.projectId !== undefined &&
            (typeof u.projectId !== "string" || u.projectId !== soloId),
        )
      )
        return false;
    }
  } else if (units.some((u) => u.projectStep !== undefined || u.projectId !== undefined)) {
    return false;
  }
  if (p.projectEnvironment !== undefined) {
    const env = p.projectEnvironment;
    if (!env || typeof env !== "object") return false;
    if (env.structure !== undefined && !["auto", "single", "multi"].includes(env.structure)) return false;
    if (env.allowExternalPackages !== undefined && typeof env.allowExternalPackages !== "boolean") return false;
    if (env.localServices !== undefined) {
      if (
        !Array.isArray(env.localServices) ||
        env.localServices.length > 8 ||
        env.localServices.some(
          (s) =>
            !s ||
            !text(s.name) ||
            s.name.length > 80 ||
            !isLocalhostEndpoint(s.endpoint) ||
            (s.notes !== undefined && (typeof s.notes !== "string" || s.notes.length > 200))
        )
      )
        return false;
    }
  }
  if (p.sourceDocument) {
    const source = p.sourceDocument;
    if (!text(source.name) || (source.pageCount !== undefined && (!Number.isInteger(source.pageCount) || source.pageCount < 1)) ||
      (source.fingerprint !== undefined && (typeof source.fingerprint !== "string" || !source.fingerprint || source.fingerprint.length > 500)) ||
      !Array.isArray(source.sections) || !source.sections.length || source.sections.length > 48 ||
      source.sections.some(s => !s || !text(s.id) || !text(s.title) || !Number.isInteger(s.level) || s.level < 0 || s.level > 8 ||
        (s.pageStart !== undefined && (!Number.isInteger(s.pageStart) || s.pageStart < 1)) ||
        (s.pageEnd !== undefined && (!s.pageStart || !Number.isInteger(s.pageEnd) || s.pageEnd < s.pageStart)))) return false;
    const ids = new Set(source.sections.map(s => s.id));
    if (ids.size !== source.sections.length || units.some(u => !Array.isArray(u.sourceSectionIds) || !u.sourceSectionIds.length ||
      u.sourceSectionIds.some(id => !ids.has(id)))) return false;
    if ([...ids].some(id => !units.some(u => u.sourceSectionIds?.includes(id)))) return false;
  }
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
      m.prerequisite_ids ?? (index > 0 ? [milestones[index - 1].id] : []);
    for (const id of parents) {
      if (approved.has(id)) continue;
      const parent = milestones.find((x) => x.id === id);
      if (parent) {
        const candidate = find(parent);
        if (candidate) return candidate;
      }
    }
    return m;
  };
  return find(target);
}
