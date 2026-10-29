import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

/** Independent correct answers needed before a readiness review. */
export const MASTERY_TARGET = 2;

interface MasteryMeterProps {
  milestoneId?: string;
  independentCorrect: number;
  readyToAdvance: boolean;
  approved: boolean;
}

/** Status line for the current lesson's mastery progress. */
export function masteryStatus({
  independentCorrect,
  readyToAdvance,
  approved,
}: Omit<MasteryMeterProps, "milestoneId">): string {
  if (approved) return "Ready for the next concept";
  if (readyToAdvance) return "Ready for tutor review";
  if (independentCorrect >= MASTERY_TARGET) return "Practise another case";
  return independentCorrect > 0
    ? `${independentCorrect} independent application${
        independentCorrect === 1 ? "" : "s"
      }`
    : "Building evidence";
}

/**
 * Three marks: two independent correct answers, then the readiness review.
 * Marks record independent applications; tutor review decides the next step.
 */
export const MasteryMeter: React.FC<MasteryMeterProps> = ({
  milestoneId,
  independentCorrect,
  readyToAdvance,
  approved,
}) => {
  const filled = Math.min(MASTERY_TARGET, independentCorrect);
  const previous = useRef({ milestoneId, filled, approved });
  const [pulse, setPulse] = useState<number | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { milestoneId, filled, approved };
    if (before.milestoneId !== milestoneId) return;
    if (approved && !before.approved) {
      setPulse(MASTERY_TARGET);
    } else if (filled > before.filled) setPulse(filled - 1);
    else return;
    const timer = setTimeout(() => setPulse(null), 700);
    return () => clearTimeout(timer);
  }, [milestoneId, filled, approved]);

  const status = masteryStatus({
    independentCorrect,
    readyToAdvance,
    approved,
  });
  const marks = [...Array(MASTERY_TARGET)].map((_, i) => i < filled);
  marks.push(approved);

  return (
    <div
      className={`mastery-meter ${approved ? "is-mastered" : ""}`}
      role="status"
      aria-label={`Readiness: ${status}`}
      title="Fresh independent applications and a tutor review guide the next step; answer counts alone do not establish readiness."
    >
      <span className="mastery-label">Readiness</span>
      <span className="mastery-marks" aria-hidden="true">
        {marks.map((on, i) => (
          <i
            key={i}
            className={`${on ? "is-on" : ""} ${
              i === MASTERY_TARGET ? "is-review" : ""
            } ${pulse === i ? "is-pulse" : ""}`}
          >
            {i === MASTERY_TARGET && on && <Check size={8} strokeWidth={3} />}
          </i>
        ))}
      </span>
      <span className="mastery-status">{status}</span>
    </div>
  );
};
