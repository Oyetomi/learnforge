import { describe, expect, it } from 'vitest';
import {
  acceptsReadiness,
  approvedLessonIds,
  extractAssessment,
  extractRepair,
  isLessonUnlocked,
} from '../adaptation';
import { hideLearningCheckBlocks, extractLearningCheck } from '../checks';
import type { ChatMessage, Milestone } from '../../../types';
const milestone: Milestone = {
  id: 'm1',
  session_id: 's1',
  title: 'Channels',
  prompt: 'Understand rendezvous',
  starter_code: '',
  status: 'active',
  created_at: 0,
};
const answer = (id: string, correct = true): ChatMessage => ({
  id,
  role: 'user',
  session_id: 's1',
  content: 'Answer',
  created_at: 0,
  check_attempt: {
    checkId: id,
    milestoneId: 'm1',
    selectedIds: ['a'],
    dontKnow: false,
    thinking: 'An explicit model.',
    confidence: 'confident',
    correct,
    submittedAt: 10,
  },
});
const review = {
  decision: 'ready' as const,
  rationale: 'Two independent applications with consistent reasoning.',
  evidenceCheckIds: ['q1', 'q2'],
};
const fence = (name: string, body: unknown) =>
  '```' + name + '\n' + JSON.stringify(body) + '\n```';
const repair = {
  beforeMilestoneId: 'm1',
  triggerCheckId: 'wrong',
  title: 'Who creates a goroutine?',
  reason: 'The learner assumes a channel starts execution automatically.',
  lesson: 'Channels communicate; a go statement starts a goroutine.',
  check: {
    question: 'Which operation starts concurrent execution?',
    options: [
      { id: 'a', label: 'go work()' },
      { id: 'b', label: 'make(chan int)' },
    ],
    correctOptionIds: ['a'],
    multiple: false,
    explanation: 'A go statement starts the goroutine.',
  },
};
describe('competency and adaptive roadmap invariants', () => {
  it('does not unlock progression from correct counts alone', () => {
    const messages = [answer('q1'), answer('q2')];
    expect(approvedLessonIds(messages).size).toBe(0);
    expect(
      isLessonUnlocked(
        { ...milestone, id: 'm2', status: 'pending' },
        [milestone, { ...milestone, id: 'm2', status: 'pending' }],
        approvedLessonIds(messages)
      )
    ).toBe(false);
    expect(acceptsReadiness(messages, 'm1', review)).toBe(true);
  });
  it('requires an AI review tied to actual eligible attempts and ignores fabricated ids', () => {
    const messages = [answer('q1'), answer('q2')];
    expect(
      acceptsReadiness(messages, 'm1', {
        ...review,
        evidenceCheckIds: ['q1', 'fake'],
      })
    ).toBe(false);
    const approved = [
      ...messages,
      {
        id: 'review',
        session_id: 's1',
        role: 'assistant' as const,
        created_at: 20,
        content: 'Ready',
        competency_assessment: { ...review, milestoneId: 'm1', createdAt: 20 },
      },
    ];
    expect(approvedLessonIds(approved).has('m1')).toBe(true);
    expect(
      isLessonUnlocked(
        { ...milestone, id: 'm2', status: 'pending' },
        [milestone, { ...milestone, id: 'm2', status: 'pending' }],
        approvedLessonIds(approved)
      )
    ).toBe(true);
    expect(
      approvedLessonIds([...approved, answer('q3', false)]).has('m1')
    ).toBe(false);
  });
  it('validates repairs against the actual most recent gap and the active concept', () => {
    expect(
      extractRepair(
        fence('forge-repair', repair),
        [answer('wrong', false)],
        milestone,
        [milestone]
      )?.title
    ).toBe(repair.title);
    expect(
      extractRepair(
        fence('forge-repair', repair),
        [answer('other', false)],
        milestone,
        [milestone]
      )
    ).toBeNull();
    expect(
      extractRepair(
        fence('forge-repair', repair),
        [answer('wrong', true)],
        milestone,
        [milestone]
      )
    ).toBeNull();
    expect(
      extractRepair(
        fence('forge-repair', { ...repair, beforeMilestoneId: 'other' }),
        [answer('wrong', false)],
        milestone,
        [milestone]
      )
    ).toBeNull();
  });
  it('keeps internal assessment and adaptation payloads out of the reading surface', () => {
    const text =
      'A focused explanation.\n' +
      fence('forge-assessment', review) +
      '\n' +
      fence('forge-repair', repair);
    expect(hideLearningCheckBlocks(text)).toBe('A focused explanation.');
    expect(extractLearningCheck(text).hasBlock).toBe(false);
    expect(extractLearningCheck(text).text).toBe('A focused explanation.');
    expect(extractAssessment(fence('forge-assessment', review))?.decision).toBe(
      'ready'
    );
  });
  it('rejects a repair that also tries to replace the current question in a second block', () => {
    expect(
      extractRepair(
        fence('forge-repair', repair) +
          '\n' +
          fence('forge-check', repair.check),
        [answer('wrong', false)],
        milestone,
        [milestone]
      )
    ).toBeNull();
  });
});
