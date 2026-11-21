import type { ExecutionResult } from "../../types";

/** Compiler output rather than a failing assertion. */
export const BUILD_ERROR = /\[build failed\]|^# learnforge|error\[E\d+\]|: (fatal )?error:|SyntaxError|IndentationError|ModuleNotFoundError|ImportError|cannot find symbol|could not compile|undefined: /m;

export type Tone = "pass" | "fail" | "warn" | "neutral";
export interface Headline {
  tone: Tone;
  title: string;
  detail?: string;
  /** Short form for the step chip. */
  chip: string;
}

export type Prediction = "pass" | "fail" | "build";

/** What actually happened, in the same terms as a learner's prediction. */
export function runOutcome(result: ExecutionResult): Prediction {
  const steps = result.stepRuns ?? [];
  if (steps.length ? steps.every((s) => s.passed) : result.exitCode === 0) return "pass";
  const output = steps.length ? steps.filter((s) => !s.passed).map((s) => s.output).join("\n") : `${result.stdout}\n${result.stderr}`;
  return BUILD_ERROR.test(output) ? "build" : "fail";
}

/** One sentence that says what happened and what to do next. */
export function runHeadline(result: ExecutionResult, currentStep?: number): Headline {
  const steps = result.stepRuns ?? [];
  if (result.timedOut)
    return { tone: "warn", chip: "Timed out", title: "Stopped: time limit reached", detail: "A step ran too long. Look for a loop that never ends or a call that waits forever." };
  if (!steps.length) {
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0) return { tone: "pass", chip: "Program ran", title: "Program finished", detail: result.stdout.trim() ? undefined : "It printed nothing." };
    if (BUILD_ERROR.test(output)) return { tone: "fail", chip: "Doesn’t build", title: "Doesn’t build yet", detail: "Fix the errors below, then run again." };
    return { tone: "fail", chip: "Program error", title: "Program stopped with an error", detail: `Exit status ${result.exitCode}.` };
  }
  const failing = steps.filter((s) => !s.passed);
  if (!failing.length) return { tone: "pass", chip: "All tests pass", title: steps.length === 1 ? "The step’s tests pass" : `All ${steps.length} steps pass` };
  const broken = failing.filter((s) => currentStep !== undefined && s.number < currentStep);
  if (failing.every((s) => BUILD_ERROR.test(s.output)))
    return { tone: "fail", chip: "Doesn’t build", title: "Doesn’t build yet", detail: "The tests can’t run until the code compiles. Fix the errors below." };
  if (broken.length)
    return {
      tone: "fail",
      chip: `Step ${broken.map((s) => s.number).join(", ")} broke`,
      title: `Step ${broken.map((s) => s.number).join(", ")} broke`,
      detail: "A change for this step undid earlier work. Its failing check is below.",
    };
  const passing = steps.length - failing.length;
  return {
    tone: "fail",
    chip: `${passing} of ${steps.length} passing`,
    title: currentStep !== undefined && failing.some((s) => s.number === currentStep) ? `Step ${currentStep} isn’t passing yet` : `${failing.length} step${failing.length > 1 ? "s" : ""} failing`,
    detail: steps.length > 1 ? `${passing} of ${steps.length} steps pass.` : undefined,
  };
}

