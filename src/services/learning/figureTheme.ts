export type FigureTheme = "dark" | "light";
const key = "learnforge:figure-theme";
export const FIGURE_THEME_EVENT = "learnforge:figure-theme";
export function loadFigureTheme(): FigureTheme {
  try { return localStorage.getItem(key) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}
export function saveFigureTheme(theme: FigureTheme) {
  try { localStorage.setItem(key, theme); } catch { /* Still works for this view. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FIGURE_THEME_EVENT, { detail: theme }));
}
