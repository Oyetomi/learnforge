import "./visual-example.css";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
} from "lucide-react";
import type { VisualExample as VisualSpec } from "../../services/learning/visuals";
import { StateWalkthrough } from "./StateWalkthrough";
import { SlopeGraph } from "./SlopeGraph";
import { ParameterExplorer } from "./ParameterExplorer";
import { TeachingSimulation, PhraseBuilder } from "./TeachingSimulation";
import { recordVisualSupport } from "../../services/learning/preferences";
interface Props {
  visual: VisualSpec;
  visualId: string;
  supportCheckId?: string;
  defaultOpen?: boolean;
  onTryFreshCase?: () => void;
  isBusy?: boolean;
}
/** Owned, text-only renderers. Model output never becomes executable markup. */
export function VisualExample({
  visual,
  visualId,
  supportCheckId,
  defaultOpen = true,
  onTryFreshCase,
  isBusy,
}: Props) {
  const [open, setOpen] = useState(defaultOpen),
    [selected, setSelected] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const markSupport = () => {
    if (supportCheckId) recordVisualSupport(supportCheckId, visualId);
  };
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  useEffect(() => {
    if (!open || !supportCheckId || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          recordVisualSupport(supportCheckId, visualId);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [open, supportCheckId, visualId]);
  const current = visual.items[Math.min(selected, visual.items.length - 1)];
  return (
    <section
      ref={ref}
      className={`visual-example visual-${visual.kind}`}
      aria-label={`Visual example: ${visual.title}`}
    >
      <header>
        <button
          type="button"
          className="visual-disclosure"
          aria-expanded={open}
          onClick={() => {
            if (!open) markSupport();
            setOpen((v) => !v);
          }}
        >
          <Eye size={15} />
          <span>{visual.title}</span>
          <small>{open ? "Hide" : "Show"}</small>
        </button>
      </header>
      {open && (
        <div className="visual-example-body">
          <p className="visual-summary">{visual.summary}</p>
          {visual.kind === "state-model" && visual.stateModel ? (
            <StateWalkthrough model={visual.stateModel} onInteract={markSupport} notes={visual.items} takeaway={visual.takeaway}/>
          ) : visual.kind === "explorer" && visual.explorer ? (
            <ParameterExplorer
              key={`${visualId}:${resetCount}`}
              spec={visual.explorer}
              title={visual.title}
              onInteract={markSupport}
            />
          ) : visual.kind === "graph" && visual.graph ? (
            <SlopeGraph key={`${visualId}:${resetCount}`} graph={visual.graph} onInteract={markSupport} notes={visual.items} takeaway={visual.takeaway}/>
          ) : visual.kind === "simulation" && visual.model ? (
            <TeachingSimulation
              key={resetCount}
              model={visual.model}
              onInteract={markSupport}
            />
          ) : visual.kind === "phrase-builder" ? (
            <PhraseBuilder
              key={resetCount}
              visual={visual}
              onInteract={markSupport}
            />
          ) : (
            <>
              <div
                className="visual-items"
                role="group"
                aria-label={
                  visual.kind === "parts"
                    ? "Explore each part"
                    : "Explore this example"
                }
              >
                {visual.items.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && visual.kind === "flow" && (
                      <span className="visual-flow-arrow" aria-hidden="true">
                        <ArrowRight size={18} />
                      </span>
                    )}
                    <button
                      type="button"
                      aria-pressed={index === selected}
                      onClick={() => {
                        markSupport();
                        setSelected(index);
                      }}
                      className="visual-item"
                    >
                      {(visual.kind === "steps" || visual.kind === "flow") && (
                        <small>{index + 1}</small>
                      )}
                      <span>{item.label}</span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <div className="visual-caption" aria-live="polite">
                <span className="visual-caption-label">{current.label}</span>
                <p>{current.description}</p>
              </div>
              {(visual.kind === "steps" || visual.kind === "flow") && (
                <div className="visual-step-controls">
                  <button
                    type="button"
                    disabled={selected === 0}
                    onClick={() => setSelected((i) => i - 1)}
                    aria-label="Previous visual step"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span>
                    Step {selected + 1} of {visual.items.length}
                  </span>
                  <button
                    type="button"
                    disabled={selected === visual.items.length - 1}
                    onClick={() => setSelected((i) => i + 1)}
                    aria-label="Next visual step"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
          {visual.kind !== "graph" && <p className="visual-takeaway">{visual.takeaway}</p>}
          <details className="visual-text-version">
            <summary>Read as text</summary>
            <ol>
              {visual.items.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong> — {item.description}
                </li>
              ))}
            </ol>
          </details>
          <footer>
            <button
              type="button"
              className="visual-reset"
              onClick={() => {
                setSelected(0);
                setResetCount((n) => n + 1);
              }}
            >
              <RotateCcw size={13} />
              Start again
            </button>
            {onTryFreshCase && visual.kind !== "graph" && (
              <button
                type="button"
                className="visual-fresh"
                disabled={isBusy}
                onClick={() => {
                  setOpen(false);
                  onTryFreshCase();
                }}
              >
                Try a different case
                <ArrowRight size={14} />
              </button>
            )}
          </footer>
        </div>
      )}
    </section>
  );
}
