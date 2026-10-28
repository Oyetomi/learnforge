import { afterEach, describe, expect, it, vi } from 'vitest';
import { planAdaptiveRepair } from '../planner';
import type { ChatMessage, Milestone } from '../../../types';
const current: Milestone = {
  id: 'm1',
  session_id: 's1',
  title: 'Channel synchronization',
  prompt: 'Reason about channel sends.',
  starter_code: '',
  status: 'active',
  created_at: 0,
};
const attempt: ChatMessage = {
  id: 'a',
  session_id: 's1',
  role: 'user',
  content: 'My answer',
  created_at: 0,
  check_attempt: {
    checkId: 'wrong',
    milestoneId: 'm1',
    correct: false,
    selectedIds: ['b'],
    dontKnow: false,
    thinking: 'I think make(chan int) starts a goroutine.',
    confidence: 'confident',
    submittedAt: 0,
  },
};
const proposal = {
  action: 'add_prerequisite',
  title: 'Starting a goroutine',
  reason: 'The attempt confuses channel allocation with concurrent execution.',
  lesson:
    'A go statement creates concurrent execution; a channel communicates.',
  check: {
    question: 'What starts a goroutine?',
    options: [
      { id: 'a', label: 'go work()' },
      { id: 'b', label: 'make(chan int)' },
    ],
    correctOptionIds: ['a'],
    multiple: false,
    explanation: 'The go statement starts execution.',
  },
};
const reply = (body: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) } }],
    })
  );
afterEach(() => vi.unstubAllGlobals());
describe('explicit adaptive planning', () => {
  it('plans from recorded thinking and attaches trusted ids to a validated repair', async () => {
    const fetch = vi.fn().mockResolvedValue(reply(proposal));
    vi.stubGlobal('fetch', fetch);
    const result = await planAdaptiveRepair(
      current,
      null,
      [attempt],
      [current],
      new AbortController().signal
    );
    expect(result?.beforeMilestoneId).toBe('m1');
    expect(result?.triggerCheckId).toBe('wrong');
    expect(
      JSON.parse(fetch.mock.calls[0][1].body).messages[1].content
    ).toContain(attempt.check_attempt!.thinking);
  });
  it('keeps an in-concept mistake on the existing roadmap and makes no request for a confident correct attempt', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        reply({
          action: 'stay',
          reason: 'The existing concept covers this gap.',
        })
      );
    vi.stubGlobal('fetch', fetch);
    expect(
      await planAdaptiveRepair(
        current,
        null,
        [attempt],
        [current],
        new AbortController().signal
      )
    ).toBeNull();
    expect(
      await planAdaptiveRepair(
        current,
        null,
        [
          {
            ...attempt,
            check_attempt: { ...attempt.check_attempt!, correct: true },
          },
        ],
        [current],
        new AbortController().signal
      )
    ).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refuses a malformed generated question instead of inserting an ungradeable detour', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          reply({
            ...proposal,
            check: { ...proposal.check, correctOptionIds: ['missing'] },
          })
        )
    );
    expect(
      await planAdaptiveRepair(
        current,
        null,
        [attempt],
        [current],
        new AbortController().signal
      )
    ).toBeNull();
  });
});
