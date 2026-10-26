import React from 'react';
import { Terminal, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface OutputConsoleProps {
  stdout: string;
  stderr: string;
  durationMs?: number;
  exitCode?: number;
  onClear: () => void;
  isRunning?: boolean;
  canRun?: boolean;
  errorGuidance?: string;
}

export const OutputConsole: React.FC<OutputConsoleProps> = ({
  stdout,
  stderr,
  durationMs,
  exitCode,
  onClear,
  isRunning,
  canRun = true,
  errorGuidance,
}) => {
  const hasResult = exitCode !== undefined;
  return (
    <div className="console-panel">
      {isRunning ? (
        <div className="output-empty">
          <Loader2 size={22} className="animate-spin" />
          <strong>Running your code…</strong>
          <p>Output and test results will appear here.</p>
        </div>
      ) : hasResult ? (
        <>
          <div className={`execution-summary ${exitCode !== 0 || stderr ? 'has-error' : ''}`}>
            <span>
              {exitCode === 0 && !stderr ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {exitCode === 0 && !stderr ? 'Execution complete' : 'Execution failed'}
              {durationMs !== undefined && <small>{durationMs.toFixed(0)} ms</small>}
            </span>
            <button onClick={onClear} className="icon-button" aria-label="Clear output">
              <Trash2 size={13} />
            </button>
          </div>
          <div className="console-stream">
            {stdout && <pre>{stdout}</pre>}
            {stderr && (
              <>
                {errorGuidance && <p className="output-guidance">{errorGuidance}</p>}
                <pre className="console-error">{stderr}</pre>
              </>
            )}
            {!stdout && !stderr && (
              <p className="quiet-output">Code finished without printing output.</p>
            )}
          </div>
        </>
      ) : (
        <div className="output-empty">
          <span className="output-empty-icon">
            <Terminal size={20} />
          </span>
          <strong>{canRun ? 'See your code in action' : 'Code execution unavailable'}</strong>
          <p>
            {canRun
              ? 'Run your code to see output and test results.'
              : 'You can edit this file and discuss it with your coach.'}
          </p>
          {canRun && (
            <span className="output-shortcut">
              <kbd>⌘</kbd> + <kbd>Enter</kbd>
              <span> or Ctrl + Enter</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
