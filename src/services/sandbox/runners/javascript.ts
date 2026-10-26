/**
 * LearnForge JavaScript / TypeScript Execution Sandbox Runner
 * Executes JS/TS code with console interception, timeout protection,
 * Web Worker isolation (when available) / sandbox fallback, and structured test assertions.
 */

import { AssertionCollector, createExpect } from '../assertions';
import { ExecutionOptions, ExecutionResult, SandboxRunner, TestResult } from '../types';

/**
 * Lightweight, robust TypeScript to JavaScript stripper
 * Strips types, interfaces, enums, type assertions, and generic annotations
 * without needing heavy external transpiler bundles.
 */
function stripBracedConstruct(src: string, keyword: string): string {
  let result = '';
  const regex = new RegExp(`\\b${keyword}\\s+[A-Za-z0-9_$]+`, 'g');
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(src)) !== null) {
    const startIndex = match.index;
    result += src.slice(lastIndex, startIndex);

    let openBraceIndex = src.indexOf('{', startIndex);
    if (openBraceIndex === -1) {
      lastIndex = startIndex + match[0].length;
      continue;
    }

    let depth = 1;
    let curr = openBraceIndex + 1;
    while (curr < src.length && depth > 0) {
      if (src[curr] === '{') depth++;
      else if (src[curr] === '}') depth--;
      curr++;
    }
    lastIndex = curr;
    regex.lastIndex = curr;
  }
  result += src.slice(lastIndex);
  return result;
}

export function stripTypeScript(tsCode: string): string {
  let code = tsCode;

  // Normalize Windows newlines
  code = code.replace(/\r\n/g, '\n');

  // Strip interfaces cleanly matching balanced braces
  code = stripBracedConstruct(code, 'interface');

  // Strip type aliases: type Foo<T> = ... ; (handling multiline)
  code = code.replace(/\btype\s+[A-Za-z0-9_$]+(?:\s*<[^>]*>)?\s*=[\s\S]*?;\n?/g, '');

  // Strip simple enums: enum Direction { Up = 1, Down }
  code = code.replace(/\benum\s+([A-Za-z0-9_$]+)\s*\{([^}]*)\}/g, (_match, name, body) => {
    const entries = body
      .split(',')
      .map((item: string) => item.trim())
      .filter(Boolean);
    let index = 0;
    const assignments: string[] = [];
    for (const entry of entries) {
      if (entry.includes('=')) {
        const [k, v] = entry.split('=').map((s: string) => s.trim());
        assignments.push(`  ${k}: ${v}`);
        const parsed = Number(v);
        if (!isNaN(parsed)) index = parsed + 1;
      } else {
        assignments.push(`  ${entry}: ${index++}`);
      }
    }
    return `const ${name} = {\n${assignments.join(',\n')}\n};`;
  });

  // Strip "as <Type>" or "as const"
  code = code.replace(/\s+as\s+[A-Za-z0-9_$]+(?:<[^>]*>)?(?:\s*\[\])?/g, '');

  // Strip non-null assertion: "foo!" -> "foo"
  code = code.replace(/([a-zA-Z0-9_$)\]])!([.\[\],\); \n])/g, '$1$2');

  // Strip access modifiers: public, private, protected, readonly
  code = code.replace(/\b(public|private|protected|readonly)\s+/g, '');

  // Strip function return type annotations: "): Type {" or "): Promise<Type> =>"
  code = code.replace(/\)\s*:\s*[A-Za-z0-9_$]+(?:<[\s\S]*?>)?(?:\s*\[\])?\s*(?=\{|\=\>)/g, ') ');

  // Strip variable type annotations: "let x: number =" or "const arr: Array<number> ="
  code = code.replace(
    /(\b(?:let|const|var)\s+[A-Za-z0-9_$]+)\s*:\s*[^=;\n]+\s*=/g,
    '$1 ='
  );

  // Strip function parameter types: (x: number, y: string = "hello")
  code = code.replace(
    /(\(|,\s*)([A-Za-z0-9_$]+)\??\s*:\s*[^,)=]+?(?=\s*[,)=]|$)/g,
    '$1$2'
  );

  // Strip generic function parameters: function foo<T>(...) or const foo = <T>(...)
  code = code.replace(/(\bfunction(?:\s+[A-Za-z0-9_$]+)?)\s*<[A-Za-z0-9_$,\s]+>\s*\(/g, '$1(');

  return code;
}

