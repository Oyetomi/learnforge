import React, { useMemo, useState } from "react";
import { RotateCcw, Sliders } from "lucide-react";
import {
  evaluateMathExpression,
  formatSimNumber,
  type ParameterSimSpec,
} from "../../services/learning/parameterSim";

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

export const ParameterExplorer: React.FC<ParameterExplorerProps> = ({
  spec,
  title,
  onInteract,
}) => {
  const initialMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of spec.parameters) out[p.id] = p.initial;
    return out;
  }, [spec.parameters]);

  const [values, setValues] = useState<Record<string, number>>(initialMap);

  const isModified = spec.parameters.some(
    (p) => Math.abs((values[p.id] ?? p.initial) - p.initial) > 1e-9
  );

  const updateParam = (id: string, nextValue: number) => {
    onInteract?.();
    setValues((prev) => ({ ...prev, [id]: nextValue }));
  };

  const reset = () => {
    onInteract?.();
    setValues(initialMap);
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
      const pad = (yMax - yMin) * 0.08;
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
      if (
        mx !== null &&
        mx >= curve.xMin &&
        mx <= curve.xMax
      ) {
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

      {spec.prompt && <p className="parameter-explorer-prompt">{spec.prompt}</p>}

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
                <span className="parameter-slider-label">{param.label}</span>
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
            <dt>{out.label}</dt>
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
              x={PAD_X}
              y={PLOT_HEIGHT - 4}
              className="parameter-plot-axis-label"
            >
              {formatSimNumber(plotData.curve.xMin, 2)} · {plotData.curve.xLabel}
            </text>
            <text
              x={PLOT_WIDTH - PAD_X}
              y={PLOT_HEIGHT - 4}
              textAnchor="end"
              className="parameter-plot-axis-label"
            >
              {formatSimNumber(plotData.curve.xMax, 2)}
            </text>
            <text
              x={PAD_X + 6}
              y={PAD_Y + 12}
              className="parameter-plot-axis-label"
            >
              {plotData.curve.yLabel} ({formatSimNumber(plotData.yMax, 1)})
            </text>
          </svg>
        </figure>
      )}
    </div>
  );
};
