import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type { DerivationLadderProps } from '../chat/DerivationLadder';
import { MathFormula } from './MathFormula';
import './math-learning.css';
import { PaperDerivation } from './PaperDerivation';
import { readTutoringPosition, saveTutoringPosition } from '../../services/learning/tutoring';
export function mathSource(raw: string): string | null {
  const text = raw.trim();
  if (text.startsWith('$$') && text.endsWith('$$') && text.length > 4) return text.slice(2, -2);
  if (text.startsWith('$') && text.endsWith('$') && text.length > 2) return text.slice(1, -1);
  if ((text.startsWith('\\(') && text.endsWith('\\)')) || (text.startsWith('\\[') && text.endsWith('\\]'))) return text.slice(2, -2);
  return null;
}
function State({ value }: { value: string }) {
  const tex = mathSource(value);
  return tex === null ? <p className="guided-state-text">{value}</p> : <MathFormula tex={tex}/>;
}
export function GuidedDerivation({ title, initialState, steps, result, positionKey, compact }: DerivationLadderProps) {
  const [index, setIndex] = useState(() => Math.min(readTutoringPosition(positionKey, false).index, Math.max(0, steps.length - 1)));
  const [overview, setOverview] = useState(() => readTutoringPosition(positionKey, false).together);
  useEffect(() => { if (positionKey) saveTutoringPosition(positionKey, { index, together: overview }); }, [positionKey, index, overview]);
  const step = steps[index];
  if (!step) return <State value={initialState}/>;
  if (compact) return <figure className="compact-derivation" aria-label={title || 'Worked calculation'}>
    <figcaption>{title || 'Worked calculation'}</figcaption>
    <div className="compact-initial"><State value={initialState}/></div>
    <ol>{steps.map((item, i) => <li key={i}><strong>{item.rule}</strong><State value={item.state}/>{(item.explanation || item.evalText) && <p>{item.explanation || item.evalText}</p>}</li>)}</ol>
    {result && <div className="compact-result"><span>Result</span><State value={result}/></div>}
  </figure>;
  return <PaperDerivation className="guided-derivation" label={title || 'Guided derivation'}>
    <header className="guided-header"><div><h4>{title || 'One transformation at a time'}</h4></div><span>Step {index + 1} / {steps.length}</span></header>
    {overview ? <ol className="guided-overview">{steps.map((item, i) => <li key={i}><strong>{i + 1}. {item.rule}</strong><State value={item.state}/>{item.explanation && <p>{item.explanation}</p>}</li>)}</ol> : <div className="guided-current" aria-live="polite">
      <div className="guided-equations"><div><span>Before</span><State value={index === 0 ? initialState : steps[index - 1].state}/></div><ArrowRight size={18} aria-hidden="true"/><div><span>After</span><State value={step.state}/></div></div>
      <div className="guided-reason"><span className="math-eyebrow">What changed</span><h5>{step.rule}</h5>{step.explanation && <p>{step.explanation}</p>}{step.evalText && <details className="guided-calculation"><summary>See the calculation</summary><State value={step.evalText}/></details>}</div>
      {index === steps.length - 1 && result && <div className="guided-result"><span>Result</span><State value={result}/></div>}
    </div>}
    <nav className="guided-controls" aria-label="Derivation steps"><button type="button" disabled={index === 0 || overview} onClick={() => setIndex(i => i - 1)}><ChevronLeft size={15}/>Back</button><div className="guided-progress" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i <= index ? 'is-seen' : ''}/>)}</div><button type="button" disabled={index === steps.length - 1 || overview} onClick={() => setIndex(i => i + 1)}>Next step<ChevronRight size={15}/></button></nav>
    <footer className="guided-footer"><button type="button" onClick={() => { setIndex(0); setOverview(false); }}><RotateCcw size={12}/>Start again</button><button type="button" aria-pressed={overview} onClick={() => setOverview(v => !v)}>{overview ? 'One step at a time' : 'See all steps'}</button></footer>
  </PaperDerivation>;
}
