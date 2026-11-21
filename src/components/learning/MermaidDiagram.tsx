import React, { useEffect, useId, useMemo, useState } from "react";
import type { MermaidConfig } from "mermaid";
import { Maximize2, Minimize2, Moon, Pencil, Sun } from "lucide-react";
import type { FigureTheme } from "../../services/learning/figureTheme";
import { useFigureTheme } from "./useFigureTheme";

interface MermaidDiagramProps {
  code: string;
}

const ZOOM_MIN = 60;
const ZOOM_MAX = 180;
const ZOOM_STEP = 20;

const MERMAID_FONT_FAMILY =
  '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

const MERMAID_SECURE_KEYS = [
  "secure",
  "securityLevel",
  "startOnLoad",
  "maxTextSize",
  "suppressErrorRendering",
  "maxEdges",
  "themeCSS",
];

/**
 * Builds a Mermaid 12 configuration synchronized with LearnForge's dark/light
 * paper theme, classic/hand-drawn sketch look, and optional ELK layout engine.
 */
export function buildMermaidConfig(
  theme: FigureTheme,
  sketch: boolean,
  useElk: boolean
): MermaidConfig {
  const darkThemeVariables = {
    darkMode: true,
    background: "#0e1217",
    primaryColor: "#1b222c",
    primaryTextColor: "#eef2f7",
    primaryBorderColor: "#d4b08c",
    lineColor: "#8fc9bb",
    secondaryColor: "#162028",
    tertiaryColor: "#241f1a",
    clusterBkg: "#131922",
    clusterBorder: "#4e5d70",
    titleColor: "#f0dfcb",
    textColor: "#eef2f7",
    noteBkgColor: "#211d18",
    noteTextColor: "#f0e1cf",
    noteBorderColor: "#9c7e5e",
    edgeLabelBackground: "#141920",
  };

  const lightThemeVariables = {
    darkMode: false,
    background: "#faf8f2",
    primaryColor: "#f2efe6",
    primaryTextColor: "#202827",
    primaryBorderColor: "#8c6d4f",
    lineColor: "#315e55",
    secondaryColor: "#edf3eb",
    tertiaryColor: "#f5ede2",
    clusterBkg: "#f4f1e8",
    clusterBorder: "#9aa59c",
    titleColor: "#202827",
    textColor: "#202827",
    noteBkgColor: "#f6efe3",
    noteTextColor: "#303b35",
    noteBorderColor: "#a88a68",
    edgeLabelBackground: "#faf8f2",
  };

  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    secure: MERMAID_SECURE_KEYS,
    theme: "base",
    look: sketch ? "handDrawn" : "classic",
    ...(sketch ? { handDrawnSeed: 42 } : {}),
    layout: useElk ? "elk" : "dagre",
    ...(useElk
      ? {
          elk: {
            mergeEdges: false,
            nodePlacementStrategy: "BRANDES_KOEPF",
          },
        }
      : {}),
    fontFamily: MERMAID_FONT_FAMILY,
    themeVariables: theme === "light" ? lightThemeVariables : darkThemeVariables,
  };
}

function parseSvgNaturalWidth(svgMarkup: string | null): number | null {
  if (!svgMarkup) return null;
  const vbMatch = /\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+[\d.]+\s*["']/i.exec(
    svgMarkup
  );
  if (vbMatch) {
    const w = Number(vbMatch[1]);
    if (Number.isFinite(w) && w > 0) return w;
  }
  const maxWMatch = /max-width:\s*([\d.]+)px/i.exec(svgMarkup);
  if (maxWMatch) {
    const w = Number(maxWMatch[1]);
    if (Number.isFinite(w) && w > 0) return w;
  }
  return null;
}

// Serialize global mermaid.initialize + render calls so concurrent diagrams
// with different sketch/theme settings never race on shared config state.
let renderQueue: Promise<void> = Promise.resolve();
let renderSeq = 0;

