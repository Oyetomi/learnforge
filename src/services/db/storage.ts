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
};

export const STORAGE_STATUS_EVENT = "learnforge:storage-status";

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
  private inMemoryOnly = false;
  private persisted = true;
  private persistenceError = "";
  private failedKeys: Set<string> = new Set();
  private flushingPending = false;

  constructor() {
    this.init();
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
    try {
      const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      if (!isInit) {
        this.initializeEmptyStorage();
      } else {
        this.loadFromStorage();
      }
    } catch (e) {
      console.warn("LocalStorage unavailable, running in-memory mode:", e);
      this.inMemoryOnly = true;
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

  private loadFromStorage() {
    try {
      const sessionsJson = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      if (sessionsJson) {
        const arr: LearningSession[] = JSON.parse(sessionsJson);
        arr.forEach((s) => this.sessions.set(s.id, s));
      }

      const milestonesJson = localStorage.getItem(STORAGE_KEYS.MILESTONES);
      if (milestonesJson) {
        const arr: Milestone[] = JSON.parse(milestonesJson);
        arr.forEach((m) => {
          const list = this.milestones.get(m.session_id) || [];
          list.push(this.hydrateMilestone(m));
          this.milestones.set(m.session_id, list);
        });
      }

      const messagesJson = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (messagesJson) {
        const arr: ChatMessage[] = JSON.parse(messagesJson);
        arr.forEach((msg) => {
          const list = this.messages.get(msg.session_id) || [];
          list.push(msg);
          this.messages.set(msg.session_id, list);
        });
      }

      const cardsJson = localStorage.getItem(STORAGE_KEYS.SRS_CARDS);
      if (cardsJson) {
        const arr: SRSCard[] = JSON.parse(cardsJson);
        arr.forEach((c) => this.cards.set(c.id, c));
      }
    } catch (e) {
      console.error("Failed to parse data from localStorage:", e);
    }
  }

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
      }
    } finally {
      this.flushingPending = false;
    }
  }

  private persistSessions() {
    this.writeKey(
      STORAGE_KEYS.SESSIONS,
      JSON.stringify(Array.from(this.sessions.values()))
    );
  }

  private persistMilestones() {
    const allMilestones: Milestone[] = [];
    this.milestones.forEach((list) => {
      for (const milestone of list) {
        allMilestones.push(this.dehydrateMilestone(milestone));
      }
    });
    this.writeKey(STORAGE_KEYS.MILESTONES, JSON.stringify(allMilestones));
  }

  private persistMessages() {
    const allMessages: ChatMessage[] = [];
    this.messages.forEach((list) => allMessages.push(...list));
    this.writeKey(STORAGE_KEYS.MESSAGES, JSON.stringify(allMessages));
  }

  private persistCards() {
    this.writeKey(
      STORAGE_KEYS.SRS_CARDS,
      JSON.stringify(Array.from(this.cards.values()))
    );
  }

  private persistAll() {
    this.flushingPending = true;
    try {
      this.persistSessions();
      this.persistMilestones();
      this.persistMessages();
      this.persistCards();
    } finally {
      this.flushingPending = false;
    }
    if (this.failedKeys.size === 0 && !this.persisted) {
      this.emitStorageStatus(true, "");
    }
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
    this.persistAll();
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

    this.persistMessages();
    return fullMsg;
  }

  disputeWrittenAttempt(sessionId: string, checkId: string): boolean {
    const message = this.messages.get(sessionId)?.find((m) => m.check_attempt?.checkId === checkId);
    const attempt = message?.check_attempt;
    if (!message || !attempt?.grading) return false;
    message.check_attempt = { ...attempt, correct: false, assisted: true,
      grading: { ...attempt.grading, status: "uncertain", reviewRequested: true } };
    message.content += "\nFeedback disputed by learner; this result is unresolved and excluded from readiness.";
    this.persistMessages();
    return true;
  }

  finishRetentionReview(sessionId: string, messageId: string): boolean {
    const message = this.messages.get(sessionId)?.find((m) => m.id === messageId);
    const review = message?.retention_review;
    const card = review && this.cards.get(review.cardId);
    if (!review || review.finishedAt !== undefined || !card || card.session_id !== sessionId ||
      review.check.milestoneId !== card.milestone_id || review.attempt.milestoneId !== card.milestone_id) return false;
    const rating = retentionRating(review.check, review.attempt);
    review.finishedAt = Date.now();
    if (rating !== null) this.rateCard(card.id, rating);
    this.persistMessages();
    return true;
  }

  disputeRetentionReview(sessionId: string, messageId: string): RetentionReview | null {
    const review = this.messages.get(sessionId)?.find((m) => m.id === messageId)?.retention_review;
    if (!review?.attempt.grading || review.finishedAt !== undefined) return null;
    review.attempt = { ...review.attempt, correct: false, assisted: true,
      grading: { ...review.attempt.grading, status: "uncertain", reviewRequested: true } };
    this.persistMessages();
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
  prepareMilestone(id: string, content: Pick<Milestone, "lesson" | "check" | "visual" | "starter_code" | "test_code">): Milestone | null {
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
        md += `\`\`\`${session.language}\n${m.starter_code}\n\`\`\`\n\n`;
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
        md += `\`\`\`${session.language}\n${msg.code_snippet}\n\`\`\`\n\n`;
      }
    }

    return md;
  }
}

export const db = new LocalDatabase();
