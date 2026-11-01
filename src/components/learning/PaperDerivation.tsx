import React from "react";
import { useFigureTheme } from "./useFigureTheme";
import "./scientific-figure.css";
import "./paper-derivation.css";

export function PaperDerivation({ className, label, children }: {
  className: string; label: string; children: React.ReactNode;
}) {
  const { theme, toggleTheme } = useFigureTheme();
  return <section className={`scientific-figure paper-derivation ${className}`} data-theme={theme} aria-label={label}>
    <div className="scientific-figure-context"><span>Step-by-step reasoning</span>
      <button type="button" className="scientific-figure-theme" aria-pressed={theme === "light"} title="Toggle light paper" onClick={toggleTheme}>Light paper</button>
    </div>
    {children}
  </section>;
}
