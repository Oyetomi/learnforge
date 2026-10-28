import React from "react";
import { contextLevel } from "../../services/ai/connection";

interface ContextRingProps {
  used: number;
  total: number;
  size?: number;
}

/** Small SVG progress ring showing how much of the model's context is in use. */
export const ContextRing: React.FC<ContextRingProps> = ({
  used,
  total,
  size = 18,
}) => {
  const ratio = total > 0 ? Math.min(1, Math.max(0, used / total)) : 0;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Keep a visible sliver once anything is in context.
  const shown = used > 0 ? Math.max(ratio, 0.03) : 0;
  return (
    <svg
      className={`context-ring is-${contextLevel(ratio)}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.round(ratio * 100)}% of context window used`}
    >
      <circle
        className="context-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className="context-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - shown)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
};
