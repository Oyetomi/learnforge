import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { advanceWalkthrough, seekWalkthrough, startWalkthrough, validateStateModel, WALKTHROUGH_LIMIT, type StateModel } from '../stateModel';
import { validateVisualExample, visualForSubject, VISUAL_INSTRUCTIONS } from '../visuals';
import { StateWalkthrough } from '../../../components/learning/StateWalkthrough';

const model: StateModel = {
  version: 1, initialStateId: 'initial', entities: [{ id: 'a', label: 'First participant' }, { id: 'b', label: 'Second participant' }],
  states: [
    { id: 'initial', label: 'Before either action', description: 'Both participants are ready.', entities: [{ entityId: 'a', status: 'Ready', value: 'Value held here', tone: 'neutral' }, { entityId: 'b', status: 'Ready', value: 'No value yet', tone: 'neutral' }] },
    { id: 'a-first', label: 'First participant waits', description: 'It needs a matching action.', entities: [{ entityId: 'a', status: 'Waiting', value: 'Value held here', tone: 'waiting' }, { entityId: 'b', status: 'Ready', value: 'No value yet', tone: 'active' }] },
    { id: 'b-first', label: 'Second participant waits', description: 'It needs a matching action.', entities: [{ entityId: 'a', status: 'Ready', value: 'Value held here', tone: 'active' }, { entityId: 'b', status: 'Waiting', value: 'No value yet', tone: 'waiting' }] },
    { id: 'done', label: 'Exchange completes', description: 'The value has moved.', entities: [{ entityId: 'a', status: 'Done', value: '', tone: 'done' }, { entityId: 'b', status: 'Done', value: 'Value received here', tone: 'done' }] },
  ],
  transitions: [
    { id: 'choose-a', from: 'initial', to: 'a-first', label: 'First participant acts', explanation: 'The first participant waits for a matching action.', sourceLines: [] },
    { id: 'choose-b', from: 'initial', to: 'b-first', label: 'Second participant acts', explanation: 'The second participant waits for a matching action.', sourceLines: [] },
    { id: 'complete-b', from: 'a-first', to: 'done', label: 'Second participant acts', explanation: 'The matching action completes the exchange.', sourceLines: [] },
    { id: 'complete-a', from: 'b-first', to: 'done', label: 'First participant acts', explanation: 'The matching action completes the exchange.', sourceLines: [] },
  ],
};
const visual = { kind: 'state-model', stateModel: model, title: 'An exchange', summary: 'Choose an order and inspect each state.', takeaway: 'Either participant can act first.', items: [{ id: 'a', label: 'First participant', description: 'One side of the exchange.' }, { id: 'b', label: 'Second participant', description: 'The other side.' }] };
const copy = () => structuredClone(model);

