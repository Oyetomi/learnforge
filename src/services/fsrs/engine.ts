/**
 * FSRS 4.5 Spaced Repetition Engine
 * High-precision TypeScript implementation of the Free Spaced Repetition Scheduler v4.5.
 */

import { FSRSParameters, Rating, ReviewPreview, ScheduleResult, SRSCard } from './types';

/**
 * Default 17 optimized parameter weights for FSRS-4.5
 */
export const DEFAULT_WEIGHTS: readonly number[] = [
  0.4872, // w0: initial stability for Again (Rating 1)
  1.4003, // w1: initial stability for Hard (Rating 2)
  3.7145, // w2: initial stability for Good (Rating 3)
  13.8206, // w3: initial stability for Easy (Rating 4)
  5.1618, // w4: initial difficulty base
  1.2298, // w5: initial difficulty rating slope
  0.8975, // w6: difficulty adjustment step
  0.031, // w7: difficulty mean-reversion pull
  1.6474, // w8: recall stability factor
  0.1367, // w9: recall stability power
  1.0461, // w10: recall stability retrievability factor
  2.1072, // w11: forget stability base
  0.0793, // w12: forget difficulty power
  0.3246, // w13: forget stability power
  1.587, // w14: forget retrievability factor
  0.2272, // w15: hard rating stability penalty
  2.8755, // w16: easy rating stability bonus
];

/**
 * FSRS-4.5 Forgetting curve decay exponent
 */
export const DECAY = -0.5;

/**
 * Factor guaranteeing R = 0.90 when elapsed days t equals memory stability S
 */
export const FACTOR = 19 / 81;

/**
 * Standard default target retention (90%)
 */
export const DEFAULT_TARGET_RETENTION = 0.9;

/**
 * Maximum scheduled interval in days (approx 100 years)
 */
export const MAXIMUM_INTERVAL_DAYS = 36500;

/**
 * Milliseconds in a 24-hour day
 */
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Default global FSRS 4.5 parameters
 */
export const DEFAULT_FSRS_PARAMETERS: FSRSParameters = {
  requestRetention: DEFAULT_TARGET_RETENTION,
  maximumInterval: MAXIMUM_INTERVAL_DAYS,
  w: [...DEFAULT_WEIGHTS],
  decay: DECAY,
  factor: FACTOR,
};

/**
 * Clamp a number to a bounded range [min, max]
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate retrievability (probability of recall) R(t, S).
 * Formula: R(t, S) = (1 + factor * (t / S))^decay
 * 
 * At t = 0: R = 1.0 (100%)
 * At t = S: R = (1 + 19/81)^(-0.5) = (100/81)^(-0.5) = 9/10 = 0.90 (90%)
 * 
 * @param card The flashcard
 * @param currentDate Target evaluation date (defaults to now)
 * @param params FSRS configuration parameters
 * @returns Probability between 0.0 and 1.0
 */
export function calculateRetrievability(
  card: SRSCard,
  currentDate: Date = new Date(),
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS
): number {
  if (card.reps === 0 || card.last_review === null) {
    // New, unreviewed cards have no established retention
    return 0;
  }

  const elapsedMs = currentDate.getTime() - card.last_review;
  if (elapsedMs <= 0) {
    return 1.0;
  }

  const t = elapsedMs / MS_PER_DAY;
  const s = Math.max(0.01, card.stability);
  const factor = params.factor ?? FACTOR;
  const decay = params.decay ?? DECAY;

  const retrievability = Math.pow(1 + factor * (t / s), decay);
  return clamp(retrievability, 0, 1);
}

/**
 * Calculate review interval I(r, S) for a target retention r and stability S.
 * Formula: I(r, S) = (S / factor) * (r^(1 / decay) - 1)
 * 
 * When r = 0.90 and decay = -0.5:
 * r^(1 / decay) - 1 = 0.90^(-2) - 1 = (100 / 81) - 1 = 19 / 81 = factor
 * Therefore, I(0.90, S) = S
 */
export function calculateInterval(
  stability: number,
  targetRetention: number = DEFAULT_TARGET_RETENTION,
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS
): number {
  const safeRetention = clamp(targetRetention, 0.7, 0.99);
  const safeS = Math.max(0.1, stability);
  const factor = params.factor ?? FACTOR;
  const decay = params.decay ?? DECAY;

  const rawInterval = (safeS / factor) * (Math.pow(safeRetention, 1 / decay) - 1);
  const roundedInterval = Math.max(1, Math.round(rawInterval));
  return clamp(roundedInterval, 1, params.maximumInterval);
}

