import React from 'react';
import { TestResult } from '../../types';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

interface TestResultsPanelProps {
  testResults: TestResult[];
  isRunning?: boolean;
  canRun?: boolean;
  hasRun?: boolean;
  onNextMilestone?: () => void;
}

export const TestResultsPanel: React.FC<TestResultsPanelProps> = ({
  testResults,
  isRunning,
  canRun = true,
  hasRun = false,
  onNextMilestone,
}) => {
  const passedCount = testResults.filter((t) => t.passed).length;
  const totalCount = testResults.length;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  return (
    <div className="flex flex-col h-full bg-transparent text-xs font-mono select-text">
      {/* Test Bar Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-transparent border-b border-[#2e2e2e] text-[#8d8d8d] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-[#e6e6e6]">
            Test Assertions
          </span>
          {totalCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                allPassed
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                  : 'bg-yellow-950/60 text-yellow-400 border border-yellow-800/40'
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
          <div className="h-full flex items-center justify-center text-[#8d8d8d] text-xs">
            {!canRun
              ? 'Tests are unavailable for this language.'
              : isRunning
                ? 'Running tests…'
                : hasRun
                  ? 'No test results were returned. Check Output for details.'
                  : 'Run your code (⌘+Enter) to verify this milestone’s tests.'}
          </div>
        ) : (
          <>
            {allPassed && onNextMilestone && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between font-sans mb-3">
                <div className="flex items-center gap-2 text-emerald-300 text-xs">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span className="font-medium">All tests passed! Ready for next challenge.</span>
                </div>
                <button
                  type="button"
                  onClick={onNextMilestone}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  Next Milestone <ArrowRight size={13} />
                </button>
              </div>
            )}

            {testResults.map((test, idx) => (
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
                  <div className="mt-2 pl-5 space-y-1 text-[11px] text-[#e0e0e0]">
                    {test.expected && (
                      <div>
                        <span className="text-[#8d8d8d]">Expected: </span>
                        <code className="bg-[#242424] px-1 py-0.5 rounded text-amber-300 font-mono">
                          {test.expected}
                        </code>
                      </div>
                    )}
                    {test.actual && (
                      <div>
                        <span className="text-[#8d8d8d]">Actual: </span>
                        <code className="bg-[#242424] px-1 py-0.5 rounded text-red-300 font-mono">
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
            ))}
          </>
        )}
      </div>
    </div>
  );
};
