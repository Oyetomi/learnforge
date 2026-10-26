import React from 'react';
import { TestResult } from '../../types';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface TestResultsPanelProps {
  testResults: TestResult[];
  isRunning?: boolean;
}

export const TestResultsPanel: React.FC<TestResultsPanelProps> = ({ testResults, isRunning }) => {
  const passedCount = testResults.filter((t) => t.passed).length;
  const totalCount = testResults.length;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-xs font-mono select-text">
      {/* Test Bar Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-forge-border text-forge-muted shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-forge-text">
            Test Assertions
          </span>
          {totalCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                allPassed
                  ? 'bg-forge-success/20 text-emerald-400'
                  : 'bg-forge-warning/20 text-yellow-400'
              }`}
            >
              {passedCount}/{totalCount} Passed
            </span>
          )}
        </div>
      </div>

      {/* Tests List */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2">
        {totalCount === 0 ? (
          <div className="h-full flex items-center justify-center text-forge-muted/50 italic text-[11px]">
            No test assertions defined for this milestone.
          </div>
        ) : (
          testResults.map((test, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded border text-xs ${
                test.passed
                  ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
                  : 'bg-red-950/20 border-red-900/40 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {test.passed ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red-400 shrink-0" />
                )}
                <span>{test.name}</span>
              </div>

              {!test.passed && (
                <div className="mt-2 pl-5 space-y-1 text-[11px] text-forge-text">
                  {test.expected && (
                    <div>
                      <span className="text-forge-muted">Expected: </span>
                      <code className="bg-forge-surface px-1 py-0.5 rounded text-forge-accent font-mono">
                        {test.expected}
                      </code>
                    </div>
                  )}
                  {test.actual && (
                    <div>
                      <span className="text-forge-muted">Actual: </span>
                      <code className="bg-forge-surface px-1 py-0.5 rounded text-red-300 font-mono">
                        {test.actual}
                      </code>
                    </div>
                  )}
                  {test.error && (
                    <div className="text-red-400 mt-1 font-mono text-[10px] whitespace-pre-wrap">
                      {test.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
