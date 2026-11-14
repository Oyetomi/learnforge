import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

let LocalDatabase: typeof import("../storage").LocalDatabase;
let values: Map<string, string>;

beforeEach(async () => {
  values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.resetModules();
  LocalDatabase = (await import("../storage")).LocalDatabase;
});
afterEach(() => vi.unstubAllGlobals());

async function storedKeys(factory: IDBFactory): Promise<string[]> {
  const idb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("learnforge-records", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = idb.transaction("records").objectStore("records").getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  idb.close();
  return keys.map(String).sort();
}

describe("IndexedDB learning records", () => {
  it("migrates localStorage records once and removes the legacy copy after commit", async () => {
    values.set("learnforge:initialized_v1", "true");
    values.set("learnforge:sessions", JSON.stringify([{ id: "s1", title: "Fractions", topic: "Parts", language: null, created_at: 1, updated_at: 1 }]));
    values.set("learnforge:messages", JSON.stringify([{ id: "m1", session_id: "s1", role: "assistant", content: "Hello", created_at: 1 }]));
    values.set("learnforge:milestones", JSON.stringify([{ id: "u1", session_id: "s1", title: "Halves", prompt: "", starter_code: "", status: "active", created_at: 1 }]));
    values.set("learnforge:custom-tracks", JSON.stringify([{ id: "t1", title: "Fractions" }]));
    const factory = new IDBFactory();

    const first = new LocalDatabase({ indexedDB: factory });
    // Legacy records are usable before the database has opened.
    expect(first.getMessages("s1")).toHaveLength(1);
    await first.ready();
    expect(first.getStorageBackend()).toBe("indexeddb");
    expect(values.has("learnforge:messages")).toBe(false);
    expect(values.has("learnforge:sessions")).toBe(false);
    expect(values.has("learnforge:custom-tracks")).toBe(false);

    const reopened = new LocalDatabase({ indexedDB: factory });
    await reopened.ready();
    expect(reopened.getSessions().map((s) => s.id)).toEqual(["s1"]);
    expect(reopened.getMessages("s1")[0].content).toBe("Hello");
    expect(reopened.getMilestones("s1")[0].title).toBe("Halves");
    expect(reopened.getCustomTracks()).toEqual([{ id: "t1", title: "Fractions" }]);
  });

  it("stores each conversation as its own record and deletes it with the session", async () => {
    const factory = new IDBFactory();
    const db = new LocalDatabase({ indexedDB: factory });
    await db.ready();
    const a = db.createSession({ title: "A", topic: "a", language: null });
    const b = db.createSession({ title: "B", topic: "b", language: null });
    db.addMessage({ session_id: a.id, role: "user", content: "one" });
    db.addMessage({ session_id: b.id, role: "user", content: "two" });
    await db.whenSaved();
    expect(await storedKeys(factory)).toEqual(
      [`messages:${a.id}`, `messages:${b.id}`, "milestones", "sessions", "srs_cards", "custom_tracks"].sort()
    );
    // Nothing large lands in localStorage on the IndexedDB backend.
    expect(values.has("learnforge:messages")).toBe(false);

    db.deleteSession(a.id);
    await db.whenSaved();
    expect(await storedKeys(factory)).not.toContain(`messages:${a.id}`);
    const reopened = new LocalDatabase({ indexedDB: factory });
    await reopened.ready();
    expect(reopened.getSessions().map((s) => s.id)).toEqual([b.id]);
    expect(reopened.getMessages(b.id)[0].content).toBe("two");
  });

  it("keeps writes made before the database finished opening", async () => {
    const factory = new IDBFactory();
    const db = new LocalDatabase({ indexedDB: factory });
    const session = db.createSession({ title: "Early", topic: "e", language: null });
    db.addMessage({ session_id: session.id, role: "user", content: "before ready" });
    db.setCustomTracks([{ id: "t2" }]);
    await db.whenSaved();
    const reopened = new LocalDatabase({ indexedDB: factory });
    await reopened.ready();
    expect(reopened.getMessages(session.id)[0].content).toBe("before ready");
    expect(reopened.getCustomTracks()).toEqual([{ id: "t2" }]);
  });

  it("falls back to localStorage when IndexedDB cannot open", async () => {
    const broken = { open: () => { throw new Error("denied"); } } as unknown as IDBFactory;
    const db = new LocalDatabase({ indexedDB: broken });
    await db.ready();
    expect(db.getStorageBackend()).toBe("local");
    const session = db.createSession({ title: "Fallback", topic: "f", language: null });
    db.addMessage({ session_id: session.id, role: "user", content: "kept" });
    expect(JSON.parse(values.get("learnforge:messages")!)[0].content).toBe("kept");
    expect(db.setCustomTracks([{ id: "t3" }])).toBe(true);
    expect(JSON.parse(values.get("learnforge:custom-tracks")!)).toEqual([{ id: "t3" }]);
  });
});
