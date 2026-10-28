import React, { useMemo, useState } from "react";
import { Download, Maximize2, Minimize2, Sun, Moon } from "lucide-react";

import { sanitizeSvgMarkup } from "../../services/learning/safeSvg";
export { sanitizeSvgMarkup } from "../../services/learning/safeSvg";

export const SvgIllustration: React.FC<{ rawSvg: string }> = ({ rawSvg }) => {
  const sanitized = useMemo(() => sanitizeSvgMarkup(rawSvg), [rawSvg]);
  const [zoomed, setZoomed] = useState(false);
  const [lightBackdrop, setLightBackdrop] = useState(false);

  if (!sanitized) return <p className="visual-fallback" role="status">This illustration couldn’t be displayed. Ask for a simpler drawing or a text explanation.</p>;

  const handleDownload = () => {
    const blob = new Blob([sanitized.svg], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitized.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "illustration"}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <figure
      className={`svg-illustration-card ${zoomed ? "is-zoomed" : ""} ${
        lightBackdrop ? "is-light-canvas" : ""
      }`}
      aria-label={sanitized.title}
    >
      <figcaption className="svg-illustration-toolbar">
        <span className="svg-illustration-title">{sanitized.title}</span>
        <div className="svg-illustration-actions">
          <button
            type="button"
            onClick={() => setLightBackdrop((v) => !v)}
            title={
              lightBackdrop
                ? "Switch to dark canvas"
                : "Switch to light canvas"
            }
            aria-label="Toggle canvas backdrop"
          >
            {lightBackdrop ? <Moon size={13} /> : <Sun size={13} />}
            <span>{lightBackdrop ? "Dark" : "Light"}</span>
          </button>
          <button
            type="button"
            onClick={() => setZoomed((v) => !v)}
            aria-pressed={zoomed}
            title={zoomed ? "Reset zoom" : "Enlarge illustration"}
          >
            {zoomed ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{zoomed ? "1x" : "Zoom"}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title="Download SVG illustration"
          >
            <Download size={13} />
            <span>SVG</span>
          </button>
        </div>
      </figcaption>
      <div
        className="svg-illustration-stage"
        dangerouslySetInnerHTML={{ __html: sanitized.svg }}
      />
      <details className="illustration-text"><summary>Read as text</summary><p>{sanitized.description}</p></details>
    </figure>
  );
};

export interface PictogramSpec {
  kind: "hotspots" | "palette" | "quadrant";
  title: string;
  summary?: string;
  svg?: string;
  xAxis?: string;
  yAxis?: string;
  items: {
    id: string;
    label: string;
    detail: string;
    color?: string;
    quadrant?: string;
    x?: number;
    y?: number;
  }[];
}

export function parsePictogramSpec(raw: string): PictogramSpec | null {
  if (raw.length > 60000) return null;
  try {
    const parsed = JSON.parse(raw.trim());
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !["hotspots", "palette", "quadrant"].includes(parsed.kind) ||
      typeof parsed.title !== "string" ||
      !Array.isArray(parsed.items) ||
      parsed.items.length < 2
    ) {
      return null;
    }
    if (parsed.items.length > 8 || parsed.title.length > 140 || !parsed.title.trim() ||
      parsed.items.some((item: any) => !item || typeof item.id !== "string" || !/^[\w-]{1,48}$/.test(item.id) ||
        typeof item.label !== "string" || !item.label.trim() || item.label.length > 100 ||
        typeof (item.detail ?? item.description) !== "string" || (item.detail ?? item.description).length > 700) ||
      new Set(parsed.items.map((item: any) => item.id)).size !== parsed.items.length) return null;
    return {
      kind: parsed.kind,
      title: parsed.title.trim(),
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : undefined,
      svg: typeof parsed.svg === "string" ? parsed.svg : undefined,
      xAxis: typeof parsed.xAxis === "string" ? parsed.xAxis : undefined,
      yAxis: typeof parsed.yAxis === "string" ? parsed.yAxis : undefined,
      items: parsed.items
        .slice(0, 8)
        .map((item: any, idx: number) => ({
          id: String(item?.id || `p-${idx + 1}`),
          label: String(item?.label || `Part ${idx + 1}`),
          detail: String(item?.detail || item?.description || ""),
          color: typeof item?.color === "string" ? item.color : undefined,
          quadrant: typeof item?.quadrant === "string" ? item.quadrant : undefined,
          x: typeof item?.x === "number" ? Math.max(8, Math.min(92, item.x)) : undefined,
          y: typeof item?.y === "number" ? Math.max(8, Math.min(92, item.y)) : undefined,
        })),
    };
  } catch {
    return null;
  }
}

