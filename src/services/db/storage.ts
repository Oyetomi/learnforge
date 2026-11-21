import {
  LearningSession,
  LearningReference,
  ChatMessage,
  Milestone,
  SRSCard,
  FSRSRating,
  RetentionReview,
} from "../../types";
import { getDueCards, scheduleCard } from "../fsrs";
import { retentionRating } from "../learning/retention";

const STORAGE_KEYS = {
  SESSIONS: "learnforge:sessions",
  MESSAGES: "learnforge:messages",
  MILESTONES: "learnforge:milestones",
  SRS_CARDS: "learnforge:srs_cards",
  INITIALIZED: "learnforge:initialized_v1",
  CUSTOM_TRACKS: "learnforge:custom-tracks",
};

const IDB_NAME = "learnforge-records";
const IDB_STORE = "records";
const IDB_KEYS = {
  SESSIONS: "sessions",
  MILESTONES: "milestones",
  CARDS: "srs_cards",
  TRACKS: "custom_tracks",
  MESSAGES_PREFIX: "messages:",
};

export const STORAGE_STATUS_EVENT = "learnforge:storage-status";
export const STORAGE_READY_EVENT = "learnforge:storage-ready";

export interface StorageStatusDetail {
  persisted: boolean;
  error?: string;
}

function sameReferences(
  a?: LearningReference[],
  b?: LearningReference[]
): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (ref, idx) =>
      ref.id === b[idx].id &&
      ref.name === b[idx].name &&
      ref.truncated === b[idx].truncated &&
      ref.content === b[idx].content
  );
}

export class LocalDatabase {
  private sessions: Map<string, LearningSession> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map(); // sessionId -> messages
  private milestones: Map<string, Milestone[]> = new Map(); // sessionId -> milestones
  private cards: Map<string, SRSCard> = new Map();
  private customTracks: unknown[] = [];
  private inMemoryOnly = false;
  private persisted = true;
  private persistenceError = "";
  private failedKeys: Set<string> = new Set();
  private flushingPending = false;

  /*
   * Persistence backends.
   *  - "indexeddb": the default wherever IndexedDB exists. Records are written
   *    behind the synchronous in-memory API, one record per session's messages,
   *    so an answer rewrites one session rather than every conversation.
   *  - "local": localStorage, used when IndexedDB is missing or fails to open.
   * Data from older localStorage builds is migrated once, and the legacy keys
   * are removed only after IndexedDB has committed the copy.
   */
  private backend: "pending" | "indexeddb" | "local" = "local";
  private idbFactory: IDBFactory | null;
  private idb: IDBDatabase | null = null;
  private dirty: Set<string> = new Set();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight: Promise<void> | null = null;
  private legacyFound = false;
  private readyPromise: Promise<void>;

  constructor(options: { indexedDB?: IDBFactory | null } = {}) {
    this.idbFactory =
      options.indexedDB !== undefined
        ? options.indexedDB
        : typeof indexedDB !== "undefined"
        ? indexedDB
        : null;
    this.init();
    this.readyPromise = this.idbFactory ? this.openIndexedDb(this.idbFactory) : Promise.resolve();
    if (this.idbFactory && typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const flushNow = () => { if (this.dirty.size) void this.flush(); };
      window.addEventListener("pagehide", flushNow);
      document.addEventListener?.("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
    }
  }

  /** Resolves once stored records are loaded (and any legacy data migrated). */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Resolves when every pending write has been committed or has failed. */
  async whenSaved(): Promise<void> {
    await this.readyPromise;
    while (this.dirty.size || this.flushInFlight) {
      if (this.flushInFlight) await this.flushInFlight;
      else await this.flush();
      if (!this.persisted) return;
    }
  }

  getStorageBackend(): "indexeddb" | "local" | "memory" | "pending" {
    return this.inMemoryOnly ? "memory" : this.backend;
  }

  isPersisted(): boolean {
    return this.persisted;
  }

  getPersistenceError(): string {
    return this.persistenceError;
  }

  getStorageStatus(): StorageStatusDetail {
    return {
      persisted: this.persisted,
      error: this.persistenceError || undefined,
    };
  }

  private emitStorageStatus(persisted: boolean, error = "") {
    this.persisted = persisted;
    this.persistenceError = error;
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(
        new CustomEvent<StorageStatusDetail>(STORAGE_STATUS_EVENT, {
          detail: this.getStorageStatus(),
        })
      );
    }
  }

