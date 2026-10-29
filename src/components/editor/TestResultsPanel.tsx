import React from "react";
import { TestResult } from "../../types";
import { CheckCircle2, XCircle, ArrowRight, Loader2 } from "lucide-react";

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
  const allPassed =
    testResults.length > 0 && passedCount === testResults.length;
  return (
    <section
      className="test-results-panel"
      aria-label="Code test results"
      aria-busy={isRunning || undefined}
    >
      <header className="test-results-heading">
        <strong>Test results</strong>
        {!isRunning && testResults.length > 0 && (
          <span className={allPassed ? "is-passing" : "has-failures"}>
            {passedCount} of {testResults.length} passed
          </span>
        )}
      </header>
      <div className="test-results-list">
        {isRunning ? (
          <p className="test-results-empty" role="status">
            <Loader2 size={15} className="animate-spin" />
            Running tests…
          </p>
        ) : !testResults.length ? (
          <p className="test-results-empty">
            {!canRun
              ? "Test execution is unavailable for this language."
              : hasRun
              ? "No test assertions were returned. Check Output for execution details."
              : "Run your code to check the lesson’s test assertions."}
          </p>
        ) : (
          <>
            {allPassed && (
              <div className="tests-passed-summary">
                <p>
                  <CheckCircle2 size={15} />
                  All supplied tests passed.
                </p>
                {onNextMilestone ? (
                  <button
                    className="dialog-secondary-button"
                    onClick={onNextMilestone}
                  >
                    Continue to next lesson
                    <ArrowRight size={13} />
                  </button>
                ) : (
                  <small>
                    Tests check this implementation. Return to the lesson for
                    the tutor’s understanding check.
                  </small>
                )}
              </div>
            )}
            {testResults.map((test, index) => (
              <article
                className={`test-result-item ${
                  test.passed ? "is-passing" : "has-failures"
                }`}
                key={`${test.name}:${index}`}
              >
                <h4>
                  {test.passed ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <XCircle size={14} />
                  )}
                  <span>{test.name}</span>
                  <small>{test.passed ? "Passed" : "Failed"}</small>
                </h4>
                {!test.passed && (
                  <dl>
                    {test.expected !== undefined && (
                      <>
                        <dt>Expected</dt>
                        <dd>
                          <code>
                            {test.expected === ""
                              ? "(empty string)"
                              : test.expected}
                          </code>
                        </dd>
                      </>
                    )}
                    {test.actual !== undefined && (
                      <>
                        <dt>Actual</dt>
                        <dd>
                          <code>
                            {test.actual === ""
                              ? "(empty string)"
                              : test.actual}
                          </code>
                        </dd>
                      </>
                    )}
                    {test.error && (
                      <>
                        <dt>Details</dt>
                        <dd>
                          <pre>{test.error}</pre>
                        </dd>
                      </>
                    )}
                  </dl>
                )}
              </article>
            ))}
          </>
        )}
      </div>
    </section>
  );
};
