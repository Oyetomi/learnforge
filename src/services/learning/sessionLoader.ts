import type { ChatMessage, LearningSession, Milestone } from "../../types";
import type { CourseTrack } from "../ai";
import type { LocalDatabase } from "../db/storage";
import { curriculumUnits } from "./curriculumPlan";
import { plannedMilestoneFields } from "./placement";
import { approvedLessonIds, isLessonUnlocked } from "./adaptation";

type SessionStore = Pick<
  LocalDatabase,
  "getSessions" | "createSession" | "getMilestones" | "seedMilestonePlan" | "getMessages" | "addMessage"
>;

export interface OpenedTrackSession {
  session: LearningSession;
  milestones: Milestone[];
  activeMilestone: Milestone | null;
  messages: ChatMessage[];
}

/**
 * The lesson to resume: the remembered one if it is still unlocked, otherwise
 * the active, then the first unfinished unlocked lesson, then the first lesson.
 */
export function chooseActiveMilestone(
  milestones: Milestone[],
  messages: ChatMessage[],
  rememberedId: string | null
): Milestone | null {
  const approved = approvedLessonIds(messages);
  const open = (m: Milestone) => isLessonUnlocked(m, milestones, approved);
  return (
    milestones.find((m) => m.id === rememberedId && open(m)) ||
    milestones.find((m) => m.status === "active" && open(m)) ||
    milestones.find((m) => m.status !== "completed" && open(m)) ||
    milestones[0] ||
    null
  );
}

function seedPlan(database: SessionStore, session: LearningSession, track: CourseTrack) {
  const curriculum = track.curriculum;
  const moduleOf = (unitId: string) =>
    curriculum?.modules.find((module) => module.units.some((u) => u.id === unitId));
  database.seedMilestonePlan(
    session.id,
    track.milestones.map((m) => ({
      sourceId: m.id,
      curriculum_unit_id: m.id,
      curriculum_module_id: moduleOf(m.id)?.id,
      content_status: m.contentStatus,
      curriculum_context: curriculum
        ? {
            goal: curriculum.originalGoal,
            destination: curriculum.destination,
            module: moduleOf(m.id)?.title || "",
            assessment: curriculumUnits(curriculum).find((u) => u.id === m.id)?.assessment || "",
            version: curriculum.version,
          }
        : undefined,
      learning_intent: session.learning_intent,
      references: session.references,
      title: m.title,
      prompt: m.prompt,
      starter_code: m.starter_code,
      test_code: m.test_code,
      lesson: m.lesson,
      visual: m.visual,
      ...plannedMilestoneFields(track, m.id),
      prerequisite_ids: m.prerequisite_ids,
    }))
  );
}

/**
 * Find (or create) the stored session for a topic, seed its lesson plan if it
 * has none, and pick the lesson to resume. A brand-new conversation gets one
 * internal greeting: context for the AI, not lesson material, so it stays out
 * of saved explanations, exports and the knowledge map.
 */
export function openTrackSession(
  database: SessionStore,
  track: CourseTrack,
  rememberedMilestoneId: (sessionId: string) => string | null
): OpenedTrackSession {
  const session =
    database
      .getSessions()
      .find(
        (s) =>
          s.track_id === track.id ||
          (!track.learningIntent && !s.track_id && s.title === track.title)
      ) ||
    database.createSession({
      title: track.title,
      topic: track.tagline,
      language: track.language,
      track_id: track.id,
      learning_intent: track.learningIntent,
      placement: track.placement,
      references: track.references,
    });

  // Seed an existing empty session as well as a newly created session.
  if (database.getMilestones(session.id).length === 0) seedPlan(database, session, track);

  const milestones = database.getMilestones(session.id);
  let messages = database.getMessages(session.id);
  const activeMilestone = chooseActiveMilestone(
    milestones,
    messages,
    rememberedMilestoneId(session.id)
  );

  if (messages.length === 0) {
    const greeting = database.addMessage({
      session_id: session.id,
      role: "assistant",
      internal: true,
      content: `I can help with **${track.title}**. Ask about your challenge, request a hint, or share what you’ve tried. Start with the interactive lesson. ${
        session.language ? "Open coding practice when you want to experiment." : ""
      }`,
    });
    messages = [greeting];
  }

  return { session, milestones, activeMilestone, messages };
}