function enqueueMermaidRender<T>(task: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(task, task);
  renderQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code }) => {
  const reactId = useId();
  const { theme, toggleTheme } = useFigureTheme();
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sketch, setSketch] = useState(false);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    let active = true;
    const trimmed = code.trim();
    if (!trimmed || typeof window === "undefined") return;
    setFailed(false);

    const idPrefix = `lf-mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

    void enqueueMermaidRender(async () => {
      if (!active) return;
      const mermaidMod = await import("mermaid");
      const mermaid = mermaidMod.default;

      const renderWithEngine = async (useElk: boolean): Promise<string> => {
        renderSeq += 1;
        const safeId = `${idPrefix}-${useElk ? "elk" : "std"}-${renderSeq}`;
        try {
          mermaid.initialize(buildMermaidConfig(theme, sketch, useElk));
          const { svg } = await mermaid.render(safeId, trimmed);
          return svg;
        } catch (err) {
          document.getElementById(`d${safeId}`)?.remove();
          throw err;
        }
      };

      try {
        let svg: string;
        try {
          svg = await renderWithEngine(true);
        } catch {
          // Cleanly fall back to default dagre layout if ELK rejects this diagram type.
          svg = await renderWithEngine(false);
        }
        if (active) {
          setSvgMarkup(svg);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      }
    });

    return () => {
      active = false;
    };
  }, [code, reactId, theme, sketch]);

  const naturalWidth = useMemo(() => parseSvgNaturalWidth(svgMarkup), [svgMarkup]);
  const zoomStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (zoom === 100) return undefined;
    if (naturalWidth) {
      return {
        "--mermaid-zoom-width": `${Math.round((naturalWidth * zoom) / 100)}px`,
      } as React.CSSProperties;
    }
    return {
      "--mermaid-zoom-width": `${zoom}%`,
    } as React.CSSProperties;
  }, [zoom, naturalWidth]);

  if (failed && !svgMarkup) {
    return (
      <figure
        className="forge-mermaid-card"
        data-theme={theme}
        aria-label="Architecture diagram source"
      >
        <div className="canvas-sandbox-pending" role="status">
          Could not render architecture diagram.
        </div>
        <details className="illustration-text">
          <summary>View diagram source</summary>
          <pre>
            <code>{code.trim()}</code>
          </pre>
        </details>
      </figure>
    );
  }

  if (!svgMarkup) {
    return (
      <div className="canvas-sandbox-pending" role="status">
        Rendering architecture diagram...
      </div>
    );
  }

  return (
    <figure
      className={`forge-mermaid-card ${expanded ? "is-expanded" : ""}`}
      data-theme={theme}
    >
      <div className="forge-mermaid-toolbar">
        <span className="canvas-sandbox-badge">Architecture Diagram</span>
        <div className="forge-mermaid-actions">
          <div
            className="forge-mermaid-zoom"
            role="group"
            aria-label="Diagram zoom"
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out"
              title="Zoom out"
            >
              -
            </button>
            <button
              type="button"
              className="forge-mermaid-zoom-pct"
              onClick={() => setZoom(100)}
              aria-label={`Reset zoom (${zoom}%)`}
              title="Reset zoom to 100%"
            >
              {zoom}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={`canvas-sandbox-btn ${sketch ? "is-active" : ""}`}
            aria-pressed={sketch}
            title={sketch ? "Switch to clean lines" : "Switch to hand-drawn sketch look"}
            onClick={() => setSketch((v) => !v)}
          >
            <Pencil size={12} aria-hidden="true" />
            <span>{sketch ? "Clean" : "Sketch"}</span>
          </button>
          <button
            type="button"
            className={`canvas-sandbox-btn ${theme === "light" ? "is-active" : ""}`}
            aria-pressed={theme === "light"}
            title="Toggle light paper"
            onClick={toggleTheme}
          >
            {theme === "light" ? (
              <Moon size={12} aria-hidden="true" />
            ) : (
              <Sun size={12} aria-hidden="true" />
            )}
            <span>Light paper</span>
          </button>
          <button
            type="button"
            className={`canvas-sandbox-btn ${expanded ? "is-active" : ""}`}
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <Minimize2 size={12} aria-hidden="true" />
            ) : (
              <Maximize2 size={12} aria-hidden="true" />
            )}
            <span>{expanded ? "Compact" : "Expand"}</span>
          </button>
        </div>
      </div>
      <div className="forge-mermaid-stage">
        <div
          className={`forge-mermaid-zoom-inner ${zoom !== 100 ? "is-zoomed" : ""}`}
          style={zoomStyle}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    </figure>
  );
};
