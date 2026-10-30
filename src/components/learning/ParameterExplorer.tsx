import React, { useEffect, useMemo, useState } from "react";
import { Coordinates, Line, Mafs, Plot, Point } from "mafs";
import "mafs/core.css";
import { RotateCcw, Sliders } from "lucide-react";
import {
  evaluateMathExpression,
  formatSimNumber,
  type ParameterSimSpec,
} from "../../services/learning/parameterSim";
import { VisualRichText } from "./VisualRichText";

interface ParameterExplorerProps {
  spec: ParameterSimSpec;
  title: string;
  onInteract?: () => void;
}

const PLOT_WIDTH = 420;
const PLOT_HEIGHT = 176;
const PAD_X = 38;
const PAD_Y = 20;
const SAMPLE_COUNT = 64;

const GREEK_MAP: Record<string, string> = {
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  delta: "\\delta",
  epsilon: "\\epsilon",
  theta: "\\theta",
  lambda: "\\lambda",
  mu: "\\mu",
  omega: "\\omega",
  phi: "\\phi",
  psi: "\\psi",
  rho: "\\rho",
  sigma: "\\sigma",
  tau: "\\tau",
  PI: "\\pi",
};

function expressionToLatex(expr: string, xVar = "x"): string {
  let tex = expr.trim();
  tex = tex.replace(/\b(?:sin|cos|tan|exp|ln|log)\b/g, (fn) => `\\${fn}`);
  tex = tex.replace(/\bsqrt\s*\(([^()]+)\)/g, "\\sqrt{$1}");
  tex = tex.replace(/\babs\s*\(([^()]+)\)/g, "|$1|");
  tex = tex.replace(/\b([a-zA-Z_]\w*)\b/g, (ident) => {
    if (ident === "x" && xVar && xVar.length <= 3) return xVar;
    if (GREEK_MAP[ident]) return GREEK_MAP[ident];
    if (ident.includes("_")) {
      const [head, ...rest] = ident.split("_");
      return `${GREEK_MAP[head] || head}_{${rest.join("_")}}`;
    }
    return ident;
  });
  tex = tex.replace(/\^\s*\(([^()]+)\)/g, "^{$1}");
  tex = tex.replace(/\^\s*([+-]?\d+(?:\.\d+)?|[a-zA-Z\\]+)/g, "^{$1}");
  tex = tex.replace(/\s*\*\s*/g, " \\cdot ");
  return tex;
}

