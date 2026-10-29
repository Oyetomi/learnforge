import { afterEach, describe, expect, it, vi } from "vitest";
import {
  curriculumForTrack,
  curriculumProgress,
  firstAvailableFoundation,
  validCurriculumPlan,
} from "../curriculumPlan";
import { trackFromOutline } from "../../ai/curriculumOutline";
import { LocalDatabase } from "../../db/storage";
import { deleteTopicData } from "../topicDeletion";
import type { ChatMessage, Milestone } from "../../../types";

const outline = () => ({
  title: "Everyday communication",
  destination: "Handle a short familiar exchange",
  practice_mode: "general",
  language: null,
  exclusions: ["Professional translation"],
  modules: [
    {
      title: "Get oriented",
      outcome: "Recognize a familiar situation",
      units: [
        {
          id: "a",
          title: "Notice the purpose",
          outcome: "Identify the purpose of a short exchange",
          assessment: "Identify it in a new situation",
          prerequisite_ids: [],
        },
      ],
    },
    {
      title: "Respond",
      outcome: "Use the next part of an exchange",
      units: [
        {
          id: "b",
          title: "Choose a response",
          outcome: "Respond appropriately in a familiar situation",
          assessment: "Respond to an unseen opening",
          prerequisite_ids: ["a"],
        },
      ],
    },
  ],
});
const options = {
  topic: "Everyday Yoruba",
  interest: "Learn everyday Yoruba",
  destination: "Speak with family",
  startingPoint: "Starting from the beginning",
};
const track = () => trackFromOutline(outline(), options);
afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
    key: (i: number) => [...values.keys()][i] ?? null,
    get length() {
      return values.size;
    },
  });
  return values;
}

