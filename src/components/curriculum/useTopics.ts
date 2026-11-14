import { useState } from "react";
import { STARTER_TRACKS, type CourseTrack } from "../../services/ai";
import { db } from "../../services/db";
import { savedTopicIds, topicsInWorkspace } from "../../services/learning/topics";

const STARTER_IDS = STARTER_TRACKS.map((track) => track.id);
const isStarter = (track: CourseTrack) => STARTER_IDS.includes(track.id);

function saveMembership(added: string[], removed: string[]) {
  try {
    localStorage.setItem("learnforge:added-starters", JSON.stringify(added));
    localStorage.setItem("learnforge:removed-topics", JSON.stringify(removed));
  } catch {}
}

/**
 * The learner's topics: built-in starters they added plus topics they created,
 * minus any they removed. Created topics are persisted through the database;
 * starter membership is a small preference in localStorage.
 */
export function useTopics() {
  const [tracks, setTracks] = useState<CourseTrack[]>(() => [
    ...STARTER_TRACKS,
    ...db.getCustomTracks<CourseTrack>(),
  ]);
  const [addedStarterIds, setAddedStarterIds] = useState(() => {
    let current = "";
    try {
      current = localStorage.getItem("learnforge:active-track") || "";
    } catch {}
    return savedTopicIds("learnforge:added-starters", STARTER_IDS.includes(current) ? [current] : []);
  });
  const [removedTopicIds, setRemovedTopicIds] = useState(() =>
    savedTopicIds("learnforge:removed-topics")
  );
  const visibleTracks = topicsInWorkspace(tracks, STARTER_IDS, addedStarterIds, removedTopicIds);

  return {
    tracks,
    visibleTracks,
    removedTopicIds,
    /** Save an approved topic before showing it; throws so the review can stay open. */
    addTopic(track: CourseTrack) {
      const updated = [...tracks, track];
      if (!db.setCustomTracks(updated.filter((t) => !isStarter(t))))
        throw new Error("Couldn’t save this topic. Free some space and try again.");
      setTracks(updated);
    },
    /** Forget deleted topics everywhere; returns the topics still in the workspace. */
    removeTopics(ids: Iterable<string>): CourseTrack[] {
      const deleting = new Set(ids);
      const remaining = tracks.filter((t) => !deleting.has(t.id));
      db.setCustomTracks(remaining.filter((t) => !isStarter(t)));
      setTracks(remaining);
      const added = addedStarterIds.filter((id) => !deleting.has(id));
      const removed = removedTopicIds.filter((id) => !deleting.has(id));
      setAddedStarterIds(added);
      setRemovedTopicIds(removed);
      saveMembership(added, removed);
      return topicsInWorkspace(remaining, STARTER_IDS, added, removed);
    },
  };
}
