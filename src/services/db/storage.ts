import { LearningSession, ChatMessage, Milestone, SRSCard, FSRSRating } from '../../types';
import { SEED_SESSIONS, SEED_MILESTONES, SEED_SRS_CARDS } from './seed';
import { getDueCards, scheduleCard } from '../fsrs';

const STORAGE_KEYS = {
  SESSIONS: 'learnforge:sessions',
  MESSAGES: 'learnforge:messages',
  MILESTONES: 'learnforge:milestones',
  SRS_CARDS: 'learnforge:srs_cards',
  INITIALIZED: 'learnforge:initialized_v1',
};

class LocalDatabase {
  private sessions: Map<string, LearningSession> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map(); // sessionId -> messages
  private milestones: Map<string, Milestone[]> = new Map(); // sessionId -> milestones
  private cards: Map<string, SRSCard> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    try {
      const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      if (!isInit) {
        this.seedInitialData();
      } else {
        this.loadFromStorage();
      }
    } catch (e) {
      console.warn('LocalStorage unavailable, running in-memory mode:', e);
      this.seedInitialData();
    }
  }

  private seedInitialData() {
    // Seed Sessions
    for (const s of SEED_SESSIONS) {
      this.sessions.set(s.id, s);
    }
    // Seed Milestones
    for (const m of SEED_MILESTONES) {
      const list = this.milestones.get(m.session_id) || [];
      list.push(m);
      this.milestones.set(m.session_id, list);
    }
    // Seed SRS Cards
    for (const c of SEED_SRS_CARDS) {
      this.cards.set(c.id, c);
    }

    this.persistAll();
    try {
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    } catch {}
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
          list.push(m);
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
      console.error('Failed to parse data from localStorage:', e);
    }
  }

  private persistAll() {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(Array.from(this.sessions.values())));
      const allMilestones: Milestone[] = [];
      this.milestones.forEach((list) => allMilestones.push(...list));
      localStorage.setItem(STORAGE_KEYS.MILESTONES, JSON.stringify(allMilestones));

      const allMessages: ChatMessage[] = [];
      this.messages.forEach((list) => allMessages.push(...list));
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(allMessages));

      localStorage.setItem(STORAGE_KEYS.SRS_CARDS, JSON.stringify(Array.from(this.cards.values())));
    } catch (e) {
      console.warn('Storage persistence failed:', e);
    }
  }

  // --- Sessions CRUD ---
  getSessions(): LearningSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updated_at - a.updated_at);
  }

  getSession(id: string): LearningSession | undefined {
    return this.sessions.get(id);
  }

  createSession(session: Omit<LearningSession, 'id' | 'created_at' | 'updated_at'>): LearningSession {
    const now = Date.now();
    const id = `session-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const newSession: LearningSession = {
      ...session,
      id,
      created_at: now,
      updated_at: now,
    };
    this.sessions.set(id, newSession);
    this.persistAll();
    return newSession;
  }

  deleteSession(id: string): void {
    this.sessions.delete(id);
    this.messages.delete(id);
    this.milestones.delete(id);
    this.persistAll();
  }

  // --- Messages CRUD ---
  getMessages(sessionId: string): ChatMessage[] {
    return this.messages.get(sessionId) || [];
  }

  addMessage(msg: Omit<ChatMessage, 'id' | 'created_at'>): ChatMessage {
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
    }

    this.persistAll();
    return fullMsg;
  }

  // --- Milestones CRUD ---
  getMilestones(sessionId: string): Milestone[] {
    return this.milestones.get(sessionId) || [];
  }

  createMilestone(milestone: Omit<Milestone, 'id' | 'created_at'>): Milestone {
    const fullM: Milestone = {
      ...milestone,
      id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: Date.now(),
    };
    const list = this.milestones.get(milestone.session_id) || [];
    list.push(fullM);
    this.milestones.set(milestone.session_id, list);
    this.persistAll();
    return fullM;
  }

  updateMilestoneStatus(id: string, status: 'pending' | 'active' | 'completed'): void {
    this.milestones.forEach((list) => {
      const target = list.find((m) => m.id === id);
      if (target) {
        target.status = status;
      }
    });
    this.persistAll();
  }

  // --- SRS Cards CRUD ---
  getAllCards(): SRSCard[] {
    return Array.from(this.cards.values());
  }

  getDueCardsList(): SRSCard[] {
    return getDueCards(this.getAllCards());
  }

  createCard(card: Omit<SRSCard, 'id' | 'reps' | 'lapses' | 'last_review' | 'due_date' | 'difficulty' | 'stability'>): SRSCard {
    const id = `srs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newCard: SRSCard = {
      ...card,
      id,
      difficulty: 5.0,
      stability: 1.0,
      reps: 0,
      lapses: 0,
      last_review: null,
      due_date: Date.now(), // Due immediately upon creation
    };
    this.cards.set(id, newCard);
    this.persistAll();
    return newCard;
  }

  rateCard(cardId: string, rating: FSRSRating): SRSCard | null {
    const card = this.cards.get(cardId);
    if (!card) return null;

    const { card: updatedCard } = scheduleCard(card, rating);
    this.cards.set(cardId, updatedCard);
    this.persistAll();
    return updatedCard;
  }

  // --- Export Markdown Notes ---
  exportSessionMarkdown(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '# Learning Session Not Found';

    const messages = this.getMessages(sessionId);
    const milestones = this.getMilestones(sessionId);

    let md = `# LearnForge Session: ${session.title}\n\n`;
    md += `**Topic:** ${session.topic}  \n`;
    md += `**Language:** ${session.language}  \n`;
    md += `**Date:** ${new Date(session.created_at).toLocaleDateString()}  \n\n`;

    md += `---\n\n## Hands-on Milestones\n\n`;
    for (const m of milestones) {
      md += `### ${m.title} (${m.status.toUpperCase()})\n\n`;
      md += `${m.prompt}\n\n`;
      if (m.starter_code) {
        md += `\`\`\`${session.language}\n${m.starter_code}\n\`\`\`\n\n`;
      }
    }

    md += `---\n\n## Socratic Dialogue Stream\n\n`;
    for (const msg of messages) {
      const sender = msg.role === 'user' ? '👤 Learner' : msg.role === 'assistant' ? '🤖 Socratic Coach' : '⚙️ System';
      md += `### ${sender}\n\n${msg.content}\n\n`;
      if (msg.code_snippet) {
        md += `\`\`\`${session.language}\n${msg.code_snippet}\n\`\`\`\n\n`;
      }
    }

    return md;
  }
}

export const db = new LocalDatabase();
