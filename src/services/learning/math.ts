import type { KatexOptions } from 'katex';
/** Resource limits apply to prose, saved ladders and interactive equations alike. */
export const MATH_RENDER_OPTIONS: KatexOptions = {
  output: 'htmlAndMathml', trust: false, strict: 'ignore', maxExpand: 300, maxSize: 12,
};
/** Bounded data for owned math illustrations. Never evaluate model-authored code. */
export interface GraphPoint { x: number; y: number }
export interface SlopeGraphSpec { type: 'slope'; points: [GraphPoint, GraphPoint] }
export const GRAPH_MIN = -5;
export const GRAPH_MAX = 5;
export function graphCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.max(GRAPH_MIN, Math.min(GRAPH_MAX, Math.round(value * 2) / 2)) : 0;
}
export function validateSlopeGraph(value: unknown): SlopeGraphSpec | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type !== 'slope' || !Array.isArray(v.points) || v.points.length !== 2) return null;
  const valid = v.points.every(p => p && typeof p === 'object' && ['x', 'y'].every(k =>
    typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= GRAPH_MIN && p[k] <= GRAPH_MAX && Number.isInteger(p[k] * 2)));
  if (!valid) return null;
  return { type: 'slope', points: v.points.map(p => ({ x: p.x, y: p.y })) as [GraphPoint, GraphPoint] };
}
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
export function slopeBetween(a: GraphPoint, b: GraphPoint) {
  const run = b.x - a.x, rise = b.y - a.y;
  if (run === 0) return { run, rise, kind: rise === 0 ? 'coincident' : 'vertical', tex: '\\text{undefined}', description: rise === 0 ? 'The points overlap. Move one point to define a line.' : 'The line is vertical. Its run is zero, so its slope is undefined.' } as const;
  const divisor = gcd(Math.abs(rise * 2), Math.abs(run * 2));
  let numerator = rise * 2 / divisor, denominator = run * 2 / divisor;
  if (denominator < 0) { numerator *= -1; denominator *= -1; }
  const tex = denominator === 1 ? String(numerator || 0) : `${numerator < 0 ? '-' : ''}\\frac{${Math.abs(numerator)}}{${denominator}}`;
  const description = rise === 0 ? 'The line is horizontal. Its height does not change, so its slope is zero.'
    : `Reading left to right, the line ${rise / run > 0 ? 'rises' : 'falls'}. For every 1 unit to the right, y changes by ${Number((rise / run).toFixed(3))}.`;
  return { run, rise, kind: 'line', tex, description } as const;
}