describe("curriculum contracts and compatibility", () => {
  it("retains the original goal and creates an outline, without invented ready lessons or mastery", () => {
    const t = track();
    expect(t.curriculum?.originalGoal).toBe(options.interest);
    expect(t.language).toBeNull();
    expect(t.milestones).toHaveLength(2);
    expect(
      t.milestones.every(
        (m) => m.contentStatus === "outline" && !m.lesson && !m.check,
      ),
    ).toBe(true);
    expect(t.milestones[1].prerequisite_ids).toEqual([t.milestones[0].id]);
    expect(t.curriculum?.approvedAt).toBeUndefined();
  });
  it.each([
    "cycle",
    "missing",
    "duplicate",
    "repeated-outcome",
    "blank-assessment",
  ])("rejects %s before approval", (failure) => {
    const p = outline();
    if (failure === "cycle") p.modules[0].units[0].prerequisite_ids = ["b"];
    if (failure === "missing")
      p.modules[1].units[0].prerequisite_ids = ["missing"];
    if (failure === "duplicate") p.modules[1].units[0].id = "a";
    if (failure === "repeated-outcome")
      p.modules[1].units[0].outcome = p.modules[0].units[0].outcome;
    if (failure === "blank-assessment") p.modules[0].units[0].assessment = "";
    expect(() => trackFromOutline(p, options)).toThrow();
  });
  it("rejects a cyclic module overview even when unit dependencies can be topologically sorted", () => {
    const p = track().curriculum!;
    p.modules[0].units.push({
      id: "third",
      title: "Integrate",
      outcome: "Combine two abilities in an exchange",
      assessment: "Apply both abilities",
      prerequisiteIds: [p.modules[1].units[0].id],
    });
    expect(validCurriculumPlan(p)).toBe(false);
  });
  it("wraps old lessons in one module without rewriting IDs, order, lesson content or input", () => {
    const legacy = { ...track(), curriculum: undefined };
    legacy.milestones[0] = {
      ...legacy.milestones[0],
      contentStatus: undefined,
      lesson: "A saved explanation",
    };
    const before = JSON.stringify(legacy);
    const p = curriculumForTrack(legacy);
    expect(p.scope).toBe("focused");
    expect(p.modules).toHaveLength(1);
    expect(p.modules[0].units.map((u) => u.id)).toEqual(
      legacy.milestones.map((m) => m.id),
    );
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it("does not equate visited or legacy completed activities with demonstrated outcomes", () => {
    const t = track(),
      milestones = t.milestones.map((m, i) => ({
        ...m,
        id: `runtime-${i}`,
        curriculum_unit_id: m.id,
        session_id: "s",
        created_at: 0,
        status: "completed" as const,
      }));
    const messages: ChatMessage[] = [
      {
        id: "visit",
        session_id: "s",
        role: "assistant",
        content: "A preview",
        milestone_id: "runtime-0",
        created_at: 0,
      },
    ];
    expect(curriculumProgress(t, milestones, messages)).toEqual({
      demonstrated: 0,
      practising: 0,
      total: 2,
    });
  });
  it("finds an available foundation without clearing prerequisites or granting credit", () => {
    const ms: Milestone[] = [
      {
        id: "a",
        session_id: "s",
        title: "A",
        prompt: "A",
        starter_code: "",
        status: "pending",
        created_at: 0,
        prerequisite_ids: [],
      },
      {
        id: "b",
        session_id: "s",
        title: "B",
        prompt: "B",
        starter_code: "",
        status: "pending",
        created_at: 0,
        prerequisite_ids: ["a"],
      },
    ];
    expect(firstAvailableFoundation(ms[1], ms, new Set())?.id).toBe("a");
    expect(firstAvailableFoundation(ms[1], ms, new Set(["a"]))?.id).toBe("b");
    expect(ms[1].status).toBe("pending");
    expect(ms[1].prerequisite_ids).toEqual(["a"]);
  });
});

describe("durable unit preparation", () => {
  it("seeds all IDs/edges together, prepares one unit and survives reload without reseeding or losing messages", () => {
    storage();
    const db = new LocalDatabase(),
      t = track();
    const s = db.createSession({
      track_id: t.id,
      title: t.title,
      topic: t.tagline,
      language: null,
    });
    const seed = t.milestones.map((m) => ({
      sourceId: m.id,
      curriculum_unit_id: m.id,
      title: m.title,
      prompt: m.prompt,
      starter_code: "",
      prerequisite_ids: m.prerequisite_ids,
      status: "pending" as const,
      content_status: "outline" as const,
    }));
    const ms = db.seedMilestonePlan(s.id, seed);
    expect(ms[1].prerequisite_ids).toEqual([ms[0].id]);
    const message = db.addMessage({
      session_id: s.id,
      role: "user",
      milestone_id: ms[0].id,
      content: "A saved thought",
    });
    const updated = db.prepareMilestone(ms[0].id, {
      lesson: "A concrete explanation",
      starter_code: "",
      check: undefined,
    });
    expect(updated?.id).toBe(ms[0].id);
    expect(updated?.status).toBe("pending");
    const restored = new LocalDatabase();
    expect(restored.seedMilestonePlan(s.id, seed).map((m) => m.id)).toEqual(
      ms.map((m) => m.id),
    );
    expect(restored.getMilestones(s.id)[0].lesson).toBe(
      "A concrete explanation",
    );
    expect(restored.getMessages(s.id)[0]).toEqual(message);
    expect(
      restored.prepareMilestone("missing", { lesson: "x", starter_code: "" }),
    ).toBeNull();
  });
  it("cannot overwrite an already prepared unit or its outcome through preparation", () => {
    storage();
    const db = new LocalDatabase(),
      t = track();
    const s = db.createSession({
      title: t.title,
      topic: t.tagline,
      language: null,
    });
    const [m] = db.seedMilestonePlan(s.id, [
      {
        sourceId: "a",
        title: "Stable title",
        prompt: "Stable outcome",
        starter_code: "",
        status: "active",
        content_status: "outline",
      },
    ]);
    db.prepareMilestone(m.id, { lesson: "First lesson", starter_code: "" });
    expect(
      db.prepareMilestone(m.id, { lesson: "Replacement", starter_code: "" }),
    ).toBeNull();
    expect(db.getMilestones(s.id)[0]).toMatchObject({
      title: "Stable title",
      prompt: "Stable outcome",
      lesson: "First lesson",
    });
  });
  it("removes generated outline children and their evidence when a curriculum is deleted", () => {
    storage();
    const db = new LocalDatabase(),
      t = track();
    const s = db.createSession({
      track_id: t.id,
      title: t.title,
      topic: t.tagline,
      language: null,
    });
    const [m] = db.seedMilestonePlan(s.id, [
      {
        sourceId: "a",
        title: "Unit",
        prompt: "Outcome",
        starter_code: "",
        status: "active",
        content_status: "outline",
      },
    ]);
    db.addMessage({
      session_id: s.id,
      milestone_id: m.id,
      role: "user",
      content: "Private note",
    });
    deleteTopicData(db, t);
    const restored = new LocalDatabase();
    expect(restored.getSessions()).toEqual([]);
    expect(restored.getMilestones(s.id)).toEqual([]);
    expect(restored.getMessages(s.id)).toEqual([]);
  });
  it("bounds repair detours and preserves an explicit return point", () => {
    storage();
    const db = new LocalDatabase(),
      s = db.createSession({ title: "A plan", topic: "Goal", language: null });
    const m = db.createMilestone({
      session_id: s.id,
      title: "A unit",
      prompt: "Outcome",
      starter_code: "",
      status: "active",
    });
    const input = {
      title: "One smaller step",
      reason: "Practise one distinction",
      lesson: "One concrete example",
      check: {
        question: "Which?",
        options: [
          { id: "a", label: "One" },
          { id: "b", label: "Two" },
        ],
        correctOptionIds: ["a"],
        multiple: false,
        explanation: "Why",
      },
    };
    const repair = db.addRepairMilestone(m.id, input)!;
    expect(repair.return_to_milestone_id).toBe(m.id);
    expect(db.addRepairMilestone(repair.id, input)).toBeNull();
    expect(db.addRepairMilestone(m.id, input)).toBeNull();
  });
});
