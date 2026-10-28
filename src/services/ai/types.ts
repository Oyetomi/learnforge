/**
 * LearnForge Socratic AI Service - Type Definitions
 * Strict TypeScript types for streaming client, challenge parser, and curriculum tracks.
 */

import type { VisualExample } from "../learning/visuals";
import type {
  ChatMessage,
  Milestone,
  SupportedLanguage,
  LearningSession,
  LearningCheckSpec,
  LearningIntent,
  PlacementPlan,
  LearningReference,
} from "../../types";

export type {
  ChatMessage,
  Milestone,
  SupportedLanguage,
  LearningSession,
  LearningCheckSpec,
};

/**
 * Standard configuration defaults for the local AI proxy
 */
export const AI_CONFIG = {
  DEFAULT_API_URL: "http://127.0.0.1:10532/v1/chat/completions",
  DEFAULT_MODEL: "gemini-3.8-flash-high",
  FALLBACK_MODEL: "gemini-4-argon",
  DEFAULT_TEMPERATURE: 0.65,
  REQUEST_TIMEOUT_MS: 45000,
} as const;

/**
 * Structured coding challenge extracted from AI responses
 */
export interface ForgeChallenge {
  title: string;
  language: SupportedLanguage | string;
  prompt: string;
  starter_code: string;
  test_code: string;
  solution_code?: string;
}

/**
 * Result of parsing an AI response for embedded challenge blocks
 */
export interface ParsedChallengeResult {
  /** The extracted challenge, or null if not found */
  challenge: ForgeChallenge | null;
  /** Response text with the forge-challenge block cleanly removed for conversational display */
  conversationalText: string;
  /** Whether a valid challenge was detected */
  hasChallenge: boolean;
  /** The raw unparsed forge-challenge block content */
  rawChallengeBlock?: string;
}

/**
 * Options for the Socratic streaming chat client
 */
export interface StreamOptions {
  activeCheck?: LearningCheckSpec;
  /** Invoked for each incremental text delta streamed from the LLM */
  onChunk?: (text: string) => void;
  /** Invoked once when the full stream completes successfully */
  onComplete?: (fullText: string) => void;
  /** Invoked on non-recoverable error */
  onError?: (err: Error) => void;
  /** AbortSignal for user cancellation */
  abortSignal?: AbortSignal;
  /** Target model name (defaults to gemini-3.8-flash-high) */
  model?: string;
  /** Fallback model name if primary fails (defaults to gemini-4-argon) */
  fallbackModel?: string;
  /** API endpoint URL (defaults to http://127.0.0.1:10532/v1/chat/completions) */
  apiUrl?: string;
  /** Sampling temperature (0.0 to 1.0) */
  temperature?: number;
  /** Optional max completion tokens */
  maxTokens?: number;
}

/**
 * Milestone template definition for curriculum tracks
 */
export interface CourseMilestoneTemplate {
  id: string;
  title: string;
  concept: string;
  prompt: string;
  starter_code: string;
  test_code: string;
  hints?: string[];
  prerequisite_ids?: string[];
  lesson?: string;
  visual?: VisualExample;
  check?: LearningCheckSpec;
}

/**
 * Full curriculum track definition
 */
export interface CourseTrack {
  references?: LearningReference[];
  id: string;
  title: string;
  tagline: string;
  language: SupportedLanguage | null;
  learningIntent?: LearningIntent;
  placement?: PlacementPlan;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedHours: number;
  description: string;
  concepts: string[];
  milestones: CourseMilestoneTemplate[];
  initialPrompt: string;
}
