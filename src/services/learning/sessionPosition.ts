export type SessionActivity = "lesson" | "reference" | "check" | "reply" | "visual";
export interface SessionPosition {
  activity: SessionActivity; stepIndex: number; replyIndex: number; replyId?: string; questionId?: string;
  scrollTop: number; helpOpen: boolean; helpKind: "hint" | "walkthrough" | "visual";
}
export function readSessionPosition(key: string): SessionPosition | null {
  try { const v = JSON.parse(localStorage.getItem(`learnforge:session-position:${key}`) || "null");
    if (!v || !["lesson", "reference", "check", "reply", "visual"].includes(v.activity)) return null;
    return { activity: v.activity, stepIndex: Number.isInteger(v.stepIndex) && v.stepIndex >= 0 ? v.stepIndex : 0,
      replyIndex: Number.isInteger(v.replyIndex) && v.replyIndex >= 0 ? v.replyIndex : 0,
      replyId: typeof v.replyId === "string" ? v.replyId : undefined, questionId: typeof v.questionId === "string" ? v.questionId : undefined,
      scrollTop: Number.isFinite(v.scrollTop) ? Math.max(0, v.scrollTop) : 0, helpOpen: v.helpOpen === true,
      helpKind: ["hint", "walkthrough", "visual"].includes(v.helpKind) ? v.helpKind : "walkthrough" };
  } catch { return null; }
}
export function saveSessionPosition(key: string, position: SessionPosition) {
  try { localStorage.setItem(`learnforge:session-position:${key}`, JSON.stringify(position)); } catch { /* session stays usable */ }
}
export function canRestorePosition(position: SessionPosition | null, context: { hasLesson: boolean; hasVisual: boolean; replyId?: string; questionId?: string }): boolean {
  if (!position) return false;
  if (position.activity === "lesson") return context.hasLesson;
  if (position.activity === "visual") return context.hasVisual;
  if (position.activity === "reply") return !!context.replyId && context.replyId === position.replyId;
  return !!context.questionId && context.questionId === position.questionId;
}
