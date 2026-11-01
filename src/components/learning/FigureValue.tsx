import React from 'react';
import type { EntitySnapshot } from '../../services/learning/stateModel';
import { figureCode } from '../../services/learning/figureCode';
import { CodeBlock } from '../chat/CodeBlock';
import { VisualRichText } from './VisualRichText';

export function FigureValue({ snapshot, language, title }: { snapshot: EntitySnapshot; language?: string; title: string }) {
  const code = figureCode(snapshot, language);
  return code ? <div className="scientific-figure-code"><CodeBlock code={code.code} language={code.language} title={title} /></div>
    : <VisualRichText text={snapshot.value || '—'} language={language} />;
}
