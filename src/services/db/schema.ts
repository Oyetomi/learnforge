/**
 * LearnForge Database Schema & TypeScript Interfaces
 * Exactly mirrors the SQLite Data Schema defined in README.md.
 */

export type SupportedLanguage = 'go' | 'python' | 'rust' | 'ts';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MilestoneStatus = 'pending' | 'active' | 'completed';

/**
 * Learning Sessions table schema
 */
export interface Session {
  id: string;
  title: string;
  topic: string;
  language: SupportedLanguage;
  created_at: number; // Unix timestamp in ms
  updated_at: number; // Unix timestamp in ms
}

/**
 * Messages & Socratic Turns table schema
 */
export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  code_snippet?: string | null;
  created_at: number; // Unix timestamp in ms
}

/**
 * Milestones & Challenges table schema
 */
export interface Milestone {
  id: string;
  session_id: string;
  title: string;
  prompt: string;
  starter_code?: string | null;
  test_code?: string | null;
  solution_code?: string | null;
  status: MilestoneStatus;
  created_at: number; // Unix timestamp in ms
}

/**
 * FSRS Spaced Repetition Cards table schema
 */
export interface SRSCard {
  id: string;
  topic: string;
  prompt: string;
  target_code?: string | null;
  difficulty: number;
  stability: number;
  reps: number;
  lapses: number;
  last_review: number | null;
  due_date: number; // Unix timestamp in ms
}

/**
 * Input DTOs for creation operations
 */
export interface CreateSessionInput {
  id?: string;
  title: string;
  topic: string;
  language: SupportedLanguage;
  created_at?: number;
  updated_at?: number;
}

export interface CreateMessageInput {
  id?: string;
  session_id: string;
  role: MessageRole;
  content: string;
  code_snippet?: string | null;
  created_at?: number;
}

export interface CreateMilestoneInput {
  id?: string;
  session_id: string;
  title: string;
  prompt: string;
  starter_code?: string | null;
  test_code?: string | null;
  solution_code?: string | null;
  status?: MilestoneStatus;
  created_at?: number;
}

export interface CreateCardInput {
  id?: string;
  topic: string;
  prompt: string;
  target_code?: string | null;
  difficulty?: number;
  stability?: number;
  reps?: number;
  lapses?: number;
  last_review?: number | null;
  due_date?: number;
}

/**
 * Raw SQLite DDL for reference, native SQLite migrations, and export
 */
export const SQLITE_SCHEMA_DDL = `
-- Learning Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    language TEXT NOT NULL, -- 'go', 'python', 'rust', 'ts'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Messages & Socratic Turns
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    code_snippet TEXT,
    created_at INTEGER NOT NULL
);

-- Milestones & Challenges
CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    starter_code TEXT,
    test_code TEXT,
    solution_code TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'completed'
    created_at INTEGER NOT NULL
);

-- FSRS Spaced Repetition Cards
CREATE TABLE IF NOT EXISTS srs_cards (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    prompt TEXT NOT NULL,
    target_code TEXT,
    difficulty REAL NOT NULL DEFAULT 5.0,
    stability REAL NOT NULL DEFAULT 1.0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_review INTEGER,
    due_date INTEGER NOT NULL
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_milestones_session ON milestones(session_id);
CREATE INDEX IF NOT EXISTS idx_srs_cards_due ON srs_cards(due_date);
`;
