import React from 'react';
import { renderToString } from 'katex';
import 'katex/dist/katex.min.css';
import { MATH_RENDER_OPTIONS } from '../../services/learning/math';

/** The same bounded renderer for learner-facing equations and graph annotations. */
export function MathFormula({ tex, label, className = '' }: { tex: string; label?: string; className?: string }) {
  let html: string;
  try {
    if (tex.length > 4000) throw new Error('Formula too long');
    html = renderToString(tex, { ...MATH_RENDER_OPTIONS, displayMode: true, throwOnError: true });
  } catch {
    return <div className={`math-formula math-fallback ${className}`}><span>Formula unavailable. {label || 'The notation could not be rendered.'}</span><code>{tex.slice(0, 4000)}</code></div>;
  }
  return <div className={`math-formula ${className}`} {...(label ? { role: 'img', 'aria-label': label } : {})} dangerouslySetInnerHTML={{ __html: html }} />;
}