describe('language-neutral visual contract', () => {
  it('accepts identical interaction data regardless of source language or no source', () => {
    for (const language of [null, 'go', 'python', 'javascript', 'rust', 'a-custom-dsl']) {
      const spec = validateVisualExample({ ...visual, stateModel: { ...model, ...(language ? { source: { language, code: 'an illustrative source excerpt' } } : {}) } });
      expect(spec?.stateModel?.entities).toEqual(model.entities);
      expect(visualForSubject(spec, language)).toBe(spec);
    }
    expect(VISUAL_INSTRUCTIONS).toContain('language- and subject-neutral');
    expect(VISUAL_INSTRUCTIONS).not.toContain('For Go channel');
  });
  it('rejects broken references, missing snapshots, duplicate ids, impossible source lines and unreachable states', () => {
    const cases: StateModel[] = [];
    let m = copy(); m.transitions[0].to = 'missing'; cases.push(m);
    m = copy(); m.states[0].entities.pop(); cases.push(m);
    m = copy(); m.entities[1].id = m.entities[0].id; cases.push(m);
    m = copy(); m.states[1].entities[0].entityId = 'missing'; cases.push(m);
    m = copy(); m.transitions[0].sourceLines = [1]; cases.push(m);
    m = copy(); m.transitions = m.transitions.filter(t => t.to !== 'b-first'); cases.push(m);
    m = copy(); m.transitions[0].to = m.transitions[0].from; cases.push(m);
    for (const invalid of cases) expect(validateStateModel(invalid)).toBeNull();
  });
  it('bounds graph size and action choices while accepting valid source references', () => {
    expect(validateStateModel({ ...model, states: Array(21).fill(model.states[0]) })).toBeNull();
    expect(validateStateModel({ ...model, entities: Array(7).fill(model.entities[0]) })).toBeNull();
    expect(validateStateModel({ ...model, source: { language: 'unknown', code: 'line 1\nline 2' }, transitions: model.transitions.map(t => ({ ...t, sourceLines: [2] })) })?.source?.language).toBe('unknown');
    expect(validateStateModel({ ...model, source: { language: 'go', code: 'line' }, transitions: model.transitions.map(t => ({ ...t, sourceLines: [2] })) })).toBeNull();
  });
  it('drops executable-looking extra fields and renders source and labels safely as text', () => {
    const m = copy(); m.entities[0].label = '<img src=x onerror=evil()>';
    m.source = { language: 'unknown', code: '<script>evil()</script>' };
    const safe = validateStateModel({ ...m, callback: 'evil()' })!;
    expect(safe).not.toHaveProperty('callback');
    const html = renderToStaticMarkup(<StateWalkthrough model={safe} onInteract={vi.fn()}/>);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('not a recorded execution');
  });
  it('does not show code controls for a non-coding concept', () => {
    const html = renderToStaticMarkup(<StateWalkthrough model={model} onInteract={vi.fn()}/>);
    expect(html).not.toContain('Related source');
    expect(html).toContain('Choose what happens next');
    expect(html).toContain('Read the current state as text');
  });
});
describe('branching and replay', () => {
  it('allows either initial order, reaches the same final state and never mutates the original history', () => {
    const initial = startWalkthrough(model);
    const a = advanceWalkthrough(model, advanceWalkthrough(model, initial, 'choose-a'), 'complete-b');
    const b = advanceWalkthrough(model, advanceWalkthrough(model, initial, 'choose-b'), 'complete-a');
    expect(a.visits[a.visits.length - 1]?.stateId).toBe('done');
    expect(b.visits[b.visits.length - 1]?.stateId).toBe('done');
    expect(initial.visits).toHaveLength(1);
  });
  it('rejects an action from the wrong state and can branch from an earlier visit without retaining a fictional future', () => {
    const initial = startWalkthrough(model);
    expect(advanceWalkthrough(model, initial, 'complete-b')).toBe(initial);
    let h = advanceWalkthrough(model, initial, 'choose-a'); h = advanceWalkthrough(model, h, 'complete-b');
    h = seekWalkthrough(h, 0);
    const alternate = advanceWalkthrough(model, h, 'choose-b');
    expect(alternate.visits.map(v => v.stateId)).toEqual(['initial', 'b-first']);
    expect(seekWalkthrough(alternate, 20)).toBe(alternate);
  });
  it('supports cycles without unbounded history or autoplay', () => {
    const cyclic = { ...model, transitions: [...model.transitions, { id: 'repeat', from: 'done', to: 'initial', label: 'Try again', explanation: 'Start a new exchange.', sourceLines: [] }] };
    expect(validateStateModel(cyclic)).not.toBeNull();
    let h = startWalkthrough(cyclic);
    for (let i = 0; i < 50; i++) for (const action of ['choose-a', 'complete-b', 'repeat']) h = advanceWalkthrough(cyclic, h, action);
    expect(h.visits).toHaveLength(WALKTHROUGH_LIMIT);
    expect(h.index).toBe(WALKTHROUGH_LIMIT - 1);
  });
});
