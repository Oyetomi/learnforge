/**
 * LearnForge Socratic AI Engine & Tutoring Orchestrator
 *
 * Public entrypoint for:
 * - Resilient SSE streaming client with AbortController and model fallback
 * - Pedagogical Socratic prompts tailored with active milestone & live editor code
 * - Structured `forge-challenge` parser for automated Monaco setup & test runner
 * - Pre-configured starter curriculum tracks (Go Concurrency, Rust Ownership, Raft, Python Asyncio)
 */

// Types & Configuration
export * from './types';

// Prompts & Socratic Orchestration
export {
  SOCRATIC_CORE_INSTRUCTIONS,
  buildSocraticSystemPrompt,
  formatConversationMessages,
} from './prompts';

// Structured Challenge Parser
export {
  parseChallengeFromResponse,
  extractCleanResponse,
} from './parser';

// SSE Streaming Client & Errors
export {
  streamSocraticChat,
  sendSocraticChat,
  AIClientError,
} from './client';

// Curriculum Tracks & Templates
export {
  STARTER_TRACKS,
  TRACK_GO_CONCURRENCY,
  TRACK_RUST_OWNERSHIP,
  TRACK_DISTRIBUTED_RAFT,
  TRACK_PYTHON_ASYNCIO,
  getAllTracks,
  getTrackById,
  createSessionFromTrack,
} from './tracks';
