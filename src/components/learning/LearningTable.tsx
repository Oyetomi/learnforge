import React, { useEffect, useRef, useState } from "react";
import "./learning-table.css";

/** Semantic Markdown tables stay readable without making the whole lesson wider. */
export function LearningTable({ children }: { children?: React.ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [children]);
  return <figure className="learning-table">
    <div ref={scroll} className="learning-table-scroll" tabIndex={overflow ? 0 : undefined} role={overflow ? "region" : undefined} aria-label={overflow ? "Learning table, scroll horizontally for more columns" : undefined}>
      <table>{children}</table>
    </div>
    {overflow && <figcaption>Scroll horizontally to compare all columns.</figcaption>}
  </figure>;
}
