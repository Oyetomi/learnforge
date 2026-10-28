import type { VisualExample } from "../services/learning/visuals";
export type SupportedLanguage =
  | "go"
  | "python"
  | "rust"
  | "typescript"
  | "javascript";

export interface LearningIntent {
  interest: string;
  goal: string;
  level?: "Beginner" | "Intermediate" | "Advanced";
  practiceMode: "general" | "coding";
  programmingLanguage?: SupportedLanguage;
}

export interface LearningReference {
  id: string;
  name: string;
  content: string;
  truncated: boolean;
}

export interface LearningSession {
  id: string;
  title: string;
  topic: string;
  language: SupportedLanguage | null;
  learning_intent?: LearningIntent;
  placement?: PlacementPlan;
  references?: LearningReference[];
  track_id?: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  code_snippet?: string;
  milestone_id?: string;
  internal?: boolean;
  generation_error?: boolean;
  competency_assessment?: CompetencyAssessment;
  roadmap_change?: {
    addedMilestoneId: string;
    returnToMilestoneId: string;
    reason: string;
    triggerCheckId: string;
  };
  visual_example?: VisualExample;
  visual_requested?: boolean;
  learning_check?: LearningCheck;
  check_attempt?: CheckAttempt;
  retention_review?: RetentionReview;
  created_at: number;
}

export interface Milestone {
  references?: LearningReference[];
  visual?: VisualExample;
  learning_intent?: LearningIntent;
  placement_attempt?: PlacementAttempt;
  deferred?: boolean;
  id: string;
  session_id: string;
  title: string;
  prompt: string;
  starter_code: string;
  test_code?: string;
  solution_code?: string;
  adaptive?: boolean;
  adaptation_reason?: string;
  return_to_milestone_id?: string;
  prerequisite_ids?: string[];
  lesson?: string;
  check?: LearningCheckSpec;
  status: "pending" | "active" | "completed";
  created_at: number;
}

export type FSRSRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface SRSCard {
  created_at?: number;
  session_id?: string;
  milestone_id?: string;
  id: string;
  topic: string;
  prompt: string;
  target_code?: string | null;
  answer?: string;
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

export interface LearningCheckSpec {
  kind?: "choice" | "free-response";
  rubric?: { id: string; criterion: string }[];
  expectedAnswer?: string;
  question: string;
  context?: string;
  options: { id: string; label: string }[];
  correctOptionIds: string[];
  explanation: string;
  multiple: boolean;
  hint?: string;
}

export interface LearningCheck extends LearningCheckSpec {
  id: string;
  milestoneId: string;
}

/** Starting-point evidence is deliberately separate from lesson/mastery attempts. */
export interface PlacementAttempt {
  milestoneId: string;
  check: LearningCheckSpec;
  selectedIds: string[];
  dontKnow: boolean;
  confidence: "unsure" | "somewhat" | "confident" | null;
  correct: boolean;
  helpUsed: string[];
  submittedAt: number;
}

export interface PlacementPlan {
  attempts: PlacementAttempt[];
  deferredMilestoneIds: string[];
  startMilestoneId: string;
  reason: string;
  approvedAt: number;
}

export interface CheckAttempt {
  response?: string;
  grading?: FreeResponseGrade;
  checkId: string;
  milestoneId: string;
  selectedIds: string[];
  dontKnow: boolean;
  thinking: string;
  confidence: "unsure" | "somewhat" | "confident" | null;
  correct: boolean;
  assisted?: boolean;
  retriedOptionIds?: string[];
  visualSupportIds?: string[];
  submittedAt: number;
}

export interface FreeResponseGrade {
  status: "correct" | "needs-work" | "uncertain";
  feedback: string;
  criteria: { id: string; met: boolean }[];
  reviewRequested?: boolean;
}

export interface RetentionReview {
  cardId: string;
  check: LearningCheck;
  attempt: CheckAttempt;
  finishedAt?: number;
}

export interface CompetencyAssessment {
  milestoneId: string;
  decision: "ready" | "practice";
  rationale: string;
  evidenceCheckIds: string[];
  createdAt: number;
}
