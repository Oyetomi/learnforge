/** Workspace membership also reads legacy hidden-topic ids until they are permanently cleared. */
export function topicsInWorkspace<T extends { id: string }>(
  topics: T[],
  starterIds: string[],
  addedStarterIds: string[],
  removedIds: string[]
): T[] {
  return topics
    .filter(
      (topic) =>
        !removedIds.includes(topic.id) &&
        (!starterIds.includes(topic.id) || addedStarterIds.includes(topic.id))
    )
    .sort(
      (a, b) =>
        Number(starterIds.includes(a.id)) - Number(starterIds.includes(b.id))
    );
}

export function savedTopicIds(key: string, fallback: string[] = []): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(saved)
      ? [...new Set(saved.filter((id): id is string => typeof id === "string"))]
      : fallback;
  } catch {
    return fallback;
  }
}