export class JavaScriptSandboxRunner implements SandboxRunner {
  readonly language = 'javascript';

  async execute(
    code: string,
    tests?: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const timeoutMs = options?.timeoutMs ?? 5000;
    const startTime = performance.now();

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const collector = new AssertionCollector();

    // Check if running in browser with Web Worker support
    const isBrowserWorkerAvailable =
      typeof window !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function';

    if (isBrowserWorkerAvailable && !options?.forceBuiltinRunner) {
      return this.executeInWorker(code, tests, timeoutMs, startTime);
    }

    // Direct sandbox execution with timeout race
    return this.executeInSandbox(code, tests, options, timeoutMs, startTime, stdoutLines, stderrLines, collector);
  }

  private async executeInSandbox(
    rawCode: string,
    rawTests: string | undefined,
    options: ExecutionOptions | undefined,
    timeoutMs: number,
    startTime: number,
    stdoutLines: string[],
    stderrLines: string[],
    collector: AssertionCollector
  ): Promise<ExecutionResult> {
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const execPromise = (async () => {
        // Strip TS if present
        const strippedUserCode = stripTypeScript(rawCode);
        const strippedTests = rawTests ? stripTypeScript(rawTests) : '';

        // Safe mock console
        const mockConsole = {
          log: (...args: unknown[]) => {
            stdoutLines.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
          },
          info: (...args: unknown[]) => {
            stdoutLines.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
          },
          warn: (...args: unknown[]) => {
            stderrLines.push('[WARN] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
          },
          error: (...args: unknown[]) => {
            stderrLines.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
          },
        };

        // Build test runner globals
        const testScope = {
          console: mockConsole,
          describe: (name: string, fn: () => void | Promise<void>) => collector.describe(name, fn),
          test: (name: string, fn: () => void | Promise<void>) => collector.runTest(name, fn),
          it: (name: string, fn: () => void | Promise<void>) => collector.runTest(name, fn),
          expect: createExpect,
          assert: Object.assign(
            (cond: unknown, msg?: string) => {
              if (!cond) throw new Error(msg || 'Assertion failed');
            },
            {
              strictEqual: (a: unknown, b: unknown, msg?: string) => {
                if (!Object.is(a, b)) throw new Error(msg || `Expected ${a} to equal ${b}`);
              },
              deepEqual: (a: unknown, b: unknown, msg?: string) => {
                createExpect(a).toEqual(b);
              },
            }
          ),
          ...options?.globals,
        };

        // Create isolated function wrapper
        const paramNames = Object.keys(testScope);
        const paramValues = Object.values(testScope);

        // Bundle user code and test execution
        const combinedCode = `
          "use strict";
          return (async () => {
            // User Code
            ${strippedUserCode}

            // Tests (if any)
            ${strippedTests}
          })();
        `;

        const sandboxFn = new Function(...paramNames, combinedCode);
        await sandboxFn(...paramValues);
      })();

      await Promise.race([execPromise, timeoutPromise]);

      const durationMs = Math.round(performance.now() - startTime);
      const testResults = collector.getResults();
      const hasFailedTests = testResults.some(t => !t.passed);

      return {
        stdout: stdoutLines.join('\n'),
        stderr: stderrLines.join('\n'),
        exitCode: hasFailedTests ? 1 : 0,
        durationMs,
        testResults: testResults.length > 0 ? testResults : undefined,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = err instanceof Error ? err.message : String(err);
      stderrLines.push(errorMsg);

      const testResults = collector.getResults();

      return {
        stdout: stdoutLines.join('\n'),
        stderr: stderrLines.join('\n'),
        exitCode: 1,
        durationMs,
        error: errorMsg,
        testResults: testResults.length > 0 ? testResults : undefined,
      };
    } finally {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }

  private executeInWorker(
    code: string,
    tests: string | undefined,
    timeoutMs: number,
    startTime: number
  ): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve) => {
      const strippedCode = stripTypeScript(code);
      const strippedTests = tests ? stripTypeScript(tests) : '';

      const workerScript = `
        const stdout = [];
        const stderr = [];
        const testResults = [];

        function deepEqual(a, b) {
          if (Object.is(a, b)) return true;
          if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') return false;
          if (Array.isArray(a) !== Array.isArray(b)) return false;
          if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
            return true;
          }
          const ka = Object.keys(a), kb = Object.keys(b);
          if (ka.length !== kb.length) return false;
          for (const k of ka) {
            if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
          }
          return true;
        }

        const expect = (actual, isNot = false) => ({
          get not() { return expect(actual, !isNot); },
          toBe(exp) {
            const pass = Object.is(actual, exp);
            if (isNot ? pass : !pass) throw new Error(\`Expected \${JSON.stringify(actual)} \${isNot ? 'NOT ' : ''}to be \${JSON.stringify(exp)}\`);
          },
          toEqual(exp) {
            const pass = deepEqual(actual, exp);
            if (isNot ? pass : !pass) throw new Error(\`Expected \${JSON.stringify(actual)} \${isNot ? 'NOT ' : ''}to equal \${JSON.stringify(exp)}\`);
          },
          toBeTruthy() {
            if (isNot ? Boolean(actual) : !Boolean(actual)) throw new Error(\`Expected \${actual} to be truthy\`);
          },
          toBeFalsy() {
            if (isNot ? !actual : Boolean(actual)) throw new Error(\`Expected \${actual} to be falsy\`);
          }
        });

        const test = async (name, fn) => {
          try {
            await fn();
            testResults.push({ name, passed: true });
          } catch (err) {
            testResults.push({ name, passed: false, error: err.message || String(err) });
          }
        };

        const console = {
          log: (...args) => stdout.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          info: (...args) => stdout.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          warn: (...args) => stderr.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          error: (...args) => stderr.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
        };

        self.onmessage = async () => {
          try {
            ${strippedCode}
            ${strippedTests}
            self.postMessage({ ok: true, stdout: stdout.join('\\n'), stderr: stderr.join('\\n'), testResults });
          } catch (err) {
            self.postMessage({ ok: false, error: err.message || String(err), stdout: stdout.join('\\n'), stderr: stderr.join('\\n'), testResults });
          }
        };
      `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      let worker: Worker | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      try {
        worker = new Worker(workerUrl);
      } catch {
        // Fallback to in-sandbox if worker creation fails (e.g. CSP restrictions)
        URL.revokeObjectURL(workerUrl);
        return this.executeInSandbox(
          code,
          tests,
          undefined,
          timeoutMs,
          startTime,
          [],
          [],
          new AssertionCollector()
        ).then(resolve);
      }

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (worker) {
          worker.terminate();
          worker = null;
        }
        URL.revokeObjectURL(workerUrl);
      };

      timer = setTimeout(() => {
        cleanup();
        resolve({
          stdout: '',
          stderr: `Execution timed out after ${timeoutMs}ms (infinite loop terminated)`,
          exitCode: 1,
          durationMs: Math.round(performance.now() - startTime),
          error: `Execution timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      worker.onmessage = (e) => {
        cleanup();
        const data = e.data;
        const durationMs = Math.round(performance.now() - startTime);
        const hasFailedTests = data.testResults && data.testResults.some((t: TestResult) => !t.passed);
        resolve({
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          exitCode: (!data.ok || hasFailedTests) ? 1 : 0,
          durationMs,
          error: data.error,
          testResults: data.testResults?.length ? data.testResults : undefined,
        });
      };

      worker.onerror = (e) => {
        cleanup();
        resolve({
          stdout: '',
          stderr: e.message || 'Worker runtime error',
          exitCode: 1,
          durationMs: Math.round(performance.now() - startTime),
          error: e.message,
        });
      };

      worker.postMessage({ run: true });
    });
  }
}