export const ParameterExplorer: React.FC<ParameterExplorerProps> = ({
  spec,
  title,
  onInteract,
}) => {
  const [clientMounted, setClientMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof ResizeObserver !== "undefined") {
      setClientMounted(true);
    }
  }, []);

  const initialMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of spec.parameters) out[p.id] = p.initial;
    return out;
  }, [spec.parameters]);

  const [values, setValues] = useState<Record<string, number>>(initialMap);
  const [zoomScale, setZoomScale] = useState(1);

  const isModified =
    Math.abs(zoomScale - 1) > 1e-6 ||
    spec.parameters.some(
      (p) => Math.abs((values[p.id] ?? p.initial) - p.initial) > 1e-9
    );

  const updateParam = (id: string, nextValue: number) => {
    onInteract?.();
    setValues((prev) => ({ ...prev, [id]: nextValue }));
  };

  const reset = () => {
    onInteract?.();
    setValues(initialMap);
    setZoomScale(1);
  };

  const computedOutputs = useMemo(
    () =>
      spec.outputs.map((out) => {
        const val = evaluateMathExpression(out.expression, values);
        return {
          ...out,
          raw: val,
          formatted: formatSimNumber(val, out.precision ?? 2),
        };
      }),
    [spec.outputs, values]
  );

  const formulaBannerTex = useMemo(() => {
    if (spec.curve) {
      const yName = spec.curve.yLabel.length <= 16 ? spec.curve.yLabel : "f(x)";
      const xSym = /^[a-zA-Z]$/.test(spec.curve.xLabel.trim())
        ? spec.curve.xLabel.trim()
        : "x";
      return `$${yName} = ${expressionToLatex(spec.curve.expression, xSym)}$`;
    }
    if (spec.outputs[0]) {
      return `$\\text{${spec.outputs[0].label}} = ${expressionToLatex(
        spec.outputs[0].expression
      )}$`;
    }
    return null;
  }, [spec.curve, spec.outputs]);

  const plotData = useMemo(() => {
    const curve = spec.curve;
    if (!curve) return null;
    const points: Array<{ x: number; y: number }> = [];
    let yMin = Infinity;
    let yMax = -Infinity;
    const spanX = curve.xMax - curve.xMin;

    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const x = curve.xMin + (spanX * i) / SAMPLE_COUNT;
      const y = evaluateMathExpression(curve.expression, { ...values, x });
      if (y !== null && Number.isFinite(y)) {
        points.push({ x, y });
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }

    if (points.length < 2 || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      return null;
    }

    if (Math.abs(yMax - yMin) < 1e-6) {
      yMin -= 1;
      yMax += 1;
    } else {
      const pad = (yMax - yMin) * 0.12;
      yMin -= pad;
      yMax += pad;
    }

    const innerW = PLOT_WIDTH - PAD_X * 2;
    const innerH = PLOT_HEIGHT - PAD_Y * 2;
    const toSvgX = (x: number) =>
      PAD_X + ((x - curve.xMin) / (curve.xMax - curve.xMin)) * innerW;
    const toSvgY = (y: number) =>
      PAD_Y + innerH - ((y - yMin) / (yMax - yMin)) * innerH;

    const d = points
      .map(
        (pt, idx) =>
          `${idx === 0 ? "M" : "L"}${toSvgX(pt.x).toFixed(1)},${toSvgY(
            pt.y
          ).toFixed(1)}`
      )
      .join(" ");

    let marker: { cx: number; cy: number; xVal: number; yVal: number } | null =
      null;
    if (curve.markerXExpression) {
      const mx = evaluateMathExpression(curve.markerXExpression, values);
      if (mx !== null && mx >= curve.xMin && mx <= curve.xMax) {
        const my = evaluateMathExpression(curve.expression, {
          ...values,
          x: mx,
        });
        if (my !== null && my >= yMin && my <= yMax) {
          marker = {
            cx: toSvgX(mx),
            cy: toSvgY(my),
            xVal: mx,
            yVal: my,
          };
        }
      }
    }

    const zeroY = yMin <= 0 && yMax >= 0 ? toSvgY(0) : null;

    return {
      d,
      yMin,
      yMax,
      zeroY,
      marker,
      curve,
    };
  }, [spec.curve, values]);

  return (
    <div
      className="parameter-explorer"
      role="region"
      aria-label={`Interactive explorer: ${title}`}
    >
      <div className="parameter-explorer-header">
        <span className="parameter-explorer-badge">
          <Sliders size={13} aria-hidden="true" />
          Interactive instrument
        </span>
        {formulaBannerTex && (
          <span className="parameter-explorer-formula">
            <VisualRichText text={formulaBannerTex} />
          </span>
        )}
        {isModified && (
          <button
            type="button"
            className="parameter-explorer-reset"
            onClick={reset}
          >
            <RotateCcw size={12} aria-hidden="true" />
            Reset defaults
          </button>
        )}
      </div>

      {spec.prompt && (
        <p className="parameter-explorer-prompt">
          <VisualRichText text={spec.prompt} />
        </p>
      )}

      <div className="parameter-explorer-controls">
        {spec.parameters.map((param) => {
          const val = values[param.id] ?? param.initial;
          const decimals =
            param.step < 0.01 ? 3 : param.step < 0.1 ? 2 : param.step < 1 ? 1 : 0;
          return (
            <label
              key={param.id}
              className="parameter-slider-row"
              htmlFor={`sim-param-${param.id}`}
            >
              <span className="parameter-slider-meta">
                <span className="parameter-slider-label">
                  <VisualRichText text={param.label} />
                </span>
                <output
                  htmlFor={`sim-param-${param.id}`}
                  className="parameter-slider-value"
                >
                  {formatSimNumber(val, decimals)}
                  {param.unit ? ` ${param.unit}` : ""}
                </output>
              </span>
              <input
                id={`sim-param-${param.id}`}
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={val}
                onChange={(e) => updateParam(param.id, Number(e.target.value))}
              />
            </label>
          );
        })}
      </div>

      <dl className="parameter-explorer-outputs" aria-live="polite">
        {computedOutputs.map((out) => (
          <div key={out.id} className="parameter-output-card">
            <dt>
              <VisualRichText text={out.label} />
            </dt>
            <dd>
              <strong>{out.formatted}</strong>
              {out.unit && out.raw !== null ? (
                <span className="parameter-output-unit"> {out.unit}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {plotData && (
        <figure className="parameter-explorer-figure">
          {clientMounted ? (
            <div
              className="parameter-mafs-stage"
              aria-label={`Interactive coordinate plot of ${plotData.curve.yLabel} versus ${plotData.curve.xLabel}`}
            >
              <div className="parameter-mafs-axes-legend">
                <span>
                  y: <strong>{plotData.curve.yLabel}</strong> · x:{" "}
                  <strong>{plotData.curve.xLabel}</strong>
                </span>
                {plotData.marker && (
                  <span className="parameter-mafs-coord">
                    ({formatSimNumber(plotData.marker.xVal, 2)},{" "}
                    {formatSimNumber(plotData.marker.yVal, 2)})
                  </span>
                )}
                <span className="parameter-mafs-zoom" role="group" aria-label="Plot zoom">
                  <button
                    type="button"
                    onClick={() =>
                      setZoomScale((z) => Math.max(0.5, Number((z / 1.35).toFixed(2))))
                    }
                    aria-label="Zoom out plot"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    aria-label="Reset plot zoom"
                  >
                    1×
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setZoomScale((z) => Math.min(3.5, Number((z * 1.35).toFixed(2))))
                    }
                    aria-label="Zoom in plot"
                  >
                    +
                  </button>
                </span>
              </div>
              <Mafs
                key={`zoom:${zoomScale}`}
                height={240}
                viewBox={{
                  x: [
                    (plotData.curve.xMin + plotData.curve.xMax) / 2 -
                      (plotData.curve.xMax - plotData.curve.xMin) / (2 * zoomScale),
                    (plotData.curve.xMin + plotData.curve.xMax) / 2 +
                      (plotData.curve.xMax - plotData.curve.xMin) / (2 * zoomScale),
                  ],
                  y: [
                    (plotData.yMin + plotData.yMax) / 2 -
                      (plotData.yMax - plotData.yMin) / (2 * zoomScale),
                    (plotData.yMin + plotData.yMax) / 2 +
                      (plotData.yMax - plotData.yMin) / (2 * zoomScale),
                  ],
                  padding: 0.16,
                }}
                pan
              >
                <Coordinates.Cartesian subdivisions={2} />
                <Plot.OfX
                  y={(x) => {
                    const v = evaluateMathExpression(plotData.curve.expression, {
                      ...values,
                      x,
                    });
                    return v !== null && Number.isFinite(v) ? v : NaN;
                  }}
                  color="#d4b08c"
                  weight={2.6}
                />
                {plotData.marker && (
                  <>
                    <Line.Segment
                      point1={[plotData.marker.xVal, 0]}
                      point2={[plotData.marker.xVal, plotData.marker.yVal]}
                      color="#8fc9bb"
                      style="dashed"
                      opacity={0.7}
                    />
                    <Point
                      x={plotData.marker.xVal}
                      y={plotData.marker.yVal}
                      color="#f3dfc6"
                    />
                  </>
                )}
              </Mafs>
            </div>
          ) : (
            <svg
              className="parameter-explorer-plot"
              viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
              role="img"
              aria-label={`Plot of ${plotData.curve.yLabel} versus ${plotData.curve.xLabel}`}
            >
              <rect
                x={PAD_X}
                y={PAD_Y}
                width={PLOT_WIDTH - PAD_X * 2}
                height={PLOT_HEIGHT - PAD_Y * 2}
                rx={4}
                className="parameter-plot-frame"
              />
              {plotData.zeroY !== null && (
                <line
                  x1={PAD_X}
                  x2={PLOT_WIDTH - PAD_X}
                  y1={plotData.zeroY}
                  y2={plotData.zeroY}
                  className="parameter-plot-zero"
                />
              )}
              <path d={plotData.d} className="parameter-plot-curve" />
              {plotData.marker && (
                <g className="parameter-plot-marker">
                  <line
                    x1={plotData.marker.cx}
                    x2={plotData.marker.cx}
                    y1={PAD_Y}
                    y2={PLOT_HEIGHT - PAD_Y}
                    className="parameter-plot-guide"
                  />
                  <circle
                    cx={plotData.marker.cx}
                    cy={plotData.marker.cy}
                    r={4.5}
                  />
                </g>
              )}
              <text
                x={PLOT_WIDTH - PAD_X}
                y={PLOT_HEIGHT - 4}
                textAnchor="end"
                className="parameter-plot-axis-label"
              >
                {plotData.curve.xLabel} ({formatSimNumber(plotData.curve.xMin, 1)}{" "}
                .. {formatSimNumber(plotData.curve.xMax, 1)})
              </text>
              <text
                x={PAD_X + 4}
                y={PAD_Y + 11}
                className="parameter-plot-axis-label"
              >
                {plotData.curve.yLabel}
              </text>
            </svg>
          )}
        </figure>
      )}
    </div>
  );
};