/**
 * Initial stability S0(G) for a new card's first review.
 * G in [1, 2, 3, 4] -> w[G - 1]
 */
export function initStability(
  rating: Rating,
  w: readonly number[] = DEFAULT_WEIGHTS
): number {
  const index = clamp(rating - 1, 0, 3);
  return Math.max(0.1, w[index]);
}

/**
 * Initial difficulty D0(G) for a new card's first review (FSRS-4.5).
 * Formula: D0(G) = clamp(w[4] - (G - 3) * w[5], 1, 10)
 */
export function initDifficulty(
  rating: Rating,
  w: readonly number[] = DEFAULT_WEIGHTS
): number {
  const g = clamp(rating, 1, 4);
  const d0 = w[4] - (g - 3) * w[5];
  return clamp(d0, 1.0, 10.0);
}

/**
 * Subsequent difficulty D'(D, G) after review with rating G.
 * Formula:
 *   next_d = D - w[6] * (G - 3)
 *   mean_reversion = w[7] * D0(3) + (1 - w[7]) * next_d
 *   clamp(mean_reversion, 1, 10)
 */
export function nextDifficulty(
  currentDifficulty: number,
  rating: Rating,
  w: readonly number[] = DEFAULT_WEIGHTS
): number {
  const g = clamp(rating, 1, 4);
  const nextD = currentDifficulty - w[6] * (g - 3);
  // D0(3) is the neutral baseline difficulty for 'Good'
  const d0Good = initDifficulty(Rating.Good, w);
  const meanReversion = w[7] * d0Good + (1 - w[7]) * nextD;
  return clamp(meanReversion, 1.0, 10.0);
}

/**
 * Stability update upon successful recall (Rating 2 = Hard, 3 = Good, 4 = Easy).
 * Formula:
 *   hard_penalty = G === 2 ? w[15] : 1
 *   easy_bonus = G === 4 ? w[16] : 1
 *   S_recall = S * (1 + exp(w[8]) * (11 - D) * S^(-w[9]) * (exp((1 - R) * w[10]) - 1) * hard_penalty * easy_bonus)
 */
export function nextRecallStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  rating: Rating,
  w: readonly number[] = DEFAULT_WEIGHTS
): number {
  const safeD = clamp(difficulty, 1.0, 10.0);
  const safeS = Math.max(0.1, stability);
  const safeR = clamp(retrievability, 0.01, 1.0);

  const hardPenalty = rating === Rating.Hard ? w[15] : 1.0;
  const easyBonus = rating === Rating.Easy ? w[16] : 1.0;

  const stabilityIncrease =
    Math.exp(w[8]) *
    (11 - safeD) *
    Math.pow(safeS, -w[9]) *
    (Math.exp((1 - safeR) * w[10]) - 1) *
    hardPenalty *
    easyBonus;

  const sRecall = safeS * (1 + stabilityIncrease);
  return Math.max(0.1, sRecall);
}

/**
 * Stability update upon memory lapse (Rating 1 = Again).
 * Formula:
 *   S_forget = min(S, w[11] * D^(-w[12]) * ((S + 1)^w[13] - 1) * exp((1 - R) * w[14]))
 */
export function nextForgetStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  w: readonly number[] = DEFAULT_WEIGHTS
): number {
  const safeD = clamp(difficulty, 1.0, 10.0);
  const safeS = Math.max(0.1, stability);
  const safeR = clamp(retrievability, 0.01, 1.0);

  const sForget =
    w[11] *
    Math.pow(safeD, -w[12]) *
    (Math.pow(safeS + 1, w[13]) - 1) *
    Math.exp((1 - safeR) * w[14]);

  return Math.max(0.1, Math.min(safeS, sForget));
}

/**
 * Schedule a card after a review with the given rating.
 * Handles both first-time (initial) reviews and subsequent consecutive reviews.
 * 
 * @param card Current SRS card state
 * @param rating User rating (Again, Hard, Good, Easy)
 * @param reviewDate Timestamp of the review (defaults to new Date())
 * @param params Optional FSRS parameter overrides
 * @returns Updated card and calculated next interval
 */
