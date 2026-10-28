import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { graphCoordinate, slopeBetween, validateSlopeGraph } from '../math';
import { validateVisualExample, visualForSubject } from '../visuals';
import { MathFormula } from '../../../components/learning/MathFormula';
import { DerivationLadder, parseLadderMarkdown } from '../../../components/chat/DerivationLadder';
import { VisualExample } from '../../../components/learning/VisualExample';
import { splitLessonIntoSlides } from '../steps';

const graph = { type: 'slope', points: [{ x: -2, y: -1 }, { x: 2, y: 3 }] };
const visual = {
  kind: 'graph', graph, title: 'See how slope changes', summary: 'Move the points to compare rise and run.', takeaway: 'Slope compares vertical change with horizontal change.',
  items: [{ id: 'run', label: 'Run', description: 'Horizontal change.' }, { id: 'rise', label: 'Rise', description: 'Vertical change.' }],
};
describe('bounded slope math', () => {
  it('accepts only the owned graph type, finite bounded half-unit coordinates, and exactly two points', () => {
    expect(validateSlopeGraph(graph)).toEqual(graph);
    for (const invalid of [
      { ...graph, type: 'eval', code: 'alert(1)' }, { ...graph, points: [] },
      ...[Infinity, NaN, 6, -.25, '3'].map(x => ({ ...graph, points: [{ x, y: 0 }, { x: 2, y: 3 }] })),
    ]) expect(validateSlopeGraph(invalid)).toBeNull();
    expect(validateVisualExample({ ...visual, graph: { ...graph, expression: 'evil()' } })?.graph).toEqual(graph);
    expect(validateVisualExample({ ...visual, graph: { type: 'eval' } })).toBeNull();
  });
  it('normalizes pointer movements to a finite half-unit grid', () => {
    expect([10, -9, .27, NaN].map(graphCoordinate)).toEqual([5, -5, .5, 0]);
  });
  it('uses exact reduced slope fractions and is invariant to reversing the points', () => {
    const a = { x: -1, y: 1 }, b = { x: 2, y: -1 };
    expect(slopeBetween(a, b)).toMatchObject({ tex: '-\\frac{2}{3}', rise: -2, run: 3 });
    expect(slopeBetween(b, a).tex).toBe(slopeBetween(a, b).tex);
    expect(slopeBetween({ x: -.5, y: -1 }, { x: 1, y: -.5 }).tex).toBe('\\frac{1}{3}');
  });
  it('distinguishes horizontal, vertical and coincident points without dividing by zero', () => {
    expect(slopeBetween({ x: 0, y: 1 }, { x: 2, y: 1 })).toMatchObject({ kind: 'line', tex: '0' });
    expect(slopeBetween({ x: 1, y: -1 }, { x: 1, y: 4 }).kind).toBe('vertical');
    expect(slopeBetween({ x: 1, y: 1 }, { x: 1, y: 1 }).kind).toBe('coincident');
  });
  it('allows a math graph in general lessons while retaining the Go simulation boundary', () => {
    const valid = validateVisualExample(visual)!;
    expect(visualForSubject(valid, null)?.kind).toBe('graph');
    expect(visualForSubject({ ...valid, kind: 'simulation', model: 'go-channel' }, null)).toBeNull();
  });
  it('renders a real coordinate plot with keyboard targets, named controls and a text equivalent', () => {
    const html = renderToStaticMarkup(<VisualExample visual={validateVisualExample(visual)!} visualId="math-test"/>);
    expect(html).toContain('Point A, x -2, y -1');
    expect(html).toContain('Point B x');
    expect(html).toContain('Read the graph as text');
    expect(html).toContain('class="katex"');
    expect(html).toContain('slope-line');
    expect(html).not.toContain('visual-items');
  });
});
describe('guided mathematical content', () => {
  const raw = 'title: Isolate x\ninitial: $2x+3=7$\n---\nrule: Subtract 3 from both sides\nwhy: Equal subtraction keeps both sides equal.\nstate: $2x=4$\n---\nrule: Divide both sides by 2\nwhy: One copy is half of two copies.\nstate: $x=2$\nresult: $x=2$';
  it('parses the reasoning and initially withholds future transformations and the final result', () => {
    const ladder = parseLadderMarkdown(raw)!;
    expect(ladder.steps[0].explanation).toContain('Equal subtraction');
    const html = renderToStaticMarkup(<DerivationLadder {...ladder}/>);
    expect(html).toContain('Before'); expect(html).toContain('After');
    expect(html).toContain('Equal subtraction');
    expect(html).not.toContain('Divide both sides by 2');
    expect(html).not.toContain('guided-result');
  });
  it('rejects excessive ladders and missing reasoning operations', () => {
    expect(parseLadderMarkdown('x'.repeat(32001))).toBeNull();
    expect(parseLadderMarkdown('initial: $x$\n---\nstate: $2x$')).toBeNull();
  });
  it('keeps display equations containing blank lines together on one slide', () => {
    const equation = '$$\n\\begin{aligned}\nx &= 2\\\\\n\ny &= 3\n\\end{aligned}\n$$';
    expect(splitLessonIntoSlides('First.\n\n' + equation + '\n\nThen.')).toEqual(['First.', equation, 'Then.']);
  });
  it('renders malformed or excessive notation as escaped readable fallback instead of unsafe HTML', () => {
    expect(renderToStaticMarkup(<MathFormula tex={'x'.repeat(4001)}/>)).toContain('Formula unavailable');
    const html = renderToStaticMarkup(<MathFormula tex={'\\includegraphics{https://example.com/private.png}'}/>);
    expect(html).not.toContain('<img'); expect(html).not.toContain('<script');
    expect(renderToStaticMarkup(<MathFormula tex={'\\frac{1}{'}/>)).toContain('Formula unavailable');
  });
});
