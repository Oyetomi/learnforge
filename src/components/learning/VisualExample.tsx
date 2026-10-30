import "./visual-example.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  Layers,
  RefreshCw,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import type { VisualExample as VisualSpec } from "../../services/learning/visuals";
import {
  isSpeechOutputSupported,
  speakNaturalText,
  stopNaturalSpeech,
} from "../../services/learning/speech";
import { deriveSchematicFromLegacyItems } from "../../services/learning/conceptDiagram";
import { StateWalkthrough } from "./StateWalkthrough";
import { SlopeGraph } from "./SlopeGraph";
import { ParameterExplorer } from "./ParameterExplorer";
import { CanvasSandbox } from "./CanvasSandbox";
import {
  analyzeDiagramTopology,
  ConceptSchematicGraph,
} from "./ConceptSchematicGraph";
import { TeachingSimulation, PhraseBuilder } from "./TeachingSimulation";
import { VisualRichText } from "./VisualRichText";
import { recordVisualSupport } from "../../services/learning/preferences";

interface Props {
  visual: VisualSpec;
  visualId: string;
  supportCheckId?: string;
  defaultOpen?: boolean;
  /** Omit duplicate outer disclosure bar when mounted inside `.session-inline-visual`. */
  embedded?: boolean;
  language?: string;
  onTryFreshCase?: () => void;
  onRequestFreshVisual?: () => void;
  onRepairVisual?: (errorMessage: string) => void;
  isBusy?: boolean;
}

const KIND_EYEBROW: Record<VisualSpec["kind"], string> = {
  canvas: "Immersive Simulation",
  explorer: "Mathematical Curve Lab",
  diagram: "Architecture Schematic",
  "state-model": "Interactive State Model",
  graph: "Coordinate Geometry",
  "phrase-builder": "Phrase Studio",
  simulation: "Interactive Model",
  parts: "Interactive Blueprint",
  comparison: "Contrast Schematic",
  flow: "Process Blueprint",
  steps: "Layered Walkthrough",
};