export function scheduleCard(
  card: SRSCard,
  rating: Rating,
  reviewDate: Date = new Date(),
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS
): ScheduleResult {
  const w = params.w ?? DEFAULT_WEIGHTS;
  const targetRetention = params.requestRetention ?? DEFAULT_TARGET_RETENTION;
  const reviewMs = reviewDate.getTime();

  let nextS: number;
  let nextD: number;
  let nextLapses = card.lapses;
  let currentR = 0;

  if (card.reps === 0 || card.last_review === null) {
    // Initial review for a brand new card
    nextS = initStability(rating, w);
    nextD = initDifficulty(rating, w);
    currentR = 1.0;
    if (rating === Rating.Again) {
      nextLapses += 1;
    }
  } else {
    // Consecutive review
    currentR = calculateRetrievability(card, reviewDate, params);
    nextD = nextDifficulty(card.difficulty, rating, w);

    if (rating === Rating.Again) {
      nextS = nextForgetStability(nextD, card.stability, currentR, w);
      nextLapses += 1;
    } else {
      nextS = nextRecallStability(nextD, card.stability, currentR, rating, w);
    }
  }

  // Calculate next interval based on the updated stability and desired retention
  let nextIntervalDays = calculateInterval(nextS, targetRetention, params);

  // If rating is Again, force 1-day interval for tomorrow's relearning review
  if (rating === Rating.Again) {
    nextIntervalDays = 1;
  }

  const dueDateMs = reviewMs + nextIntervalDays * MS_PER_DAY;

  const updatedCard: SRSCard = {
    ...card,
    difficulty: Number(nextD.toFixed(4)),
    stability: Number(nextS.toFixed(4)),
    reps: card.reps + 1,
    lapses: nextLapses,
    last_review: reviewMs,
    due_date: dueDateMs,
  };

  return {
    card: updatedCard,
    nextIntervalDays,
    retrievability: Number(currentR.toFixed(4)),
  };
}

/**
 * Filter and sort cards that are due for review.
 * A card is due if:
 * 1. It has never been reviewed (reps === 0), OR
 * 2. Its due_date <= targetDate.
 * 
 * Cards are ordered by earliest due_date first (most urgent first).
 * 
 * @param cards List of SRS cards
 * @param targetDate Target cutoff date (defaults to new Date())
 * @returns Sorted array of due cards
 */
export function getDueCards(
  cards: SRSCard[],
  targetDate: Date = new Date()
): SRSCard[] {
  const targetMs = targetDate.getTime();
  return cards
    .filter((card) => card.reps === 0 || card.due_date <= targetMs)
    .sort((a, b) => {
      // Prioritize unreviewed cards first, then by earliest due date
      if (a.reps === 0 && b.reps > 0) return -1;
      if (a.reps > 0 && b.reps === 0) return 1;
      return a.due_date - b.due_date;
    });
}

/**
 * Generate preview outcomes for all 4 rating buttons (Again, Hard, Good, Easy).
 * Essential for UI display (e.g. showing "Good: 4 days", "Easy: 14 days").
 */
export function previewCardReviews(
  card: SRSCard,
  reviewDate: Date = new Date(),
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS
): Record<Rating, ReviewPreview> {
  const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  const previews = {} as Record<Rating, ReviewPreview>;

  for (const rating of ratings) {
    const { card: scheduledCard, nextIntervalDays } = scheduleCard(
      card,
      rating,
      reviewDate,
      params
    );
    previews[rating] = {
      rating,
      nextIntervalDays,
      stability: scheduledCard.stability,
      difficulty: scheduledCard.difficulty,
      dueDate: new Date(scheduledCard.due_date),
    };
  }

  return previews;
}

/**
 * Helper to construct a brand new SRSCard with sensible defaults.
 */
export function createNewCard(
  topic: string,
  prompt: string,
  target_code?: string | null,
  id: string = crypto.randomUUID()
): SRSCard {
  return {
    id,
    topic,
    prompt,
    target_code: target_code ?? null,
    difficulty: 5.0,
    stability: 1.0,
    reps: 0,
    lapses: 0,
    last_review: null,
    due_date: Date.now(),
  };
}
