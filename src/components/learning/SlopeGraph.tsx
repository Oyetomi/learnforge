import React, { useId, useState } from 'react';
import { MathFormula } from './MathFormula';
import { graphCoordinate, slopeBetween, type GraphPoint, type SlopeGraphSpec } from '../../services/learning/math';
import './math-learning.css';

const left = 38, top = 18, size = 280;
const sx = (x: number) => left + (x + 5) * size / 10;
const sy = (y: number) => top + (5 - y) * size / 10;
const ticks = Array.from({ length: 11 }, (_, i) => i - 5);
export function SlopeGraph({ graph, onInteract, notes = [], takeaway }: { graph: SlopeGraphSpec; onInteract: () => void; notes?: { label: string; description: string }[]; takeaway?: string }) {
  const [points, setPoints] = useState<[GraphPoint, GraphPoint]>(() => graph.points.map(p => ({ ...p })) as [GraphPoint, GraphPoint]);
  const [active, setActive] = useState<number | null>(null);
  const id = useId().replace(/:/g, '');
  const [a, b] = points, slope = slopeBetween(a, b);
  const update = (index: number, point: GraphPoint) => {
    onInteract();
    setPoints(old => old.map((p, i) => i === index ? { x: graphCoordinate(point.x), y: graphCoordinate(point.y) } : p) as [GraphPoint, GraphPoint]);
  };
  const drag = (e: React.PointerEvent<SVGGElement>, index: number) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const svg = e.currentTarget.ownerSVGElement, matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const position = svg.createSVGPoint(); position.x = e.clientX; position.y = e.clientY;
    const p = position.matrixTransform(matrix.inverse());
    update(index, { x: (p.x - left) / size * 10 - 5, y: 5 - (p.y - top) / size * 10 });
  };
  const coordinateText = `A is (${a.x}, ${a.y}). B is (${b.x}, ${b.y}). Run from A to B is ${slope.run}; rise is ${slope.rise}. ${slope.description}`;
  const line = slope.kind === 'coincident' ? null : slope.kind === 'vertical'
    ? { x1: sx(a.x), y1: sy(-5), x2: sx(a.x), y2: sy(5) }
    : { x1: sx(-5), y1: sy(a.y + (-5 - a.x) * slope.rise / slope.run), x2: sx(5), y2: sy(a.y + (5 - a.x) * slope.rise / slope.run) };
  return <div className="slope-lab">
    <div className="math-lab-hint"><span>Explore the relationship</span><span>Drag A or B · arrows move a focused point</span></div>
    <div className="slope-workbench">
      <svg className="slope-plot" viewBox="0 0 350 330" role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <title id={`${id}-title`}>Slope between two movable points</title>
        <desc id={`${id}-description`}>{coordinateText} Tab to a point and use arrow keys, or edit coordinates below.</desc>
        <defs><clipPath id={`${id}-clip`}><rect x={left} y={top} width={size} height={size}/></clipPath></defs>
        <g aria-hidden="true">
          {ticks.map(t => <g key={t}><line x1={sx(t)} x2={sx(t)} y1={top} y2={top + size} className={t === 0 ? 'plot-axis' : 'plot-grid'}/><line x1={left} x2={left + size} y1={sy(t)} y2={sy(t)} className={t === 0 ? 'plot-axis' : 'plot-grid'}/>{t % 2 === 0 && t !== 0 && <><text x={sx(t)} y={sy(0) + 16} textAnchor="middle">{t}</text><text x={sx(0) - 9} y={sy(t) + 3} textAnchor="end">{t}</text></>}</g>)}
          <text x={left + size + 12} y={sy(0) + 4}>x</text><text x={sx(0) + 8} y={top - 4}>y</text>
          <g clipPath={`url(#${id}-clip)`}>
            {slope.kind === 'line' && <path d={`M ${sx(a.x)} ${sy(a.y)} H ${sx(b.x)} V ${sy(b.y)} Z`} className="slope-area"/>}
            {line && <line {...line} className="slope-line"/>}
            <line x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(a.y)} className="slope-run"/>
            <line x1={sx(b.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} className="slope-rise"/>
          </g>
        </g>
        {points.map((point, index) => <g key={index} className={`slope-point ${active === index ? 'is-active' : ''}`} role="button" tabIndex={0}
          aria-label={`Point ${index === 0 ? 'A' : 'B'}, x ${point.x}, y ${point.y}. Arrow keys move by half a unit.`}
          onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); setActive(index); onInteract(); }}
          onPointerMove={e => drag(e, index)} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setActive(null); }}
          onLostPointerCapture={() => setActive(null)}
          onKeyDown={e => { const moves: Record<string, [number, number]> = { ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, .5], ArrowDown: [0, -.5] }; if (!moves[e.key]) return; e.preventDefault(); const [x, y] = moves[e.key]; update(index, { x: point.x + x, y: point.y + y }); }}>
          <circle cx={sx(point.x)} cy={sy(point.y)} r={20} className="point-hit"/>
          <circle cx={sx(point.x)} cy={sy(point.y)} r={11} className="point-halo"/>
          <circle cx={sx(point.x)} cy={sy(point.y)} r={5} className="point-core"/>
          <text x={sx(point.x) + (point.x > 4 ? -15 : 15)} y={sy(point.y) - 12} textAnchor={point.x > 4 ? 'end' : 'start'} aria-hidden="true">{index === 0 ? 'A' : 'B'}</text>
        </g>)}
      </svg>
      <div className="slope-reading">
        <div className="slope-measures"><span className="run-measure">Run <strong>{slope.run}</strong></span><span className="rise-measure">Rise <strong>{slope.rise}</strong></span></div>
        <span className="math-eyebrow">Slope = rise ÷ run</span>
        <MathFormula tex={slope.kind === 'line' ? `m = \\frac{\\textcolor{#8fc9bb}{${slope.rise}}}{\\textcolor{#e5b985}{${slope.run}}} = ${slope.tex}` : slope.kind === 'vertical' ? '\\Delta x = 0' : 'A = B'} />
        <p className="slope-observation" role="status" aria-live="polite">{slope.description}</p>
        <p className="slope-coordinate-summary">A ({a.x}, {a.y}) · B ({b.x}, {b.y})</p>
      </div>
    </div>
    <div className="math-graph-details"><details className="math-coordinate-editor"><summary>Edit coordinates</summary><div>{points.map((point, index) => <fieldset key={index}><legend>Point {index === 0 ? 'A' : 'B'}</legend>{(['x', 'y'] as const).map(axis => <label key={axis}>{axis}<input aria-label={`Point ${index === 0 ? 'A' : 'B'} ${axis}`} type="number" min={-5} max={5} step={.5} value={point[axis]} onChange={e => { if (e.target.value && Number.isFinite(e.target.valueAsNumber)) update(index, { ...point, [axis]: e.target.valueAsNumber }); }}/></label>)}</fieldset>)}</div></details>
    <details className="math-text-equivalent"><summary>Read the graph as text</summary><p>{coordinateText}</p><p>Both axes run from −5 to 5. Values snap to half a unit. The amber segment is horizontal run; the green segment is vertical rise.</p>{notes.map((note, i) => <p key={i}><strong>{note.label}</strong>: {note.description}</p>)}{takeaway && <p>{takeaway}</p>}</details></div>
  </div>;
}
