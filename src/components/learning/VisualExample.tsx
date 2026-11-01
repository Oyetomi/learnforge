import "./visual-example.css";
import "./visual-workbench.css";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Ellipsis,
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
import { ScientificFigure } from "./ScientificFigure";
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
  const [textOpen, setTextOpen] = useState(false);
  const contentId = useId();
  const optionsRef = useRef<HTMLDetailsElement>(null);
  const [narrating, setNarrating] = useState(false);
  const ref = useRef<HTMLElement>(null);

  const speechAvailable = isSpeechOutputSupported();

  const markSupport = () => {
    if (supportCheckId) recordVisualSupport(supportCheckId, visualId);
  };

  useEffect(() => setOpen(defaultOpen), [defaultOpen]);

  useEffect(() => {
    setSelected(0);
    setTextOpen(false);
    setNarrating(false);
    return () => stopNaturalSpeech();
  }, [visualId]);

  useEffect(() => {
    if ((!open && !embedded) || !supportCheckId || !ref.current) return;
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
  }, [open, embedded, supportCheckId, visualId]);

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

  const ownsExplanation =
    visual.kind === "graph" || visual.kind === "state-model";
  const canReset = ![
    "canvas",
    "explorer",
    "state-model",
    "simulation",
    "phrase-builder",
  ].includes(visual.kind);
  const hasOptions =
    onRequestFreshVisual ||
    (speechAvailable && !narrating) ||
    canReset ||
    (onTryFreshCase && visual.kind !== "graph");
  const closeOptions = () => {
    if (!optionsRef.current) return;
    optionsRef.current.open = false;
    optionsRef.current.querySelector("summary")?.focus();
  };
  const toolButtons = hasOptions ? (
    <>
      {speechAvailable && !narrating && (
        <button
          type="button"
          aria-pressed={narrating}
          onClick={() => {
            toggleNarration();
            closeOptions();
          }}
        >
          {narrating ? <Square size={13} /> : <Volume2 size={14} />}
          {narrating ? "Stop audio" : "Listen to explanation"}
        </button>
      )}
      {canReset && (
        <button
          type="button"
          onClick={() => {
            stopNaturalSpeech();
            setNarrating(false);
            setSelected(0);
            setTextOpen(false);
            setResetCount((count) => count + 1);
            closeOptions();
          }}
        >
          <RotateCcw size={14} /> Reset model
        </button>
      )}
      {onRequestFreshVisual && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            closeOptions();
            onRequestFreshVisual();
          }}
        >
          <RefreshCw size={14} /> {visual.kind === "canvas" ? "Redraw as a figure" : "Generate another figure"}
        </button>
      )}
      {onTryFreshCase && visual.kind !== "graph" && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            closeOptions();
            onTryFreshCase();
          }}
        >
          Try another question
        </button>
      )}
    </>
  ) : null;
  const secondaryActions = visual.kind !== "canvas" && hasOptions ? (
    <details
      className="visual-workbench-options"
      ref={optionsRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeOptions();
        }
      }}
    >
      <summary aria-label="More visual options">
        <Ellipsis size={16} aria-hidden="true" />
        <span>More options</span>
      </summary>
      <div className="visual-workbench-options-content">{toolButtons}</div>
    </details>
  ) : null;
  const stopAudio = narrating ? (
    <button
      type="button"
      className="visual-workbench-stop-audio"
      onClick={() => {
        stopNaturalSpeech();
        setNarrating(false);
      }}
    >
      <Square size={12} aria-hidden="true" /> Stop audio
    </button>
  ) : null;

  return (
    <section
      ref={ref}
      className={`visual-example visual-workbench visual-${visual.kind} ${
        embedded ? "is-embedded" : ""
      }`}
      aria-label={`Visual example: ${visual.title}`}
    >
      {!embedded && (
        <header className="visual-workbench-header">
          <button
            type="button"
            className="visual-workbench-disclosure"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => {
              if (!open) markSupport();
              else {
                stopNaturalSpeech();
                setNarrating(false);
              }
              setOpen((value) => !value);
            }}
          >
            <ChevronDown size={15} aria-hidden="true" />
            <span>{visual.title}</span>
            <small>{open ? "Hide" : "Show"}</small>
          </button>
          {open && stopAudio}
          {open && secondaryActions}
        </header>
      )}
      {(open || embedded) && (
        <div id={contentId} className="visual-example-body visual-workbench-body">
          {embedded && (secondaryActions || stopAudio) && (
            <div className="visual-workbench-utilities">
              {stopAudio}
              {secondaryActions}
            </div>
          )}
          {!ownsExplanation && visual.kind !== "canvas" && visual.kind !== "explorer" && (
            <p className="visual-workbench-summary">
              <VisualRichText text={visual.summary} language={language} />
            </p>
          )}

          {visual.kind === "state-model" && visual.stateModel ? (
            <ScientificFigure model={visual.stateModel} onInteract={markSupport} notes={visual.items} takeaway={visual.takeaway} />
          ) : visual.kind === "canvas" && visual.canvas ? (
            <CanvasSandbox
              key={`${visualId}:${resetCount}`}
              spec={visual.canvas}
              title={visual.title}
              summary={visual.summary}
              takeaway={visual.takeaway}
              isBusy={isBusy}
              extraTools={toolButtons}
              onInteract={markSupport}
              onRuntimeError={() => setTextOpen(true)}
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

          {!ownsExplanation && (
            <details
              className="visual-workbench-explanation"
              open={textOpen}
              onToggle={(event) => {
                setTextOpen(event.currentTarget.open);
                if (event.currentTarget.open) markSupport();
              }}
            >
              <summary>
                {visual.kind === "canvas" || visual.kind === "explorer"
                  ? "How it works"
                  : "Read as text"}
              </summary>
              <div className="visual-workbench-explanation-content">
                {(visual.kind === "canvas" || visual.kind === "explorer") && (
                  <p className="visual-workbench-summary">
                    <VisualRichText text={visual.summary} language={language} />
                  </p>
                )}
                <ol className="visual-workbench-notes">
                  {visual.items.map((item) => (
                    <li key={item.id}>
                      <strong><VisualRichText text={item.label} language={language} /></strong>
                      <p><VisualRichText text={item.description} language={language} /></p>
                    </li>
                  ))}
                </ol>
                {visual.takeaway && (
                  <p className="visual-workbench-takeaway">
                    <strong>Remember</strong>{" "}
                    <VisualRichText text={visual.takeaway} language={language} />
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
