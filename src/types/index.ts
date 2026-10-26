export type SupportedLanguage = 'go' | 'python' | 'rust' | 'typescript' | 'javascript';

export interface LearningSession {
  id: string;
  title: string;
  topic: string;
  language: SupportedLanguage;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  code_snippet?: string;
  created_at: number;
}

export interface Milestone {
  id: string;
  session_id: string;
  title: string;
  prompt: string;
  starter_code: string;
  test_code?: string;
  solution_code?: string;
  status: 'pending' | 'active' | 'completed';
  created_at: number;
}

export type FSRSRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

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
  due_date: number;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  error?: string;
  testResults?: TestResult[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  error?: string;
}
