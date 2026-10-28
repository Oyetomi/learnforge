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
  if (approved) return "Lesson mastered";
  if (readyToAdvance) return "Ready for review";
  if (independentCorrect >= MASTERY_TARGET)
    return "One more correct answer";
  const remaining = MASTERY_TARGET - independentCorrect;
  return `${remaining} more correct answer${remaining === 1 ? "" : "s"}`;
}

/**
 * Three marks: two independent correct answers, then the readiness review.
 * Wrong answers never remove progress; they only delay the review.
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
      void celebrate();
    } else if (filled > before.filled) setPulse(filled - 1);
    else return;
    const timer = setTimeout(() => setPulse(null), 700);
    return () => clearTimeout(timer);
  }, [milestoneId, filled, approved]);

  const status = masteryStatus({ independentCorrect, readyToAdvance, approved });
  const marks = [...Array(MASTERY_TARGET)].map((_, i) => i < filled);
  marks.push(approved);

  return (
    <div
      className={`mastery-meter ${approved ? "is-mastered" : ""}`}
      role="status"
      aria-label={`Mastery: ${status}`}
      title="Two independent correct answers, then a readiness review"
    >
      <span className="mastery-label">Mastery</span>
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

async function celebrate() {
  if (
    typeof window === "undefined" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
    return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({
      particleCount: 70,
      spread: 62,
      startVelocity: 32,
      origin: { y: 0.25 },
      colors: ["#d2b497", "#4ade80", "#e4c7ae", "#8daf98"],
      disableForReducedMotion: true,
    });
  } catch {
    // Celebration is decorative; ignore load failures.
  }
}
