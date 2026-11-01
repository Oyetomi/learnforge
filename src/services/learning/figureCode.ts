import type { EntitySnapshot } from './stateModel';

/** A conservative fallback for saved figures that predate explicit code metadata. */
function standaloneCode(value: string): boolean {
  if (value.includes('$')) return false;
  return /^(?:(?:export|pub|public|private|static|async|final|abstract)\s+)*(?:type|func|fn|struct|interface|impl|class|def|const|let|var|function)\b[\s\S]*[{}():=;]/.test(value) ||
    /^(?:SELECT\b[\s\S]*\bFROM\b|CREATE\s+TABLE\b)/i.test(value) ||
    /^\w+\([^\n)]*\)\s+[\w*[\].<>]+(?:\s*[,;]\s*\w+\([^\n)]*\)\s+[\w*[\].<>]+)+$/.test(value);
}

/** Preserve authored bytes/indentation. Rendering never rewrites or executes code. */
export function figureCode(snapshot: EntitySnapshot, inheritedLanguage = ''): { code: string; language: string } | null {
  if (snapshot.format === 'text') return null;
  const value = snapshot.value;
  const fenced = /^\s*```([\w+#.-]*)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(value);
  if (fenced) return { code: fenced[2], language: snapshot.language || fenced[1] || inheritedLanguage };
  if (snapshot.format === 'code') return { code: value, language: snapshot.language || inheritedLanguage };
  const inline = /^`([^`]+)`$/.exec(value.trim());
  const candidate = inline ? inline[1] : value.trim();
  return standaloneCode(candidate) ? { code: candidate, language: inheritedLanguage } : null;
}