/** Owned declarative renderers, blueprint schematics, Mafs math plotters, and zero-origin 3D/2D sandboxes. */
export function VisualExample({
  visual,
  visualId,
  supportCheckId,
  defaultOpen = true,
  embedded = false,
  language,
  onTryFreshCase,
  onRequestFreshVisual,
  onRepairVisual,
  isBusy,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [selected, setSelected] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [forceTextOpen, setForceTextOpen] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const ref = useRef<HTMLElement>(null);

  const speechAvailable = isSpeechOutputSupported();

  const markSupport = () => {
    if (supportCheckId) recordVisualSupport(supportCheckId, visualId);
  };

  useEffect(() => setOpen(defaultOpen), [defaultOpen]);

  useEffect(() => {
    return () => {
      stopNaturalSpeech();
    };
  }, [visualId]);

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

  const safeIndex = Math.min(selected, Math.max(0, visual.items.length - 1));
  const current = visual.items[safeIndex];

  const derivedSchematic = useMemo(() => {
    if (visual.kind === "diagram" && visual.diagram) return visual.diagram;
    if (
      visual.kind === "parts" ||
      visual.kind === "comparison" ||
      visual.kind === "flow" ||
      visual.kind === "steps"
    ) {
      return deriveSchematicFromLegacyItems(visual.kind, visual.items);
    }
    return null;
  }, [visual]);

  const orderedSchematicNodes = useMemo(
    () =>
      derivedSchematic ? analyzeDiagramTopology(derivedSchematic).orderedNodes : null,
    [derivedSchematic]
  );

  const toggleNarration = () => {
    if (!speechAvailable) return;
    if (narrating) {
      stopNaturalSpeech();
      setNarrating(false);
      return;
    }
    markSupport();
    const activeNode =
      orderedSchematicNodes?.[
        Math.min(selected, Math.max(0, orderedSchematicNodes.length - 1))
      ];
    const layerSpeech = activeNode
      ? `${activeNode.label}. ${activeNode.detail}`
      : current
      ? `${current.label}. ${current.description}`
      : "";
    const script = [
      visual.title,
      visual.summary,
      layerSpeech,
      `Key takeaway: ${visual.takeaway}`,
    ]
      .filter(Boolean)
      .join(". ");

    setNarrating(true);
    void speakNaturalText(script, {
      onEnd: () => setNarrating(false),
      onError: () => setNarrating(false),
    });
  };

  const showExplorationLayers =
    (visual.kind === "canvas" || visual.kind === "explorer") &&
    visual.items.length >= 2;

  return (
    <section
      ref={ref}
      className={`visual-example visual-${visual.kind} ${
        embedded ? "is-embedded" : ""
      }`}
      aria-label={`Visual example: ${visual.title}`}
    >
      {!embedded && (
        <header className="visual-masthead">
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
            <span className="visual-disclosure-copy">
              <em className="visual-eyebrow">{KIND_EYEBROW[visual.kind]}</em>
              <span>{visual.title}</span>
            </span>
            <small>{open ? "Hide" : "Show"}</small>
          </button>
          {open && (onRequestFreshVisual || speechAvailable) && (
            <div className="visual-masthead-actions">
              {onRequestFreshVisual && (
                <button
                  type="button"
                  className="visual-masthead-sim-btn"
                  disabled={isBusy}
                  onClick={onRequestFreshVisual}
                  title="Generate a fresh interactive simulation"
                >
                  <RefreshCw size={12} />
                  <span>
                    {visual.kind === "canvas" || visual.kind === "explorer"
                      ? "Fresh scene"
                      : "Live sim"}
                  </span>
                </button>
              )}
              {speechAvailable && (
                <button
                  type="button"
                  className={`visual-narrate-btn ${
                    narrating ? "is-active" : ""
                  }`}
                  aria-pressed={narrating}
                  onClick={toggleNarration}
                  title={
                    narrating
                      ? "Stop audio walkthrough"
                      : "Listen to guided audio walkthrough"
                  }
                >
                  {narrating ? <Square size={11} /> : <Volume2 size={13} />}
                  <span>{narrating ? "Stop" : "Narrate"}</span>
                </button>
              )}
            </div>
          )}
        </header>
      )}
      {(open || embedded) && (
        <div className="visual-example-body">
          <div className="visual-intro-row">
            <p className="visual-summary">
              <VisualRichText text={visual.summary} language={language} />
            </p>
            {embedded && speechAvailable && (
              <button
                type="button"
                className={`visual-narrate-btn ${narrating ? "is-active" : ""}`}
                aria-pressed={narrating}
                onClick={toggleNarration}
                title={
                  narrating
                    ? "Stop audio walkthrough"
                    : "Listen to guided audio walkthrough"
                }
              >
                {narrating ? <Square size={11} /> : <Volume2 size={13} />}
                <span>{narrating ? "Stop" : "Narrate"}</span>
              </button>
            )}
          </div>

          {visual.kind === "state-model" && visual.stateModel ? (
            <StateWalkthrough
              model={visual.stateModel}
              onInteract={markSupport}
              notes={visual.items}
              takeaway={visual.takeaway}
            />
          ) : visual.kind === "canvas" && visual.canvas ? (
            <CanvasSandbox
              key={`${visualId}:${resetCount}`}
              spec={visual.canvas}
              title={visual.title}
              summary={visual.summary}
              takeaway={visual.takeaway}
              isBusy={isBusy}
              onInteract={markSupport}
              onRuntimeError={() => setForceTextOpen(true)}
              onRepairVisual={onRepairVisual}
            />
          ) : visual.kind === "explorer" && visual.explorer ? (
            <ParameterExplorer
              key={`${visualId}:${resetCount}`}
              spec={visual.explorer}
              title={visual.title}
              onInteract={markSupport}
            />
          ) : visual.kind === "graph" && visual.graph ? (
            <SlopeGraph
              key={`${visualId}:${resetCount}`}
              graph={visual.graph}
              onInteract={markSupport}
              notes={visual.items}
              takeaway={visual.takeaway}
            />
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
          ) : derivedSchematic ? (
            <ConceptSchematicGraph
              spec={derivedSchematic}
              selectedIndex={safeIndex}
              onSelectIndex={(idx) => {
                markSupport();
                setSelected(idx);
              }}
              language={language}
              showStepControls={
                visual.kind === "steps" || visual.kind === "flow"
              }
            />
          ) : null}

          {showExplorationLayers && (
            <div
              className="visual-exploration-layers"
              aria-label="Guided exploration layers"
            >
              <div className="visual-layers-header">
                <Layers size={12} aria-hidden="true" />
                <span>Guided Layers — tap to dig deeper</span>
              </div>
              <div className="visual-layer-pills" role="group">
                {visual.items.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={idx === safeIndex}
                    className="visual-layer-pill"
                    onClick={() => {
                      markSupport();
                      setSelected(idx);
                    }}
                  >
                    <small>0{idx + 1}</small>
                    <span>
                      <VisualRichText text={item.label} language={language} />
                    </span>
                  </button>
                ))}
              </div>
              {current && (
                <div className="visual-layer-detail" aria-live="polite">
                  <p>
                    <VisualRichText
                      text={current.description}
                      language={language}
                    />
                  </p>
                </div>
              )}
            </div>
          )}

          {visual.kind !== "graph" && (
            <div className="visual-takeaway-card">
              <span className="visual-takeaway-label">Key Takeaway</span>
              <p className="visual-takeaway">
                <VisualRichText text={visual.takeaway} language={language} />
              </p>
            </div>
          )}

          <details
            className="visual-text-version"
            open={forceTextOpen || undefined}
          >
            <summary>Read as text</summary>
            <ol>
              {visual.items.map((item) => (
                <li key={item.id}>
                  <strong>
                    <VisualRichText text={item.label} language={language} />
                  </strong>{" "}
                  —{" "}
                  <VisualRichText
                    text={item.description}
                    language={language}
                  />
                </li>
              ))}
            </ol>
          </details>

          <footer>
            <div className="visual-footer-left">
              <button
                type="button"
                className="visual-reset"
                onClick={() => {
                  setSelected(0);
                  setForceTextOpen(false);
                  setResetCount((n) => n + 1);
                }}
              >
                <RotateCcw size={13} />
                Start again
              </button>
            </div>
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
