import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DerivationPane } from '../DerivationPane';
import { extractDerivationLadders } from '../DerivationLadder';

const ladder = (title: string, language = 'ladder') =>
  `\`\`\`${language}\ntitle: ${title}\ninitial: role = follower\nstep: 1\nrule: Election timer expires\nstate: role = candidate\nresult: Election begins\n\`\`\``;

describe('saved derivation access', () => {
  it('finds both ladder and legacy steps blocks in an existing conversation', () => {
    const found = extractDerivationLadders(
      `Explanation.\n${ladder('First')}\nMore context.\n${ladder('Second', 'steps')}`
    );
    expect(found.map((item) => item.title)).toEqual(['First', 'Second']);
  });
  it('ignores ordinary code and incomplete derivations', () => {
    expect(
      extractDerivationLadders(
        '```go\nfmt.Println("hello")\n```\n```ladder\ntitle: Unfinished\n```'
      )
    ).toEqual([]);
    expect(
      extractDerivationLadders('```ladder\ninitial: waiting\nstep: 1\nrule: Start\nstate: running')
    ).toEqual([]);
  });
  it('opens the latest saved explanation without making another AI request', () => {
    const generate = vi.fn();
    const html = renderToStaticMarkup(
      <DerivationPane
        messages={[
          {
            id: 'saved',
            role: 'assistant',
            session_id: 'track',
            created_at: 0,
            content: `${ladder('First')}\n${ladder('Latest saved ladder')}`,
          },
        ]}
        isStreaming={false}
        onGenerate={generate}
        onStop={() => {}}
      />
    );
    expect(html).toContain('Latest saved ladder');
    expect(html).toContain('Explanation 2 of 2');
    expect(generate).not.toHaveBeenCalled();
  });
  it('shows the track-specific empty state without unrelated demo content', () => {
    const generate = vi.fn();
    const html = renderToStaticMarkup(
      <DerivationPane messages={[]} isStreaming={false} onGenerate={generate} onStop={() => {}} />
    );
    expect(html).toContain('No saved derivations yet');
    expect(html).toContain('Generate derivation');
    expect(html).not.toContain('Worked example');
    expect(html).not.toContain('Simplify expression');
    expect(generate).not.toHaveBeenCalled();
  });
});
