import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Copy, Hammer, Loader2, Play, XCircle } from "lucide-react";
import type { ExecutionResult, StepRun } from "../../types";
import { parseDiagnostics, type RunDiagnostic } from "../../services/sandbox/diagnostics";
import { BUILD_ERROR, runHeadline, type Tone } from "../../services/sandbox/runReport";
export { runHeadline };

const ICON: Record<Tone, React.ReactNode> = {
  pass: <CheckCircle2 size={15} aria-hidden="true" />,
  fail: <XCircle size={15} aria-hidden="true" />,
  warn: <AlertTriangle size={15} aria-hidden="true" />,
  neutral: <Play size={15} aria-hidden="true" />,
};

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

function Problems({ items, onOpen }: { items: RunDiagnostic[]; onOpen: (path: string, line: number, column?: number) => void }) {
  if (!items.length) return null;
  return (
    <ul className="run-problems">
      {items.slice(0, 8).map((d, i) => (
        <li key={i} className={`is-${d.severity}`}>
          <button type="button" onClick={() => onOpen(d.path, d.line, d.column)} title={`Open ${d.path} at line ${d.line}`}>
            <span className="run-problem-loc">
              {d.path}:{d.line}
            </span>
            <span className="run-problem-msg">{d.message}</span>
          </button>
        </li>
      ))}
      {items.length > 8 && <li className="run-problems-more">{items.length - 8} more in the full output</li>}
    </ul>
  );
}

function OutputBlock({ text, label = "Full output", open = false }: { text: string; label?: string; open?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  return (
    <details className="run-output" open={open || undefined}>
      <summary>
        <ChevronRight size={12} aria-hidden="true" className="run-output-chevron" />
        {label}
        <button
          type="button"
          className="run-copy"
          onClick={(e) => {
            e.preventDefault();
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }, () => {});
          }}
        >
          <Copy size={11} aria-hidden="true" /> {copied ? "Copied" : "Copy"}
        </button>
      </summary>
      <pre>{text.trimEnd()}</pre>
    </details>
  );
}

function StepRow({ step, current, known, onOpen }: { step: StepRun; current: boolean; known: string[]; onOpen: (path: string, line: number, column?: number) => void }) {
  const build = !step.passed && BUILD_ERROR.test(step.output);
  const [open, setOpen] = useState(!step.passed);
  useEffect(() => setOpen(!step.passed), [step.passed, step.output]);
  const problems = step.passed ? [] : parseDiagnostics(step.output, known);
  const status = step.timedOut ? "Timed out" : step.passed ? "Passed" : build ? "Doesn’t build" : "Failed";
  return (
    <li className={`run-step ${step.passed ? "is-pass" : "is-fail"}`}>
      <button type="button" className="run-step-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronRight size={12} aria-hidden="true" className="run-output-chevron" data-open={open} />
        {step.passed ? <CheckCircle2 size={14} aria-hidden="true" /> : build ? <Hammer size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />}
        <span className="run-step-name">
          Step {step.number} · {step.label}
          {current && <em>this step</em>}
        </span>
        <span className="run-step-status">{status}</span>
        {step.durationMs > 0 && <span className="run-step-time">{ms(step.durationMs)}</span>}
      </button>
      {open && (
        <div className="run-step-body">
          {!step.passed && !problems.length && (
            <p className="run-step-hint">
              {step.timedOut
                ? "It was stopped at the time limit. The output shows how far it got."
                : "No file and line were reported. The output below shows what failed."}
            </p>
          )}
          <Problems items={problems} onOpen={onOpen} />
          <OutputBlock text={step.output} label={step.passed ? "Output" : "Full output"} open={!step.passed && !problems.length} />
        </div>
      )}
    </li>
  );
}

interface Props {
  result: ExecutionResult | null;
  isRunning: boolean;
  canRun: boolean;
  currentStep?: number;
  known: string[];
  runLabel: string;
  onOpen: (path: string, line: number, column?: number) => void;
  onClear: () => void;
}

/** Results of a project run: a headline, then one row per step with clickable problems. */
export const ProjectRunReport: React.FC<Props> = ({ result, isRunning, canRun, currentStep, known, runLabel, onOpen, onClear }) => {
  if (isRunning)
    return (
      <div className="run-report is-empty" role="status">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        <strong>Running…</strong>
        <p>Each step’s tests run on their own; results appear here.</p>
      </div>
    );
  if (!result)
    return (
      <div className="run-report is-empty">
        <Play size={18} aria-hidden="true" />
        <strong>{canRun ? "Nothing run yet" : "Can’t run here yet"}</strong>
        <p>
          {canRun ? (
            <>
              {runLabel} checks this step and every earlier one. <kbd>⌘</kbd> <kbd>↵</kbd>
            </>
          ) : (
            "See the note above the output for what to install."
          )}
        </p>
      </div>
    );
  const headline = runHeadline(result, currentStep);
  const steps = result.stepRuns ?? [];
  const programOutput = !steps.length ? [result.stdout, result.stderr].filter((t) => t.trim()).join("\n") : "";
  const programProblems = !steps.length && result.exitCode !== 0 ? parseDiagnostics(programOutput, known) : [];
  return (
    <div className="run-report">
      <header className={`run-headline is-${headline.tone}`}>
        {ICON[headline.tone]}
        <div>
          <strong>{headline.title}</strong>
          {headline.detail && <small>{headline.detail}</small>}
        </div>
        {result.durationMs > 0 && (
          <span className="run-meta">
            <Clock size={11} aria-hidden="true" /> {ms(result.durationMs)}
          </span>
        )}
        <button type="button" className="run-clear" onClick={onClear}>
          Clear
        </button>
      </header>
      {steps.length > 0 ? (
        <ol className="run-steps">
          {[...steps]
            .sort((a, b) => Number(a.passed) - Number(b.passed) || a.number - b.number)
            .map((step) => (
              <StepRow key={step.number} step={step} current={step.number === currentStep} known={known} onOpen={onOpen} />
            ))}
        </ol>
      ) : (
        <div className="run-program">
          <Problems items={programProblems} onOpen={onOpen} />
          {result.exitCode === 0 ? (
            result.stdout.trim() ? <pre className="run-program-out">{result.stdout.trimEnd()}</pre> : null
          ) : (
            <OutputBlock text={programOutput} open={!programProblems.length} />
          )}
        </div>
      )}
    </div>
  );
};

/** The whole run as a readable log, step by step. */
export const ProjectRunLog: React.FC<{ result: ExecutionResult | null; isRunning: boolean }> = ({ result, isRunning }) => {
  if (isRunning || !result)
    return (
      <div className="run-report is-empty">
        <strong>{isRunning ? "Running…" : "No output yet"}</strong>
        <p>The complete output of the last run appears here.</p>
      </div>
    );
  const steps = result.stepRuns ?? [];
  if (!steps.length)
    return (
      <div className="run-log">
        <OutputBlock text={[result.stdout, result.stderr].filter((t) => t.trim()).join("\n") || "(no output)"} label="Program output" open />
      </div>
    );
  return (
    <div className="run-log">
      {steps.map((s) => (
        <OutputBlock key={s.number} text={s.output || "(no output)"} label={`Step ${s.number} · ${s.label} · ${s.passed ? "passed" : "failed"}`} open={!s.passed} />
      ))}
    </div>
  );
};
