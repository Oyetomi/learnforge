import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { figureCode } from '../figureCode';
import { validateStateModel, type EntitySnapshot, type StateModel } from '../stateModel';
import { ScientificFigure } from '../../../components/learning/ScientificFigure';
import { MilestoneSidebar } from '../../../components/milestones/MilestoneSidebar';
import type { Milestone } from '../../../types';

const snapshot: EntitySnapshot = { entityId: 'athlete', status: 'No methods', value: 'struct Athlete { Name string }', tone: 'neutral' };
const makeModel = (): StateModel => ({
  version: 1, initialStateId: 'initial', presentation: { style: 'scientific', layout: 'lanes' },
  entities: [{ id: 'athlete', label: 'Athlete struct' }, { id: 'runner', label: 'Runner interface' }],
  states: [
    { id: 'initial', label: 'Before adding methods', description: 'Compare the available and required methods.', entities: [{ ...snapshot }, { entityId: 'runner', status: 'Requires two methods', value: 'Sprint() int, Pace() bool', tone: 'waiting' }] },
    { id: 'added', label: 'A method is added', description: 'One requirement is met.', entities: [{ ...snapshot, status: 'Sprint method added' }, { entityId: 'runner', status: 'Pace still needed', value: 'Sprint() int, Pace() bool', tone: 'waiting' }] },
  ], transitions: [{ id: 'add', from: 'initial', to: 'added', label: 'Add a method', explanation: 'The available method set changes.', sourceLines: [] }],
});

describe('code in teaching figures', () => {
  it('recognizes saved bare declarations and method signatures without defaulting to a language', () => {
    expect(figureCode(snapshot)).toEqual({ code: snapshot.value, language: '' });
    expect(figureCode({ ...snapshot, value: 'Sprint() int, Pace() bool' }, 'go')?.language).toBe('go');
    expect(figureCode({ ...snapshot, value: 'def greet(name):\n    return name' }, 'python')?.language).toBe('python');
  });
  it('preserves exact newlines, tabs and whitespace for explicitly typed code', () => {
    const value = 'type Athlete struct {\n\tName string\n}\n';
    expect(figureCode({ ...snapshot, value, format: 'code', language: 'go' }, 'python')).toEqual({ code: value, language: 'go' });
    const fenced = { ...snapshot, value: '```rust\nstruct Athlete {\n    name: String,\n}\n```' };
    expect(figureCode(fenced, 'go')).toEqual({ code: 'struct Athlete {\n    name: String,\n}', language: 'rust' });
  });
  it('keeps prose, mathematics and short inline values out of the code-block renderer', () => {
    for (const value of ['Missing Sprint and Pace', 'A function of time', '$x = 2$', '`2`', '`athlete`', 'The museum closes at 17:00.'])
      expect(figureCode({ ...snapshot, value }, 'go')).toBeNull();
    expect(figureCode({ ...snapshot, format: 'text' }, 'go')).toBeNull();
  });
  it('validates bounded code metadata without changing legacy snapshots or allowing arbitrary formats', () => {
    const legacy = makeModel();
    expect(validateStateModel(legacy)).toEqual(legacy);
    const typed = makeModel();
    typed.states[0].entities[0] = { ...snapshot, format: 'code', language: 'custom-dsl', value: 'rule '.repeat(70) };
    expect(validateStateModel(typed)?.states[0].entities[0]).toEqual(typed.states[0].entities[0]);
    for (const invalid of [{ format: 'html' }, { format: 'text', language: 'go' }, { format: 'code', language: '<'.repeat(41) }, { format: 'code', value: 'x'.repeat(2001) }, { format: 'code', value: 'x\n'.repeat(40) }]) {
      const model = makeModel(); Object.assign(model.states[0].entities[0], invalid);
      expect(validateStateModel(model)).toBeNull();
    }
  });
  it('renders old unmarked code with editor affordances and inherited highlighting', () => {
    const html = renderToStaticMarkup(<ScientificFigure model={makeModel()} language="go" onInteract={vi.fn()} />);
    expect(html).toContain('scientific-figure has-code-values');
    expect(html).toContain('scientific-figure-code');
    expect(html).toContain('snippet-gutter');
    expect(html).toContain('language-go');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('Requires two methods');
  });
  it('safely renders an unknown language without executing markup or modifying the snippet', () => {
    const model = makeModel();
    model.states[0].entities[0] = { ...snapshot, format: 'code', language: 'custom-dsl', value: '<img src=x onerror=evil()>\n  preserve_indent' };
    const html = renderToStaticMarkup(<ScientificFigure model={model} onInteract={vi.fn()} />);
    expect(html).toContain('&lt;img src=x onerror=evil()&gt;\n  preserve_indent');
    expect(html).not.toContain('<img');
  });
});

it('distinguishes reviewing a completed sidebar lesson from working on the current lesson', () => {
  const milestone: Milestone = { id: 'm', session_id: 's', title: 'Defining and Satisfying an Interface', prompt: 'Understand interfaces.', starter_code: '', status: 'completed', created_at: 1 };
  const html = renderToStaticMarkup(<MilestoneSidebar milestones={[milestone]} activeMilestoneId="m" onSelectMilestone={vi.fn()} onClose={vi.fn()} />);
  expect(html).toContain('Defining and Satisfying an Interface. Reviewing');
  expect(html).toContain('class="roadmap-step-marker" aria-hidden="true">01</span>');
  expect(html).not.toContain('<em>01</em>');
  const active = renderToStaticMarkup(<MilestoneSidebar milestones={[{ ...milestone, status: 'active' }]} activeMilestoneId="m" onSelectMilestone={vi.fn()} onClose={vi.fn()} />);
  expect(active).toContain('Defining and Satisfying an Interface. Current');
});
