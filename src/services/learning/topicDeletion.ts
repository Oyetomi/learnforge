import { forgetVisualSupport } from "./preferences";
import type { LocalDatabase } from "../db/storage";
import type { CourseTrack } from "../ai/types";
import { tutoringReadingKey } from "./tutoring";

/** Delete only data owned by this track, including legacy sessions it could open. */
export function deleteTopicData(
  database: LocalDatabase,
  track: Pick<CourseTrack, "id" | "title" | "learningIntent">
): string[] {
  const sessions = database
    .getSessions()
    .filter(
      (s) =>
        s.track_id === track.id ||
        (!s.track_id && !track.learningIntent && s.title === track.title)
    );
  const milestoneIds = sessions.flatMap((s) =>
    database.getMilestones(s.id).map((m) => m.id)
  );
  const checkIds = new Set(
    sessions.flatMap((s) =>
      database
        .getMessages(s.id)
        .flatMap((m) =>
          [m.learning_check?.id, m.check_attempt?.checkId, m.retention_review?.check.id].filter(
            (id): id is string => !!id
          )
        )
    )
  );
  for (const id of milestoneIds) checkIds.add(`${id}:intro-check-v1`);
  // Take a key snapshot because removing keys changes Storage's iteration order.
  const keys = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i)
  ).filter((key): key is string => !!key);
  const ownedKeys = new Set(
    sessions.flatMap((s) => [`learnforge:active-milestone:${s.id}`, `learnforge:retention-dismissed:${s.id}`])
  );
  for (const session of sessions)
    for (const message of database.getMessages(session.id))
      ownedKeys.add(tutoringReadingKey(message.id));
  for (const id of milestoneIds) {
    ownedKeys.add(`learnforge:lesson-step:${id}`);
    ownedKeys.add(`learnforge:lesson-progress:${id}`);
  }
  for (const id of checkIds) {
    ownedKeys.add(`learnforge:check-draft:${id}`);
    ownedKeys.add(`learnforge:visual-support:${id}`);
  }
  for (const key of keys)
    if (
      ownedKeys.has(key) ||
      key.startsWith(`learnforge:composer-draft:${track.id}:`)
    )
      localStorage.removeItem(key);
  let drafts: Record<string, unknown> = {};
  try {
    drafts = JSON.parse(localStorage.getItem("learnforge:code-drafts") || "{}");
  } catch {}
  if (drafts && typeof drafts === "object" && !Array.isArray(drafts)) {
    for (const id of milestoneIds) delete drafts[id];
    localStorage.setItem("learnforge:code-drafts", JSON.stringify(drafts));
  }
  forgetVisualSupport(checkIds);
  if (localStorage.getItem("learnforge:active-track") === track.id)
    localStorage.removeItem("learnforge:active-track");
  for (const s of sessions) database.deleteSession(s.id);
  return milestoneIds;
}
