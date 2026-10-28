import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { highlightSource } from '../chat/CodeBlock';
import { advanceWalkthrough, seekWalkthrough, startWalkthrough, validateStateModel, WALKTHROUGH_LIMIT, type StateModel } from '../../services/learning/stateModel';
import './state-walkthrough.css';

export function StateWalkthrough({ model, onInteract, notes = [], takeaway }: { model: StateModel; onInteract: () => void; notes?: { label: string; description: string }[]; takeaway?: string }) {
  const safe = useMemo(() => validateStateModel(model), [model]);
  return safe ? <Walkthrough key={JSON.stringify(safe)} model={safe} onInteract={onInteract} notes={notes} takeaway={takeaway}/>
    : <p className="walkthrough-invalid">This walkthrough is incomplete. Ask for a corrected visual; your lesson and answer are unchanged.</p>;
}
function Walkthrough({ model, onInteract, notes, takeaway }: { model: StateModel; onInteract: () => void; notes: { label: string; description: string }[]; takeaway?: string }) {
  const [history, setHistory] = useState(() => startWalkthrough(model));
  const explanationRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    explanationRef.current?.focus({ preventScroll: true });
    explanationRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [history]);
  const visit = history.visits[history.index];
  const state = model.states.find(s => s.id === visit.stateId)!;
  const transition = model.transitions.find(t => t.id === visit.transitionId);
  const actions = model.transitions.filter(t => t.from === state.id);
  const atLimit = history.index + 1 >= WALKTHROUGH_LIMIT;
  const begin = Math.max(0, Math.min(history.index - 3, history.visits.length - 7));
  const shown = history.visits.slice(begin, begin + 7);
  const change = (next: typeof history) => { onInteract(); setHistory(next); };
  const code = model.source?.code.split('\n') || [];
  const highlights = transition?.sourceLines || [];
  const codeStart = Math.max(0, (highlights[0] || 1) - 3);
  const visibleCode = code.slice(codeStart, Math.max(codeStart + 7, (highlights[highlights.length - 1] || 1)));
  return <div className="state-walkthrough">
    <div className="walkthrough-disclaimer">{model.source ? "Concept walkthrough · illustrative states, not a recorded execution" : "Illustrative walkthrough · explore how each choice changes the situation"}</div>
    <div className="walkthrough-explanation" ref={explanationRef} tabIndex={-1} aria-live="polite"><span>Step {history.index + 1} · {state.label}</span><p>{transition?.explanation || state.description}</p></div>
    <div className="walkthrough-actions" role="group" aria-label="Choose what happens next">
      {atLimit ? <p>That’s 32 steps. Start again to explore a different path.</p> : actions.length ? actions.map(action => <button type="button" key={action.id} onClick={() => change(advanceWalkthrough(model, history, action.id))}>{action.label}<ChevronRight size={13}/></button>) : <p>End of this path. Go back to explore another choice, or return to the question.</p>}
    </div>
    <div className={`walkthrough-workbench ${model.source ? 'has-source' : ''}`}>
      <div className="walkthrough-scene">
        <div className="walkthrough-scene-label">Steps you chose <span>Order, not elapsed time</span></div>
        <svg className="walkthrough-timeline" viewBox={`0 0 520 ${34 + model.entities.length * 56}`} role="img" aria-label={`History at step ${history.index + 1}. ${model.entities.map(e => `${e.label}: ${state.entities.find(s => s.entityId === e.id)!.status}`).join('. ')}`}>
          <line x1={136 + (history.index - begin) * 45} x2={136 + (history.index - begin) * 45} y1={15} y2={26 + model.entities.length * 56} className="walkthrough-cursor"/>
          {model.entities.map((entity, row) => <g key={entity.id}>
            <text x={0} y={36 + row * 56} className="walkthrough-lane-label">{entity.label.length > 13 ? entity.label.slice(0, 12) + '…' : entity.label}</text>
            <text x={0} y={54 + row * 56} className="walkthrough-lane-value">{state.entities.find(s => s.entityId === entity.id)!.value.slice(0, 48)}</text>
            <line x1={136} x2={136 + Math.max(1, shown.length - 1) * 45} y1={32 + row * 56} y2={32 + row * 56} className="walkthrough-lane"/>
            {shown.map((v, column) => { const snapshot = model.states.find(s => s.id === v.stateId)!.entities.find(e => e.entityId === entity.id)!; return <g key={begin + column}><circle cx={136 + column * 45} cy={32 + row * 56} r={begin + column === history.index ? 8 : 4} className={`walkthrough-dot tone-${snapshot.tone}`}><title>Step {begin + column + 1}: {snapshot.status}. {snapshot.value}</title></circle>{row === 0 && <text x={136 + column * 45} y={10} textAnchor="middle" className="walkthrough-tick">{begin + column + 1}</text>}</g>; })}
            <text x={510} textAnchor="end" y={36 + row * 56} className={`walkthrough-status tone-${state.entities.find(s => s.entityId === entity.id)!.tone}`}>{state.entities.find(s => s.entityId === entity.id)!.status.length > 12 ? state.entities.find(s => s.entityId === entity.id)!.status.slice(0, 11) + '…' : state.entities.find(s => s.entityId === entity.id)!.status}</text>
          </g>)}
        </svg>

      </div>
      {model.source && <div className="walkthrough-source"><header><span>Related source · {model.source.language}</span><small>{highlights.length ? `Lines ${highlights.join(', ')}` : 'Initial state'}</small></header><pre aria-label="Source for this walkthrough"><code>{visibleCode.map((line, i) => { const lineNumber = codeStart + i + 1; const html = highlightSource(line, model.source!.language); return <span className={`walkthrough-code-line ${highlights.includes(lineNumber) ? 'is-current' : ''}`} key={lineNumber}><span className="walkthrough-line-number" aria-hidden="true">{lineNumber}</span>{html ? <span dangerouslySetInnerHTML={{ __html: html }}/> : <span>{line || ' '}</span>}</span>; })}</code></pre></div>}
    </div>
    <nav className="walkthrough-navigation" aria-label="Walkthrough history"><button type="button" disabled={history.index === 0} onClick={() => change(seekWalkthrough(history, history.index - 1))}><ChevronLeft size={14}/>Back</button><span>{history.index + 1} / {history.visits.length}</span><button type="button" disabled={history.index === history.visits.length - 1} onClick={() => change(seekWalkthrough(history, history.index + 1))}>Forward<ChevronRight size={14}/></button><button type="button" className="walkthrough-reset" onClick={() => change(startWalkthrough(model))}><RotateCcw size={12}/>Start again</button></nav>
    <details className="walkthrough-text"><summary>Read the current state as text{model.source ? ' and view full source' : ''}</summary><p>{state.description}</p><ul>{model.entities.map(entity => { const snapshot = state.entities.find(s => s.entityId === entity.id)!; return <li key={entity.id}><strong>{entity.label}</strong>: {snapshot.status}. {snapshot.value}</li>; })}</ul>{model.source && <pre><code>{model.source.code}</code></pre>}{notes.map((note, i) => <p key={i}><strong>{note.label}</strong>: {note.description}</p>)}{takeaway && <p>{takeaway}</p>}<p>The lesson supplies these states and allowed actions. Structural checks do not prove that its explanation matches a real program or physical system.</p></details>
  </div>;
}
