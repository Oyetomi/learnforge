/** An explicit request, not a guess about the learner's ability. The UI can override it. */
export function requestsDiagnosticFirst(goal: string): boolean {
  if (/\b(?:no|skip|without|don['’]t(?:\s+want)?|do not)\s+(?:a\s+|any\s+)?(?:diagnostic|quiz|probe|placement)/i.test(goal)) return false;
  return /\b(?:diagnostic[- ]first|(?:start|begin)\s+with\s+(?:a\s+)?(?:short\s+|quick\s+)?(?:diagnostic|quiz|probe)|(?:assess|check|test)\s+(?:my\s+)?(?:understanding|knowledge|starting point)\s+(?:first|before))/i.test(goal);
}
