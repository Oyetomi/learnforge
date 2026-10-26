/**
 * LearnForge Rust Sandbox Runner
 *
 * Compiles and executes Rust code, memory katas, ownership invariants,
 * and #[test] suites via the Rust compilation engine with sub-second execution.
 */

import { parseRustTestOutput } from '../assertions';
import { ExecutionOptions, ExecutionResult, SandboxRunner, TestResult } from '../types';

export class RustSandboxRunner implements SandboxRunner {
  readonly language = 'rust' as const;

  async execute(
    code: string,
    tests?: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const startTime = performance.now();
    const timeoutMs = options?.timeoutMs ?? 10000;

    // Combine code and test modules if tests are provided
    let combinedCode = code;
    const hasTests = Boolean(tests && tests.trim().length > 0);

    if (hasTests) {
      // Ensure tests are included alongside the main source
      if (!combinedCode.includes(tests!.trim())) {
        combinedCode = `${code}\n\n${tests}`;
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const payload = {
        channel: 'stable',
        mode: 'debug',
        edition: '2021',
        crateType: 'bin',
        tests: hasTests,
        code: combinedCode,
        backtrace: false,
      };

      const response = await fetch('https://play.rust-lang.org/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Rust Playground returned HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const durationMs = Math.round(performance.now() - startTime);

      const stdout = data.stdout || '';
      const stderr = data.stderr || '';
      const success = Boolean(data.success);

      let structuredTestResults: TestResult[] | undefined = undefined;
      if (hasTests) {
        const parsed = parseRustTestOutput(stdout, stderr);
        if (parsed.length > 0) {
          structuredTestResults = parsed;
        }
      }

      const hasFailedTests = structuredTestResults ? structuredTestResults.some(t => !t.passed) : false;
      const exitCode = success && !hasFailedTests ? 0 : 1;

      return {
        stdout,
        stderr,
        exitCode,
        durationMs,
        testResults: structuredTestResults,
        error: !success && !hasFailedTests && stderr ? 'Compilation or runtime failed' : undefined,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const isAbort = (err as Error)?.name === 'AbortError';
      const errorMsg = isAbort
        ? `Execution timed out after ${timeoutMs}ms`
        : err instanceof Error
        ? err.message
        : String(err);

      return {
        stdout: '',
        stderr: errorMsg,
        exitCode: 1,
        durationMs,
        error: `Rust runner: ${errorMsg}`,
      };
    }
  }
}