  private init() {
    let storage: Storage | null = null;
    try {
      storage = localStorage;
      storage.getItem(STORAGE_KEYS.INITIALIZED);
    } catch (e) {
      storage = null;
    }
    if (this.idbFactory) {
      this.backend = "pending";
      // Load legacy records synchronously so the app can render immediately.
      if (storage) this.loadFromStorage();
      return;
    }
    if (!storage) {
      console.warn("LocalStorage unavailable, running in-memory mode");
      this.inMemoryOnly = true;
      return;
    }
    this.backend = "local";
    if (!storage.getItem(STORAGE_KEYS.INITIALIZED)) {
      this.initializeEmptyStorage();
    } else {
      this.loadFromStorage();
    }
  }

  private initializeEmptyStorage() {
    // New users start with their own topics. Starter courses are explicitly added.
    this.persistAll();
    try {
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, "true");
    } catch {}
  }

  private hydrateMilestone(milestone: Milestone): Milestone {
    const sessionRefs = this.sessions.get(milestone.session_id)?.references;
    if (!milestone.references && sessionRefs) {
      return { ...milestone, references: sessionRefs };
    }
    return { ...milestone };
  }

  private dehydrateMilestone(milestone: Milestone): Milestone {
    const sessionRefs = this.sessions.get(milestone.session_id)?.references;
    if (sameReferences(milestone.references, sessionRefs)) {
      const { references: _omit, ...rest } = milestone;
      return rest;
    }
    return milestone;
  }

  private applySessions(arr: LearningSession[]) {
    arr.forEach((s) => { if (!this.sessions.has(s.id)) this.sessions.set(s.id, s); });
  }
  private applyMilestones(arr: Milestone[]) {
    const loaded = new Map<string, Milestone[]>();
    arr.forEach((m) => {
      const list = loaded.get(m.session_id) || [];
      list.push(this.hydrateMilestone(m));
      loaded.set(m.session_id, list);
    });
    loaded.forEach((list, sessionId) => { if (!this.milestones.has(sessionId)) this.milestones.set(sessionId, list); });
  }
  private applyMessages(arr: ChatMessage[]) {
    const loaded = new Map<string, ChatMessage[]>();
    arr.forEach((msg) => {
      const list = loaded.get(msg.session_id) || [];
      list.push(msg);
      loaded.set(msg.session_id, list);
    });
    loaded.forEach((list, sessionId) => { if (!this.messages.has(sessionId)) this.messages.set(sessionId, list); });
  }
  private applyCards(arr: SRSCard[]) {
    arr.forEach((c) => { if (!this.cards.has(c.id)) this.cards.set(c.id, c); });
  }

  private loadFromStorage() {
    try {
      let foundAny = false;
      const sessionsJson = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      if (sessionsJson) {
        this.applySessions(JSON.parse(sessionsJson));
        foundAny = true;
      }
      const milestonesJson = localStorage.getItem(STORAGE_KEYS.MILESTONES);
      if (milestonesJson) {
        this.applyMilestones(JSON.parse(milestonesJson));
        foundAny = true;
      }
      const messagesJson = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (messagesJson) {
        this.applyMessages(JSON.parse(messagesJson));
        foundAny = true;
      }
      const cardsJson = localStorage.getItem(STORAGE_KEYS.SRS_CARDS);
      if (cardsJson) {
        this.applyCards(JSON.parse(cardsJson));
        foundAny = true;
      }
      const tracksJson = localStorage.getItem(STORAGE_KEYS.CUSTOM_TRACKS);
      if (tracksJson) {
        const tracks = JSON.parse(tracksJson);
        if (Array.isArray(tracks)) {
          this.customTracks = tracks;
          foundAny = true;
        }
      }
      if (foundAny) this.legacyFound = true;
    } catch (e) {
      console.error("Failed to parse data from localStorage:", e);
    }
  }

  private emitStorageReady() {
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent(STORAGE_READY_EVENT));
    }
  }

  private mergeCustomTracks(existing: unknown[]) {
    if (!this.customTracks.length) {
      this.customTracks = existing;
      return;
    }
    const seen = new Set(
      this.customTracks
        .map((t) => (t && typeof t === "object" && "id" in t ? String((t as { id: unknown }).id) : ""))
        .filter(Boolean)
    );
    const merged = [...this.customTracks];
    for (const item of existing) {
      const id = item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : "";
      if (!id || !seen.has(id)) {
        merged.push(item);
        if (id) seen.add(id);
      }
    }
    this.customTracks = merged;
  }

  // --- IndexedDB backend ---
  private async openIndexedDb(factory: IDBFactory): Promise<void> {
    try {
      const idb = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(IDB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(IDB_STORE))
            request.result.createObjectStore(IDB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Storage upgrade blocked by another window."));
      });
      idb.onversionchange = () => idb.close();
      const records = await new Promise<{ key: IDBValidKey; value: unknown }[]>((resolve, reject) => {
        const out: { key: IDBValidKey; value: unknown }[] = [];
        const request = idb.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return resolve(out);
          out.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
      for (const { key, value } of records) {
        if (!Array.isArray(value)) continue;
        if (key === IDB_KEYS.SESSIONS) this.applySessions(value);
        else if (key === IDB_KEYS.MILESTONES) this.applyMilestones(value);
        else if (key === IDB_KEYS.CARDS) this.applyCards(value);
        else if (key === IDB_KEYS.TRACKS) this.mergeCustomTracks(value);
        else if (typeof key === "string" && key.startsWith(IDB_KEYS.MESSAGES_PREFIX)) this.applyMessages(value);
      }
      this.idb = idb;
      this.backend = "indexeddb";
      if (this.legacyFound) {
        // Migrate: memory holds merged legacy, existing IDB records, and any edits since launch.
        this.markAllDirty();
        await this.flush();
        if (!this.dirty.size && this.persisted) this.removeLegacyKeys();
      } else if (this.dirty.size) {
        this.scheduleFlush();
      }
    } catch (e) {
      console.warn("IndexedDB unavailable, using localStorage:", e);
      this.idb = null;
      this.backend = "local";
      this.dirty.clear();
      try {
        localStorage.getItem(STORAGE_KEYS.INITIALIZED);
        this.persistAll();
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, "true");
      } catch {
        this.inMemoryOnly = true;
      }
    } finally {
      this.emitStorageReady();
    }
  }

  private removeLegacyKeys() {
    for (const key of [STORAGE_KEYS.SESSIONS, STORAGE_KEYS.MILESTONES, STORAGE_KEYS.MESSAGES, STORAGE_KEYS.SRS_CARDS, STORAGE_KEYS.CUSTOM_TRACKS]) {
      try { localStorage.removeItem?.(key); } catch {}
    }
    this.legacyFound = false;
  }

  private markAllDirty() {
    this.dirty.add(IDB_KEYS.SESSIONS);
    this.dirty.add(IDB_KEYS.MILESTONES);
    this.dirty.add(IDB_KEYS.CARDS);
    this.dirty.add(IDB_KEYS.TRACKS);
    this.messages.forEach((_list, sessionId) => this.dirty.add(IDB_KEYS.MESSAGES_PREFIX + sessionId));
    this.scheduleFlush();
  }

  private markDirty(key: string) {
    this.dirty.add(key);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (!this.idb || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 0);
  }

  /** A plain copy of what a record should hold now; undefined deletes it. */
  private recordValue(key: string): unknown[] | undefined {
    if (key === IDB_KEYS.SESSIONS) return Array.from(this.sessions.values());
    if (key === IDB_KEYS.CARDS) return Array.from(this.cards.values());
    if (key === IDB_KEYS.TRACKS) return this.customTracks;
    if (key === IDB_KEYS.MILESTONES) {
      const all: Milestone[] = [];
      this.milestones.forEach((list) => list.forEach((m) => all.push(this.dehydrateMilestone(m))));
      return all;
    }
    if (key.startsWith(IDB_KEYS.MESSAGES_PREFIX)) return this.messages.get(key.slice(IDB_KEYS.MESSAGES_PREFIX.length));
    return undefined;
  }

  private flush(): Promise<void> {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (this.flushInFlight) return this.flushInFlight.then(() => (this.dirty.size ? this.flush() : undefined));
    const idb = this.idb;
    if (!idb || !this.dirty.size) return Promise.resolve();
    const keys = Array.from(this.dirty);
    this.dirty.clear();
    const run = new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      for (const key of keys) {
        const value = this.recordValue(key);
        // JSON round trip: a structured, detached copy of plain learning records.
        if (value === undefined) store.delete(key);
        else store.put(JSON.parse(JSON.stringify(value)), key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Storage write aborted."));
    })
      .then(() => {
        if (!this.persisted) this.emitStorageStatus(true, "");
      })
      .catch((e) => {
        keys.forEach((key) => this.dirty.add(key));
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("Storage persistence failed:", e);
        this.emitStorageStatus(false, msg || "Saving learning records failed.");
      })
      .finally(() => {
        this.flushInFlight = null;
        // Writes made during this flush go out next; failed keys wait for the next change.
        if (this.persisted && this.dirty.size) this.scheduleFlush();
      });
    this.flushInFlight = run;
    return run;
  }

  // --- localStorage backend ---
  private writeKey(key: string, value: string): boolean {
    if (this.inMemoryOnly) return true;
    try {
      localStorage.setItem(key, value);
      this.failedKeys.delete(key);
      if (!this.flushingPending && this.failedKeys.size > 0) {
        this.flushPending(key);
      }
      if (this.failedKeys.size === 0 && !this.persisted) {
        this.emitStorageStatus(true, "");
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Storage persistence failed:", e);
      this.failedKeys.add(key);
      this.emitStorageStatus(false, msg || "Local storage quota exceeded.");
      return false;
    }
  }

  private flushPending(skipKey?: string) {
    if (this.flushingPending || this.failedKeys.size === 0) return;
    this.flushingPending = true;
    try {
      for (const pendingKey of Array.from(this.failedKeys)) {
        if (pendingKey === skipKey) continue;
        if (pendingKey === STORAGE_KEYS.SESSIONS) this.persistSessions();
        else if (pendingKey === STORAGE_KEYS.MILESTONES) this.persistMilestones();
        else if (pendingKey === STORAGE_KEYS.MESSAGES) this.persistMessages();
        else if (pendingKey === STORAGE_KEYS.SRS_CARDS) this.persistCards();
        else if (pendingKey === STORAGE_KEYS.CUSTOM_TRACKS) this.persistCustomTracks();
      }
    } finally {
      this.flushingPending = false;
    }
  }

  private get usesIndexedDb() {
    return this.backend === "indexeddb" || this.backend === "pending";
  }

  private persistSessions() {
    if (this.usesIndexedDb) return this.markDirty(IDB_KEYS.SESSIONS);
    this.writeKey(
      STORAGE_KEYS.SESSIONS,
      JSON.stringify(Array.from(this.sessions.values()))
    );
  }

  private persistMilestones() {
    if (this.usesIndexedDb) return this.markDirty(IDB_KEYS.MILESTONES);
    const allMilestones: Milestone[] = [];
    this.milestones.forEach((list) => {
      for (const milestone of list) {
        allMilestones.push(this.dehydrateMilestone(milestone));
      }
    });
    this.writeKey(STORAGE_KEYS.MILESTONES, JSON.stringify(allMilestones));
  }

  /** With a session id, IndexedDB rewrites only that conversation. */
  private persistMessages(sessionId?: string) {
    if (this.usesIndexedDb) {
      if (sessionId) return this.markDirty(IDB_KEYS.MESSAGES_PREFIX + sessionId);
      this.messages.forEach((_list, id) => this.dirty.add(IDB_KEYS.MESSAGES_PREFIX + id));
      return this.scheduleFlush();
    }
    const allMessages: ChatMessage[] = [];
    this.messages.forEach((list) => allMessages.push(...list));
    this.writeKey(STORAGE_KEYS.MESSAGES, JSON.stringify(allMessages));
  }

  private persistCards() {
    if (this.usesIndexedDb) return this.markDirty(IDB_KEYS.CARDS);
    this.writeKey(
      STORAGE_KEYS.SRS_CARDS,
      JSON.stringify(Array.from(this.cards.values()))
    );
  }

  private persistCustomTracks(): boolean {
    if (this.usesIndexedDb) { this.markDirty(IDB_KEYS.TRACKS); return true; }
    return this.writeKey(STORAGE_KEYS.CUSTOM_TRACKS, JSON.stringify(this.customTracks));
  }

  private persistAll() {
    this.flushingPending = true;
    try {
      this.persistSessions();
      this.persistMilestones();
      this.persistMessages();
      this.persistCards();
      this.persistCustomTracks();
    } finally {
      this.flushingPending = false;
    }
    if (this.failedKeys.size === 0 && !this.persisted) {
      this.emitStorageStatus(true, "");
    }
  }

  // --- Learner-created topics (approved outlines and curricula) ---
  getCustomTracks<T = unknown>(): T[] {
    return [...this.customTracks] as T[];
  }

  /** Returns false when the localStorage backend could not save the outline. */
  setCustomTracks(tracks: unknown[]): boolean {
    const previous = this.customTracks;
    this.customTracks = [...tracks];
    const saved = this.persistCustomTracks();
    if (!saved) {
      this.customTracks = previous;
      this.failedKeys.delete(STORAGE_KEYS.CUSTOM_TRACKS);
    }
    return saved;
  }

  // --- Sessions CRUD ---
  getSessions(): LearningSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updated_at - a.updated_at
    );
  }

  getSession(id: string): LearningSession | undefined {
    return this.sessions.get(id);
  }

  createSession(
    session: Omit<LearningSession, "id" | "created_at" | "updated_at">
  ): LearningSession {
    const now = Date.now();
    const id = `session-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const newSession: LearningSession = {
      ...session,
      id,
      created_at: now,
      updated_at: now,
    };
    this.sessions.set(id, newSession);
    this.persistSessions();
    return newSession;
  }

  deleteSession(id: string): void {
    const session = this.sessions.get(id);
    const milestones = this.milestones.get(id) || [];
    const ids = new Set(milestones.map((m) => m.id));
    const legacyTopics = new Set(
      milestones.map((m) => `${session?.title}: ${m.title}`)
    );
    for (const [cardId, card] of this.cards) {
      const owned =
        card.session_id === id ||
        (card.milestone_id && ids.has(card.milestone_id));
      const legacy =
        !card.session_id &&
        !card.milestone_id &&
        legacyTopics.has(card.topic) &&
        !this.getSessions().some(
          (other) =>
            other.id !== id &&
            other.title === session?.title &&
            this.getMilestones(other.id).some(
              (m) => `${other.title}: ${m.title}` === card.topic
            )
        );
      if (owned || legacy) this.cards.delete(cardId);
    }
    this.sessions.delete(id);
    this.messages.delete(id);
    this.milestones.delete(id);
    if (this.usesIndexedDb) {
      this.dirty.add(IDB_KEYS.SESSIONS);
      this.dirty.add(IDB_KEYS.MILESTONES);
      this.dirty.add(IDB_KEYS.CARDS);
      this.dirty.add(IDB_KEYS.MESSAGES_PREFIX + id);
      this.scheduleFlush();
    } else {
      this.persistAll();
    }
  }

  // --- Messages CRUD ---
  getMessages(sessionId: string): ChatMessage[] {
    return [...(this.messages.get(sessionId) || [])];
  }

  addMessage(msg: Omit<ChatMessage, "id" | "created_at">): ChatMessage {
    const fullMsg: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: Date.now(),
    };
    const list = this.messages.get(msg.session_id) || [];
    list.push(fullMsg);
    this.messages.set(msg.session_id, list);

    // Update session updated_at
    const session = this.sessions.get(msg.session_id);
    if (session) {
      session.updated_at = Date.now();
      this.sessions.set(msg.session_id, session);
      this.persistSessions();
    }

    this.persistMessages(msg.session_id);
    return fullMsg;
  }

  disputeCheckAttempt(sessionId: string, checkId: string): boolean {
    const message = this.messages.get(sessionId)?.find((m) => m.check_attempt?.checkId === checkId);
    const attempt = message?.check_attempt;
    if (!message || !attempt || attempt.grading?.reviewRequested) return false;
    message.check_attempt = { ...attempt, correct: false, assisted: true,
      grading: { ...(attempt.grading || { feedback: "The learner asked to review this question and its answer.", criteria: [] }), status: "uncertain", reviewRequested: true } };
    message.content += "\nFeedback disputed by learner; this result is unresolved and excluded from readiness.";
    this.persistMessages(sessionId);
    return true;
  }

  finishRetentionReview(sessionId: string, messageId: string, skipRating = false): boolean {
    const message = this.messages.get(sessionId)?.find((m) => m.id === messageId);
    const review = message?.retention_review;
    const card = review && this.cards.get(review.cardId);
    if (!review || review.finishedAt !== undefined || !card || card.session_id !== sessionId ||
      review.check.milestoneId !== card.milestone_id || review.attempt.milestoneId !== card.milestone_id) return false;
    const rating = skipRating ? null : retentionRating(review.check, review.attempt);
    review.finishedAt = Date.now();
    if (rating !== null) this.rateCard(card.id, rating);
    this.persistMessages(sessionId);
    return true;
  }

  disputeRetentionReview(sessionId: string, messageId: string): RetentionReview | null {
    const review = this.messages.get(sessionId)?.find((m) => m.id === messageId)?.retention_review;
    if (!review || review.attempt.grading?.reviewRequested || review.finishedAt !== undefined) return null;
    review.attempt = { ...review.attempt, correct: false, assisted: true,
      grading: { ...(review.attempt.grading || { feedback: "The learner asked to review this question and its answer.", criteria: [] }), status: "uncertain", reviewRequested: true } };
    this.persistMessages(sessionId);
    return review;
  }

  // --- Milestones CRUD ---
  getMilestones(sessionId: string): Milestone[] {
    return (this.milestones.get(sessionId) || []).map((milestone) =>
      this.hydrateMilestone(milestone)
    );
  }

  createMilestone(milestone: Omit<Milestone, "id" | "created_at">): Milestone {
    const session = this.sessions.get(milestone.session_id);
    const fullM: Milestone = {
      ...milestone,
      learning_intent: milestone.learning_intent || session?.learning_intent,
      references: milestone.references ?? session?.references,
      id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: Date.now(),
    };
    const list = this.milestones.get(milestone.session_id) || [];
    list.push(fullM);
    this.milestones.set(milestone.session_id, list);
    this.persistMilestones();
    return this.hydrateMilestone(fullM);
  }

  /** Seed an approved outline in one storage snapshot, with all runtime edges mapped. */
  seedMilestonePlan(sessionId: string, templates: (Omit<Milestone, "id" | "session_id" | "created_at"> & { sourceId: string })[]): Milestone[] {
    if ((this.milestones.get(sessionId) || []).length) return this.getMilestones(sessionId);
    const sessionRefs = this.sessions.get(sessionId)?.references;
    const ids = new Map(templates.map(t => [t.sourceId, `m-${crypto.randomUUID()}`]));
    const list: Milestone[] = templates.map(({ sourceId, ...t }) => ({ ...t,
      references: t.references ?? sessionRefs,
      id: ids.get(sourceId)!, session_id: sessionId, created_at: Date.now(),
      prerequisite_ids: t.prerequisite_ids?.map(id => ids.get(id)!).filter(Boolean),
    }));
    this.milestones.set(sessionId, list);
    this.persistMilestones();
    return this.getMilestones(sessionId);
  }

  addRepairMilestone(
    parentId: string,
    input: {
      title: string;
      lesson: string;
      reason: string;
      check: import("../../types").LearningCheckSpec;
    }
  ): Milestone | null {
    for (const list of this.milestones.values()) {
      const index = list.findIndex((m) => m.id === parentId);
      if (index < 0) continue;
      const parent = list[index];
      if (parent.adaptive || list.some(m => m.adaptive && m.status !== "completed") ||
          list.filter(m => m.adaptive && m.return_to_milestone_id === parent.id).length >= 2) return null;
      const repair: Milestone = {
        id: `repair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        session_id: parent.session_id,
        learning_intent: parent.learning_intent,
        curriculum_module_id: parent.curriculum_module_id,
        curriculum_context: parent.curriculum_context,
        references:
          parent.references ??
          this.sessions.get(parent.session_id)?.references,
        title: input.title,
        prompt: input.lesson,
        lesson: input.lesson,
        check: input.check,
        starter_code: "",
        status: "active",
        created_at: Date.now(),
        adaptive: true,
        adaptation_reason: input.reason,
        return_to_milestone_id: parent.id,
        prerequisite_ids:
          parent.prerequisite_ids ?? (index ? [list[index - 1].id] : []),
      };
      parent.prerequisite_ids = [repair.id];
      parent.status = "pending";
      list.splice(index, 0, repair);
      this.persistMilestones();
      return this.hydrateMilestone(repair);
    }
    return null;
  }

  /** Fill an approved outline unit without changing its identity, graph or evidence. */
  prepareMilestone(id: string, content: Pick<Milestone, "lesson" | "check" | "visual" | "starter_code" | "test_code" | "references">): Milestone | null {
    for (const list of this.milestones.values()) {
      const unit = list.find(m => m.id === id);
      if (!unit || unit.content_status !== "outline") continue;
      Object.assign(unit, content, { content_status: "ready" });
      this.persistMilestones();
      return this.hydrateMilestone(unit);
    }
    return null;
  }

  updateMilestonePrerequisites(id: string, prerequisiteIds: string[]): void {
    for (const list of this.milestones.values()) {
      const milestone = list.find((item) => item.id === id);
      if (milestone) milestone.prerequisite_ids = [...prerequisiteIds];
    }
    this.persistMilestones();
  }

  updateMilestoneStatus(
    id: string,
    status: "pending" | "active" | "completed"
  ): void {
    this.milestones.forEach((list) => {
      const target = list.find((m) => m.id === id);
      if (target) {
        target.status = status;
      }
    });
    this.persistMilestones();
  }

  // --- SRS Cards CRUD ---
  getAllCards(): SRSCard[] {
    return Array.from(this.cards.values());
  }

  getDueCardsList(): SRSCard[] {
    return getDueCards(this.getAllCards());
  }

  createCard(
    card: Omit<
      SRSCard,
      | "id"
      | "reps"
      | "lapses"
      | "last_review"
      | "due_date"
      | "difficulty"
      | "stability"
    >
  ): SRSCard {
    const id = `srs-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 7)}`;
    const newCard: SRSCard = {
      ...card,
      id,
      created_at: Date.now(),
      difficulty: 5.0,
      stability: 1.0,
      reps: 0,
      lapses: 0,
      last_review: null,
      due_date: Date.now(), // Due immediately upon creation
    };
    this.cards.set(id, newCard);
    this.persistCards();
    return newCard;
  }

  rateCard(cardId: string, rating: FSRSRating): SRSCard | null {
    const card = this.cards.get(cardId);
    if (!card) return null;

    const { card: updatedCard } = scheduleCard(card, rating);
    this.cards.set(cardId, updatedCard);
    this.persistCards();
    return updatedCard;
  }

  deleteCardsForMilestone(milestoneId: string): boolean {
    let removed = false;
    for (const [cardId, card] of this.cards) {
      if (card.milestone_id === milestoneId) {
        this.cards.delete(cardId);
        removed = true;
      }
    }
    if (removed) this.persistCards();
    return removed;
  }

  // --- Export Markdown Notes ---
  exportSessionMarkdown(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return "# Learning Session Not Found";

    const messages = this.getMessages(sessionId).filter(
      (message) => !message.internal
    );
    const milestones = this.getMilestones(sessionId);

    let md = `# LearnForge Session: ${session.title}\n\n`;
    md += `**Topic:** ${session.topic}  \n`;
    if (session.language)
      md += `**Programming language:** ${session.language}  \n`;
    if (session.learning_intent)
      md += `**Learning goal:** ${session.learning_intent.interest}  \n`;
    md += `**Date:** ${new Date(
      session.created_at
    ).toLocaleDateString()}  \n\n`;

    if (session.references?.length) {
      md += "## Saved source excerpts\n\n";
      for (const source of session.references) {
        md += `### ${source.name} (${source.id})\n\n`;
        if (source.truncated) md += "Saved excerpt only; the original file was longer.\n\n";
        md += source.content.split("\n").map((line, index) => `    L${index + 1}: ${line}`).join("\n") + "\n\n";
      }
    }
    md += `---\n\n## Lessons\n\n`;
    for (const m of milestones) {
      md += `### ${m.title} (${m.status.toUpperCase()})\n\n`;
      md += `${m.prompt}\n\n`;
      if (m.lesson) md += `${m.lesson}\n\n`;
      if (m.visual) {
        md += `**Visual example: ${m.visual.title}**\n\n${m.visual.summary}\n\n`;
        for (const item of m.visual.items)
          md += `- **${item.label}:** ${item.description}\n`;
        md += `\n${m.visual.takeaway}\n\n`;
      }
      if (m.starter_code) {
        md += `\`\`\`${session.language || ""}\n${m.starter_code}\n\`\`\`\n\n`;
      }
    }

    md += `---\n\n## Learning Session\n\n`;
    for (const msg of messages) {
      const sender =
        msg.role === "user"
          ? "👤 Learner"
          : msg.role === "assistant"
          ? "🤖 Socratic Coach"
          : "⚙️ System";
      md += `### ${sender}\n\n${msg.content}\n\n`;
      if (msg.visual_example) {
        const v = msg.visual_example;
        md += `**Visual example: ${v.title}**\n\n${v.summary}\n\n`;
        for (const item of v.items)
          md += `- **${item.label}:** ${item.description}\n`;
        md += `\n${v.takeaway}\n\n`;
      }
      if (msg.learning_check) {
        md += `**Question:** ${msg.learning_check.question}\n\n`;
        for (const option of msg.learning_check.options)
          md += `- ${option.label}\n`;
        if (
          messages.some(
            (message) =>
              message.check_attempt?.checkId === msg.learning_check?.id
          )
        )
          md += `\n**Explanation:** ${msg.learning_check.explanation}\n`;
        md += "\n";
      }
      if (msg.code_snippet) {
        md += `\`\`\`${session.language || ""}\n${msg.code_snippet}\n\`\`\`\n\n`;
      }
    }

    return md;
  }
}

export const db = new LocalDatabase();
