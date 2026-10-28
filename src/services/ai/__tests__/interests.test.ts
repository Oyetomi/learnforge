import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggestTopics } from '../interests';
const topics = [
  {
    title: 'Quorum decisions',
    why: 'Connects to your interest in resilient systems.',
    goal: 'Understand when a majority can safely make a decision.',
  },
  {
    title: 'Failure detection',
    why: 'Explores how systems reason under uncertainty.',
    goal: 'Distinguish a slow process from a failed process.',
  },
];
const reply = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    })
  );
afterEach(() => vi.unstubAllGlobals());
describe('interest-led topic selection', () => {
  it('uses the actual interest and cancellation signal instead of a fixed catalog', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ topics }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(
      await suggestTopics(
        'How do distributed systems stay reliable?',
        controller.signal
      )
    ).toEqual(topics);
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.messages[1].content).toBe(
      'How do distributed systems stay reliable?'
    );
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  });
  it('rejects duplicate, incomplete, or empty suggestions', async () => {
    for (const result of [
      [],
      [topics[0], topics[0]],
      [topics[0], { title: 'Missing goal' }],
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(reply({ topics: result }))
      );
      await expect(suggestTopics('Reliability')).rejects.toThrow('incomplete');
    }
  });
  it('keeps connection errors understandable without inventing fallback topics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }))
    );
    await expect(suggestTopics('Reliability')).rejects.toThrow(
      'could not connect'
    );
  });
});
