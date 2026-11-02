import type { HelpKind } from "./sessionHelp";

export const HELP_DIVIDER_WIDTH = 12;
export const HELP_SPLIT_MIN_WIDTH = 960;
export const DEFAULT_HELP_RATIOS: Record<HelpKind, number> = { hint: .42, walkthrough: .52, visual: .56 };
const STORAGE_KEY = "learnforge:help-layout";
export function boundedHelpRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(.72, Math.max(.28, value)) : .5;
}
export function helpPaneBounds(stageWidth: number): { available: number; min: number; max: number } {
  const available = Math.max(0, Number.isFinite(stageWidth) ? stageWidth - HELP_DIVIDER_WIDTH : 0);
  const min = Math.min(Math.max(400, available * .28), available / 2);
  return { available, min, max: Math.max(min, Math.min(available - 420, available * .72)) };
}
export function helpPaneWidth(stageWidth: number, ratio: number): number {
  const { available, min, max } = helpPaneBounds(stageWidth);
  return Math.min(max, Math.max(min, available * boundedHelpRatio(ratio)));
}
export function readHelpRatios(): Record<HelpKind, number> {
  const result = { ...DEFAULT_HELP_RATIOS };
  if (typeof window === "undefined") return result;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.version === 1) for (const kind of Object.keys(result) as HelpKind[])
      if (typeof saved[kind] === "number" && Number.isFinite(saved[kind])) result[kind] = boundedHelpRatio(saved[kind]);
  } catch { /* Preferences are optional, including when storage is unavailable. */ }
  return result;
}
export function saveHelpRatio(kind: HelpKind, ratio: number): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...readHelpRatios(), [kind]: boundedHelpRatio(ratio) })); }
  catch { /* Keep the working layout for this session. */ }
}
