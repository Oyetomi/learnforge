import { useEffect, useState } from "react";
import { FIGURE_THEME_EVENT, loadFigureTheme, saveFigureTheme } from "../../services/learning/figureTheme";

export function useFigureTheme() {
  const [theme, setTheme] = useState(loadFigureTheme);
  useEffect(() => {
    const sync = (event: Event) => {
      const value = (event as CustomEvent).detail;
      setTheme(value === "light" || value === "dark" ? value : loadFigureTheme());
    };
    window.addEventListener(FIGURE_THEME_EVENT, sync);
    return () => window.removeEventListener(FIGURE_THEME_EVENT, sync);
  }, []);
  return { theme, toggleTheme: () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); saveFigureTheme(next);
  } };
}
