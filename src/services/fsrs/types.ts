/**
 * FSRS 4.5 Spaced Repetition Types
 * Adheres to the DSR (Difficulty, Stability, Retrievability) memory model.
 */

/**
 * User rating for active recall:
 * - Again (1): Complete memory lapse, needs relearning.
 * - Hard (2): Recalled with significant effort.
 * - Good (3): Recalled with normal effort (default target).
 * - Easy (4): Effortless recall, stability receives a bonus.
 */
export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

/**
 * SRS Card interface matching the SQLite `srs_cards` table schema.
 */
export interface SRSCard {
  /** Unique primary key UUID */
  id: string;
  /** Domain or topic, e.g. "Go Concurrency", "Rust Ownership" */
  topic: string;
  /** Problem statement / question posed to the learner */
  prompt: string;
  /** Expected solution snippet or key implementation */
  target_code?: string | null;
  /** Inherent difficulty rating, scaled between 1.0 (easiest) and 10.0 (hardest). Default: 5.0 */
  difficulty: number;
  /** Memory stability in days (interval where retrievability drops to target retention). Default: 1.0 */
  stability: number;
  /** Total number of successful or attempted reviews */
  reps: number;
  /** Number of times the card was forgotten (rated Again) */
  lapses: number;
  /** Unix timestamp in milliseconds of the previous review, or null for new cards */
  last_review: number | null;
  /** Unix timestamp in milliseconds when the next review is scheduled */
  due_date: number;
}

/**
 * Configurable parameters for the FSRS 4.5 algorithm.
 */
export interface FSRSParameters {
  /** Target retrievability at scheduled interval (default: 0.90) */
  requestRetention: number;
  /** Maximum interval in days (default: 36500 = ~100 years) */
  maximumInterval: number;
  /** The 17 FSRS-4.5 optimized weights [w0..w16] */
  w: number[];
  /** Forgetting curve decay exponent (fixed at -0.5 for FSRS 4.5) */
  decay: number;
  /** Factor ensuring R = requestRetention when elapsed days t = stability S (19 / 81 for FSRS 4.5) */
  factor: number;
}

/**
 * Result returned by the scheduler after processing a review.
 */
export interface ScheduleResult {
  /** The updated card with recalculated stability, difficulty, reps, lapses, and due date */
  card: SRSCard;
  /** Scheduled interval in days until the next review */
  nextIntervalDays: number;
  /** Retrievability (0.0 to 1.0) at the moment of review */
  retrievability: number;
}

/**
 * Prospective review outcome preview for UI buttons (Again / Hard / Good / Easy).
 */
export interface ReviewPreview {
  rating: Rating;
  nextIntervalDays: number;
  stability: number;
  difficulty: number;
  dueDate: Date;
}
