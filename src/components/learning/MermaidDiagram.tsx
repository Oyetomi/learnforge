import React, { useEffect, useId, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface MermaidDiagramProps {
  code: string;
}

let mermaidInitialized = false;

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code }) => {
  const reactId = useId();
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    const trimmed = code.trim();
    if (!trimmed || typeof window === "undefined") return;

    (async () => {
      try {
        const mermaidMod = await import("mermaid");
        const mermaid = mermaidMod.default;
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            fontFamily:
              '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
            themeVariables: {
              darkMode: true,
              background: "#0e1217",
              primaryColor: "#1b222c",
              primaryTextColor: "#eef2f7",
              primaryBorderColor: "#d4b08c",
              lineColor: "#8fc9bb",
              secondaryColor: "#162028",
              tertiaryColor: "#241f1a",
              noteBkgColor: "#211d18",
              noteTextColor: "#f0e1cf",
              noteBorderColor: "#9c7e5e",
              edgeLabelBackground: "#141920",
            },
          });
          mermaidInitialized = true;
        }
        const safeId = `lf-mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}-${Date.now()}`;
        const { svg } = await mermaid.render(safeId, trimmed);
        if (active) {
          setSvgMarkup(svg);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [code, reactId]);

  if (failed && !svgMarkup) {
    return (
      <div className="canvas-sandbox-pending" role="status">
        Preparing architecture diagram…
      </div>
    );
  }

  if (!svgMarkup) {
    return (
      <div className="canvas-sandbox-pending" role="status">
        Rendering architecture diagram…
      </div>
    );
  }

  return (
    <figure className={`forge-mermaid-card ${expanded ? "is-expanded" : ""}`}>
      <div className="forge-mermaid-toolbar">
        <span className="canvas-sandbox-badge">Architecture Diagram</span>
        <button
          type="button"
          className="canvas-sandbox-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          <span>{expanded ? "Compact" : "Expand"}</span>
        </button>
      </div>
      <div
        className="forge-mermaid-stage"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    </figure>
  );
};
