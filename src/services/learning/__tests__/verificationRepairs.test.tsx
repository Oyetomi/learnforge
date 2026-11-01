import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from '../../../components/chat/MarkdownView';
import { VisualRichText } from '../../../components/learning/VisualRichText';
import { normalizeMathMarkdown } from '../mathMarkdown';
import { requestsDiagnosticFirst } from '../diagnosticIntent';
import { answerTutoringPrompt } from '../tutoring';
import type { LearningCheck, CheckAttempt } from '../../../types';

const render = (content: string) => renderToStaticMarkup(<MarkdownView content={content}/>);
describe('live percentage regression cases', () => {
  it('keeps currency prose, option text, and table cells readable', () => {
    for (const text of ['A 20% increase adds $20, because 20% of $100 is $20.',
      'Taking 20% off $120 subtracts more than adding 20% to $100.',
      '| Base | Discount |\n| --- | --- |\n| $120 | $24 |']) {
      const html = render(text);
      expect(html).not.toContain('class="katex"');
      expect(html).not.toContain('katex-error');
      expect(html).toContain('$');
    }
    expect(renderToStaticMarkup(<VisualRichText text="$120 is bigger than $100"/>)).not.toContain('class="katex"');
  });
  it('retains genuine inline/display math and leaves code bytes alone', () => {
    expect(render('Use $x + y$ and $$0.20 \\times 120 = 24$$.')).toContain('class="katex"');
    expect(render('$$0.10 \\times \\$55 = $5.50$$')).not.toContain('katex-error');
    expect(render('When you add $10\\%$ to \\$50, calculate $$0.10 \\times \\$50 = $5.00$$.')).toContain('class="katex"');
    const code = '```sh\necho "$HOME and $20"\n```\nUse `price = "$100"`.';
    expect(normalizeMathMarkdown(code)).toBe(code);
    expect(render('A price is \\$100.')).toContain('$100');
  });
  it('handles escaped currency inside saved inline and display math before Markdown tokenization', () => {
    const source = String.raw`When you add $10\%$ to $\$50$, you calculate:

$$0.10 \times \$50 = \$5.00$$

Once $\$5.00$ is added, the new price becomes $\$55$. The second step takes $10\%$ of that new, larger figure:

$$0.10 \times \$55 = \$5.50$$

Because $\$5.50 > \$5.00$, taking $10\%$ of the higher price leaves $\$49.50$.`;
    const html = render(source);
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('youcalculate');
    // These must actually be equations, not escaped prose that merely has no errors.
    expect((html.match(/class="katex"/g) || []).length).toBe(10);
    expect(html).toContain('49.50');
    expect(normalizeMathMarkdown(source)).toContain(String.raw`\text{\textdollar}50`);
  });
  it('keeps embedded calculations together with no second paginator', () => {
    const content = '```ladder\ntitle: Track the price\ninitial: $100$\nstep: 1\nrule: Increase\nstate: $120$\nstep: 2\nrule: Discount\nstate: $96$\nresult: $96$\n```';
    const html = renderToStaticMarkup(<MarkdownView content={content} compactFigures/>);
    expect(html).toContain('compact-derivation');
    expect(html).toContain('Increase'); expect(html).toContain('Discount');
    expect(html).not.toContain('Next step'); expect(html).not.toContain('See all steps');
    expect(html).not.toContain('Derivation steps');
    expect(render(content)).toContain('Next step'); // Standalone figures retain interaction.
  });
  it('passes answer text rather than shuffled option IDs to tutoring', () => {
    const check: LearningCheck = {id:'q',milestoneId:'m',question:'Which discount?',options:[{id:'b',label:'More than five dollars'},{id:'a',label:'Exactly five dollars'}],correctOptionIds:['b'],multiple:false,explanation:'The base changed.'};
    const attempt: CheckAttempt = {checkId:'q',milestoneId:'m',selectedIds:['b'],correct:true,dontKnow:false,thinking:'',confidence:null,submittedAt:1};
    const prompt = answerTutoringPrompt(check,attempt);
    const data = JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));
    expect(data.attempt.selectedAnswers).toEqual(['More than five dollars']);
    expect(data.question.correctAnswers).toEqual(['More than five dollars']);
    expect(data.question.correctOptionIds).toBeUndefined();
    expect(data.attempt.selectedIds).toBeUndefined();
    expect(data.question.options).toBeUndefined();
    expect(prompt).toContain('NEVER by option letters');
  });
  it('recognizes explicit diagnostic intent without forcing a quiz on everyone', () => {
    expect(requestsDiagnosticFirst('Start with a short diagnostic and adapt to my reasoning.')).toBe(true);
    expect(requestsDiagnosticFirst('Check my understanding before teaching.')).toBe(true);
    expect(requestsDiagnosticFirst('Teach percentages.')).toBe(false);
    expect(requestsDiagnosticFirst("Don't quiz me; explain first.")).toBe(false);
  });
});