export const PictogramCard: React.FC<{ spec: PictogramSpec }> = ({ spec }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const current = spec.items[Math.min(activeIndex, spec.items.length - 1)];
  const sanitizedSvg = useMemo(
    () => (spec.svg ? sanitizeSvgMarkup(spec.svg) : null),
    [spec.svg]
  );

  return (
    <div className={`pictogram-card is-${spec.kind}`} aria-label={spec.title}>
      <div className="pictogram-header">
        <strong>{spec.title}</strong>
        <span className="pictogram-kind-badge">
          {spec.kind === "palette"
            ? "Visual Swatches"
            : spec.kind === "quadrant"
            ? "2×2 Matrix"
            : "Interactive Diagram"}
        </span>
      </div>
      {spec.summary && <p className="pictogram-summary">{spec.summary}</p>}

      {spec.kind === "palette" && (
        <div className="pictogram-palette-grid" role="group">
          {spec.items.map((item, idx) => {
            const hex =
              item.color && /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\))$/.test(item.color)
                ? item.color
                : ["#e5aa72", "#4ade80", "#60a5fa", "#f472b6", "#a78bfa", "#facc15"][
                    idx % 6
                  ];
            return (
              <button
                key={item.id}
                type="button"
                className={`pictogram-swatch ${
                  idx === activeIndex ? "is-selected" : ""
                }`}
                aria-pressed={idx === activeIndex}
                onClick={() => setActiveIndex(idx)}
              >
                <span
                  className="pictogram-swatch-chip"
                  style={{ background: hex }}
                />
                <strong>{item.label}</strong>
                <code>{hex}</code>
              </button>
            );
          })}
        </div>
      )}

      {spec.kind === "quadrant" && (
        <div className="pictogram-quadrant-wrap">
          {(spec.yAxis || spec.xAxis) && (
            <div className="pictogram-axes">
              {spec.yAxis && <span>↕ {spec.yAxis}</span>}
              {spec.xAxis && <span>↔ {spec.xAxis}</span>}
            </div>
          )}
          <div className="pictogram-quadrant-grid" role="group">
            {spec.items.slice(0, 4).map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`pictogram-quadrant-cell ${
                  idx === activeIndex ? "is-selected" : ""
                }`}
                aria-pressed={idx === activeIndex}
                onClick={() => setActiveIndex(idx)}
              >
                <small>{item.quadrant || `Quadrant ${idx + 1}`}</small>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {spec.kind === "hotspots" && (
        <div className="pictogram-hotspot-stage">
          {sanitizedSvg && (
            <div
              className="pictogram-hotspot-svg"
              dangerouslySetInnerHTML={{ __html: sanitizedSvg.svg }}
            />
          )}
          <div
            className={`pictogram-hotspot-pins ${
              sanitizedSvg ? "over-svg" : "pin-row"
            }`}
            role="group"
          >
            {spec.items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`pictogram-pin ${
                  idx === activeIndex ? "is-selected" : ""
                }`}
                aria-pressed={idx === activeIndex}
                style={
                  sanitizedSvg &&
                  typeof item.x === "number" &&
                  typeof item.y === "number"
                    ? { left: `${item.x}%`, top: `${item.y}%` }
                    : undefined
                }
                onClick={() => setActiveIndex(idx)}
              >
                <i>{idx + 1}</i>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {current && (
        <div className="pictogram-detail" role="status">
          <strong>
            {activeIndex + 1}. {current.label}
          </strong>
          <p>{current.detail}</p>
        </div>
      )}
    </div>
  );
};
