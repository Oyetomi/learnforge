import { describe, it, expect } from 'vitest';
import {
  scheduleCard,
  calculateRetrievability,
  calculateInterval,
  getDueCards,
  DEFAULT_WEIGHTS,
} from '../engine';
import { SRSCard, Rating } from '../types';

describe('FSRS 4.5 Spaced Repetition Engine', () => {
  const newCard: SRSCard = {
    id: 'test-card-1',
    topic: 'Go Concurrency',
    prompt: 'What happens when sending to a closed Go channel?',
    target_code: 'panic: send on closed channel',
    difficulty: 5.0,
    stability: 1.0,
    reps: 0,
    lapses: 0,
    last_review: null,
    due_date: Date.now(),
  };

  it('correctly initializes stability and difficulty on first review (Good rating = 3)', () => {
    const result = scheduleCard(newCard, 3);
    // w[2] is initial stability for Good rating
    expect(result.card.stability).toBeCloseTo(DEFAULT_WEIGHTS[2], 2);
    expect(result.card.reps).toBe(1);
    expect(result.card.lapses).toBe(0);
    expect(result.nextIntervalDays).toBeGreaterThanOrEqual(1);
  });

  it('records lapse and lower stability on initial Again rating (Again rating = 1)', () => {
    const result = scheduleCard(newCard, 1);
    expect(result.card.stability).toBeCloseTo(DEFAULT_WEIGHTS[0], 2);
    expect(result.card.lapses).toBe(1);
    expect(result.nextIntervalDays).toBe(1);
  });

  it('calculates retrievability decay over time according to power forgetting curve', () => {
    const reviewedCard: SRSCard = {
      ...newCard,
      reps: 1,
      stability: 10.0, // 10 days stability
      last_review: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days elapsed
    };

    const r = calculateRetrievability(reviewedCard);
    // At t = S (10 days elapsed, stability = 10), R should be approximately 0.90!
    expect(r).toBeCloseTo(0.9, 2);
  });

  it('increases stability on consecutive Good review and scales interval', () => {
    const reviewedCard: SRSCard = {
      ...newCard,
      reps: 1,
      stability: 3.71,
      difficulty: 5.0,
      last_review: Date.now() - 3 * 24 * 60 * 60 * 1000,
    };

    const result = scheduleCard(reviewedCard, 3);
    expect(result.card.stability).toBeGreaterThan(reviewedCard.stability);
    expect(result.card.reps).toBe(2);
    expect(result.nextIntervalDays).toBeGreaterThan(3);
  });

  it('filters due cards accurately based on due_date', () => {
    const now = Date.now();
    const cards: SRSCard[] = [
      { ...newCard, id: 'c1', reps: 1, due_date: now - 1000 }, // overdue
      { ...newCard, id: 'c2', reps: 1, due_date: now + 100000 }, // future
      { ...newCard, id: 'c3', reps: 1, due_date: now - 50000 }, // overdue
    ];

    const due = getDueCards(cards);
    expect(due.length).toBe(2);
    expect(due.map((c) => c.id)).toContain('c1');
    expect(due.map((c) => c.id)).toContain('c3');
  });
});
