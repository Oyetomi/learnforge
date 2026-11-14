import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseTrack } from "../../ai";

let LocalDatabase: typeof import("../../db/storage").LocalDatabase;
let openTrackSession: typeof import("../sessionLoader").openTrackSession;

beforeEach(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.resetModules();
  LocalDatabase = (await import("../../db/storage")).LocalDatabase;
  openTrackSession = (await import("../sessionLoader")).openTrackSession;
});
afterEach(() => vi.unstubAllGlobals());

const track = {
  id: "fractions",
  title: "Fractions",
  tagline: "Parts of a whole",
  language: null,
  milestones: [
    { id: "halves", title: "Halves", prompt: "Halves", starter_code: "", lesson: "Two equal parts." },
    { id: "quarters", title: "Quarters", prompt: "Quarters", starter_code: "", lesson: "Four equal parts.", prerequisite_ids: ["halves"] },
  ],
} as unknown as CourseTrack;

describe("openTrackSession", () => {
  it("creates the session, seeds its plan once and adds one internal greeting", () => {
    const db = new LocalDatabase({ indexedDB: null });
    const first = openTrackSession(db, track, () => null);
    expect(first.session.track_id).toBe("fractions");
    expect(first.milestones.map((m) => m.title)).toEqual(["Halves", "Quarters"]);
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].internal).toBe(true);
    // Seeded prerequisites point at the stored ids, not the outline ids.
    expect(first.milestones[1].prerequisite_ids).toEqual([first.milestones[0].id]);

    const again = openTrackSession(db, track, () => null);
    expect(again.session.id).toBe(first.session.id);
    expect(again.milestones.map((m) => m.id)).toEqual(first.milestones.map((m) => m.id));
    expect(again.messages).toHaveLength(1);
  });

  it("resumes the remembered lesson only while it is unlocked", () => {
    const db = new LocalDatabase({ indexedDB: null });
    const { milestones } = openTrackSession(db, track, () => null);
    const [halves, quarters] = milestones;
    // Quarters is locked behind halves, so a remembered quarters id is ignored.
    expect(openTrackSession(db, track, () => quarters.id).activeMilestone?.id).toBe(halves.id);
    expect(openTrackSession(db, track, () => halves.id).activeMilestone?.id).toBe(halves.id);
  });
});
