import React from 'react';
import { Terminal, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';

interface OutputConsoleProps {
  stdout: string;
  stderr: string;
  durationMs?: number;
  exitCode?: number;
  onClear: () => void;
}

export const OutputConsole: React.FC<OutputConsoleProps> = ({
  stdout,
  stderr,
  durationMs,
  exitCode,
  onClear,
}) => {
  const hasOutput = stdout.trim().length > 0 || stderr.trim().length > 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0e14] text-xs font-mono select-text">
      {/* Console Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-forge-border text-forge-muted shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-forge-accent" />
          <span className="font-semibold uppercase tracking-wider text-[11px] text-forge-text">Console Output</span>
          {exitCode !== undefined && (
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] ${
                exitCode === 0
                  ? 'bg-forge-success/20 text-emerald-400'
                  : 'bg-forge-danger/20 text-red-400'
              }`}
            >
              exit {exitCode}
            </span>
          )}
          {durationMs !== undefined && (
            <span className="text-[10px] text-forge-muted">{durationMs.toFixed(1)}ms</span>
          )}
        </div>

        <button
          onClick={onClear}
          className="flex items-center gap-1 hover:text-forge-heading transition-colors"
          title="Clear Console"
        >
          <Trash2 size={12} />
          <span className="text-[11px]">Clear</span>
        </button>
      </div>

      {/* Console Stream */}
      <div className="flex-1 p-3 overflow-y-auto space-y-1">
        {!hasOutput ? (
          <div className="h-full flex items-center justify-center text-forge-muted/50 italic text-[11px]">
            Execution output will appear here after clicking "Run Code"
          </div>
        ) : (
          <>
            {stdout && (
              <pre className="text-[#e6edf3] whitespace-pre-wrap break-words leading-relaxed">
                {stdout}
              </pre>
            )}
            {stderr && (
              <pre className="text-red-400 whitespace-pre-wrap break-words leading-relaxed bg-red-950/20 p-2 rounded border border-red-900/30">
                {stderr}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
};
