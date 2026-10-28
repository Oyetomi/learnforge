/**
 * LearnForge Go Sandbox Runner
 * Executes Go programs, worker pools, concurrency katas, and test functions.
 */

import { parseGoTestOutput } from '../../assertions';
import { ExecutionOptions, ExecutionResult, SandboxRunner, TestResult } from '../../types';
import { executeGoPlayground } from '../../api';
import { GoTranspiler } from './interpreter';
import {
  GoChannel,
  GoContext,
  GoMutex,
  GoRWMutex,
  GoScheduler,
  GoTestingT,
  GoWaitGroup,
  formatGoPrintf,
} from './runtime';
import { ExternalGoRunner, GoAnalyzedStructures } from './types';

export class GoSandboxRunner implements SandboxRunner {
  readonly language = 'go';
  private transpiler = new GoTranspiler();
  private externalRunner: ExternalGoRunner | null = null;

  setExternalRunner(runner: ExternalGoRunner | null): void {
    this.externalRunner = runner;
  }

  analyzeStructures(code: string): GoAnalyzedStructures {
    return this.transpiler.analyze(code);
  }

  async execute(
    code: string,
    tests?: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const timeoutMs = options?.timeoutMs ?? 8000;
    const startTime = performance.now();

    // 1. If external native/Wasm runner is registered and active
    if (this.externalRunner && !options?.forceBuiltinRunner && this.externalRunner.canExecute(code)) {
      try {
        const extRes = await this.externalRunner.execute(code, tests);
        const durationMs = Math.round(performance.now() - startTime);
        const testResults = parseGoTestOutput(extRes.stdout, extRes.stderr);
        return {
          stdout: extRes.stdout,
          stderr: extRes.stderr,
          exitCode: extRes.exitCode,
          durationMs,
          testResults: testResults.length > 0 ? testResults : undefined,
        };
      } catch (err) {
        console.warn('External Go runner failed, falling back:', err);
      }
    }

    // 2. Unless built-in simulator is explicitly forced, run with the official Go Playground API
    if (!options?.forceBuiltinRunner) {
      try {
        return await executeGoPlayground(code, tests, timeoutMs);
      } catch (cloudErr) {
        console.warn('Go Playground API failed or offline, falling back to built-in simulator:', cloudErr);
      }
    }

    return this.executeWithSimulator(code, tests, timeoutMs, startTime);
  }

  private async executeWithSimulator(
    userCode: string,
    testCode: string | undefined,
    timeoutMs: number,
    startTime: number
  ): Promise<ExecutionResult> {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const structuredTestResults: TestResult[] = [];

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms (possible channel deadlock or goroutine hang)`));
      }, timeoutMs);
    });

    try {
      const combinedCode = [userCode, testCode || ''].join('\n\n');
      const analysis = this.transpiler.analyze(combinedCode);
      const jsCode = this.transpiler.transpile(combinedCode);

      const scheduler = new GoScheduler();

      // Runtime environment injected into sandbox
      const runtimeEnv = {
        GoChannel,
        GoWaitGroup,
        GoMutex,
        GoRWMutex,
        GoContext,
        __scheduler: scheduler,
        __fmt_println: (...args: unknown[]) => {
          const line = args
            .map(a => {
              if (a === null) return '<nil>';
              if (typeof a === 'object') {
                if (Array.isArray(a)) return `[${a.join(' ')}]`;
                return JSON.stringify(a);
              }
              return String(a);
            })
            .join(' ');
          stdoutLines.push(line);
        },
        __fmt_printf: (format: string, ...args: unknown[]) => {
          const text = formatGoPrintf(format, ...args);
          stdoutLines.push(text);
        },
        __fmt_sprintf: (format: string, ...args: unknown[]) => {
          return formatGoPrintf(format, ...args);
        },
        __time_sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, Math.min(ms, 500))),
        __time_after: (ms: number) => {
          const ch = new GoChannel<number>(1);
          setTimeout(() => {
            ch.send(Date.now()).catch(() => {});
          }, Math.min(ms, 500));
          return ch;
        },
      };

      const execPromise = (async () => {
        const fnNames = Object.keys(runtimeEnv);
        const fnVals = Object.values(runtimeEnv);

        // Runner wrapper that executes main() and/or Test functions
        const wrappedScript = `
          "use strict";
          ${jsCode}

          return {
            main: typeof main === 'function' ? main : undefined,
            getTestFns: () => {
              const tests = {};
              ${analysis.testFunctions
                .map(fn => `if (typeof ${fn} === 'function') tests['${fn}'] = ${fn};`)
                .join('\n')}
              return tests;
            }
          };
        `;

        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const runner = new AsyncFunction(...fnNames, wrappedScript);
        const moduleExports = await runner(...fnVals);

        // 1. Run main() if present
        if (moduleExports.main) {
          await moduleExports.main();
          // Wait for any spawned background goroutines
          await scheduler.waitAll();
        }

        // 2. Run Test functions if present
        const testFns = moduleExports.getTestFns();
        for (const [testName, fn] of Object.entries(testFns)) {
          stdoutLines.push(`=== RUN   ${testName}`);
          const testStart = performance.now();
          const t = new GoTestingT(testName);

          let pass = false;
          try {
            await (fn as (t: GoTestingT) => Promise<void>)(t);
            await scheduler.waitAll();
            pass = !t.failed;
          } catch (testErr: unknown) {
            pass = false;
            t.Errorf(testErr instanceof Error ? testErr.message : String(testErr));
          }

          const testDuration = ((performance.now() - testStart) / 1000).toFixed(2);
          if (pass) {
            stdoutLines.push(`--- PASS: ${testName} (${testDuration}s)`);
            structuredTestResults.push({
              name: testName,
              passed: true,
            });
          } else {
            stdoutLines.push(`--- FAIL: ${testName} (${testDuration}s)`);
            for (const err of t.errors) {
              stdoutLines.push(`    ${err}`);
            }
            structuredTestResults.push({
              name: testName,
              passed: false,
              error: t.errors.join('\n'),
            });
          }
        }
      })();

      await Promise.race([execPromise, timeoutPromise]);

      const durationMs = Math.round(performance.now() - startTime);
      const hasFailedTests = structuredTestResults.some(t => !t.passed);

      return {
        stdout: stdoutLines.join('\n'),
        stderr: stderrLines.join('\n'),
        exitCode: hasFailedTests ? 1 : 0,
        durationMs,
        testResults: structuredTestResults.length > 0 ? structuredTestResults : undefined,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = err instanceof Error ? err.message : String(err);
      stderrLines.push(errorMsg);

      return {
        stdout: stdoutLines.join('\n'),
        stderr: stderrLines.join('\n'),
        exitCode: 1,
        durationMs,
        error: errorMsg,
        testResults: structuredTestResults.length > 0 ? structuredTestResults : undefined,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
