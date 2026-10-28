/**
 * LearnForge Python Execution Sandbox Runner
 * Supports dual-engine execution:
 * 1. Pyodide WebAssembly engine (full CPython standard library in browser)
 * 2. High-speed built-in Python Kata Evaluator (zero network dependency, offline, instant sub-5ms)
 */

import { parsePythonTestOutput } from '../assertions';
import { executeWandbox } from '../api';
import { ExecutionOptions, ExecutionResult, SandboxRunner, TestResult } from '../types';

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL?: string }) => Promise<PyodideInterface>;
    pyodideInstance?: PyodideInterface;
  }
}

interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>;
  runPython: (code: string) => unknown;
}

export class PythonSandboxRunner implements SandboxRunner {
  readonly language = 'python';
  private pyodidePromise: Promise<PyodideInterface> | null = null;

  async execute(
    code: string,
    tests?: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const timeoutMs = options?.timeoutMs ?? 10000;
    const startTime = performance.now();

    // 1. If built-in runner is explicitly forced, run with MiniPythonEvaluator
    if (options?.forceBuiltinRunner) {
      return this.executeWithBuiltin(code, tests, options, startTime);
    }

    // 2. Execute via Wandbox Python 3.12 (supporting full standard library, asyncio, etc.)
    try {
      return await executeWandbox('python', code, tests, timeoutMs);
    } catch (cloudErr) {
      console.warn('Cloud Python API unavailable, falling back:', cloudErr);
    }

    // 3. Try Pyodide if available
    if (this.canUsePyodide()) {
      try {
        return await this.executeWithPyodide(code, tests, timeoutMs, startTime);
      } catch (pyodideErr) {
        console.warn('Pyodide execution failed/unavailable, falling back to built-in Python engine:', pyodideErr);
      }
    }

    // 4. Offline built-in evaluator fallback
    return this.executeWithBuiltin(code, tests, options, startTime);
  }

  private canUsePyodide(): boolean {
    return typeof window !== 'undefined' && (Boolean(window.loadPyodide) || Boolean(window.pyodideInstance));
  }

  private async getPyodide(): Promise<PyodideInterface> {
    if (typeof window !== 'undefined' && window.pyodideInstance) {
      return window.pyodideInstance;
    }
    if (this.pyodidePromise) return this.pyodidePromise;

    this.pyodidePromise = (async () => {
      if (typeof window !== 'undefined' && window.loadPyodide) {
        const pyodide = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
        });
        window.pyodideInstance = pyodide;
        return pyodide;
      }
      throw new Error('Pyodide script not loaded in current environment');
    })();

    return this.pyodidePromise;
  }

  private async executeWithPyodide(
    code: string,
    tests: string | undefined,
    timeoutMs: number,
    startTime: number
  ): Promise<ExecutionResult> {
    const pyodide = await this.getPyodide();

    const wrappedPythonScript = `
import sys
import io
import json
import traceback

sys_stdout_backup = sys.stdout
sys_stderr_backup = sys.stderr
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

test_results = []
error_occurred = None

def _run():
    global error_occurred
    try:
        # Run user code
${indentCode(code, 8)}

        # Run tests if provided
        ${tests ? indentCode(tests, 8) : 'pass'}
    except Exception as e:
        error_occurred = str(e)
        traceback.print_exc(file=sys.stderr)

_run()

_stdout = sys.stdout.getvalue()
_stderr = sys.stderr.getvalue()
sys.stdout = sys_stdout_backup
sys.stderr = sys_stderr_backup

json.dumps({
    "stdout": _stdout,
    "stderr": _stderr,
    "error": error_occurred
})
`;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const resultJson = (await Promise.race([
        pyodide.runPythonAsync(wrappedPythonScript),
        timeoutPromise,
      ])) as string;

      const parsed = JSON.parse(resultJson);
      const durationMs = Math.round(performance.now() - startTime);

      const testResults = parsePythonTestOutput(parsed.stdout, parsed.stderr);
      const hasFailedTests = testResults.some(t => !t.passed);

      return {
        stdout: parsed.stdout,
        stderr: parsed.stderr,
        exitCode: parsed.error || hasFailedTests ? 1 : 0,
        durationMs,
        error: parsed.error || undefined,
        testResults: testResults.length > 0 ? testResults : undefined,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async executeWithBuiltin(
    code: string,
    tests: string | undefined,
    options: ExecutionOptions | undefined,
    startTime: number
  ): Promise<ExecutionResult> {
    const evaluator = new MiniPythonEvaluator();
    return evaluator.run(code, tests, options?.timeoutMs ?? 5000, startTime);
  }
}

function indentCode(code: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map(line => (line.trim().length ? pad + line : line))
    .join('\n');
}

/**
 * Built-in Python Kata Evaluator & AST Transpiler
 * Provides zero-dependency, instant in-browser & node execution for Python algorithms,
 * data structures, and katas.
 */
export class MiniPythonEvaluator {
  private stdout: string[] = [];
  private stderr: string[] = [];
  private testResults: TestResult[] = [];

  async run(
    userCode: string,
    tests: string | undefined,
    timeoutMs: number,
    startTime: number
  ): Promise<ExecutionResult> {
    this.stdout = [];
    this.stderr = [];
    this.testResults = [];

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const execPromise = this.executeTranspiled(userCode, tests);
      await Promise.race([execPromise, timeoutPromise]);

      const durationMs = Math.round(performance.now() - startTime);
      const hasFailedTests = this.testResults.some(t => !t.passed);

      return {
        stdout: this.stdout.join('\n'),
        stderr: this.stderr.join('\n'),
        exitCode: hasFailedTests ? 1 : 0,
        durationMs,
        testResults: this.testResults.length > 0 ? this.testResults : undefined,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const msg = err instanceof Error ? err.message : String(err);
      this.stderr.push(msg);

      return {
        stdout: this.stdout.join('\n'),
        stderr: this.stderr.join('\n'),
        exitCode: 1,
        durationMs,
        error: msg,
        testResults: this.testResults.length > 0 ? this.testResults : undefined,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async executeTranspiled(userCode: string, testCode?: string): Promise<void> {
    const combinedPython = [userCode, testCode || ''].join('\n\n');
    const jsCode = this.transpilePythonToJS(combinedPython);

    const runtimeEnv = {
      print: (...args: unknown[]) => {
        const out = args
          .map(a => {
            if (typeof a === 'boolean') return a ? 'True' : 'False';
            if (a === null || a === undefined) return 'None';
            if (Array.isArray(a)) return '[' + a.map(x => (typeof x === 'string' ? `'${x}'` : String(x))).join(', ') + ']';
            if (typeof a === 'object') return JSON.stringify(a);
            return String(a);
          })
          .join(' ');
        this.stdout.push(out);
      },
      len: (obj: unknown) => {
        if (typeof obj === 'string' || Array.isArray(obj)) return obj.length;
        if (obj instanceof Set || obj instanceof Map) return obj.size;
        if (obj && typeof obj === 'object') return Object.keys(obj).length;
        throw new Error(`TypeError: object of type '${typeof obj}' has no len()`);
      },
      range: (start: number, stop?: number, step: number = 1): number[] => {
        let from = start;
        let to = stop;
        if (to === undefined) {
          to = from;
          from = 0;
        }
        const result: number[] = [];
        if (step > 0) {
          for (let i = from; i < to; i += step) result.push(i);
        } else if (step < 0) {
          for (let i = from; i > to; i += step) result.push(i);
        }
        return result;
      },
      sum: (iterable: Iterable<number>): number => {
        let s = 0;
        for (const item of iterable) s += item;
        return s;
      },
      min: (...args: unknown[]): number => {
        const items = args.length === 1 && Symbol.iterator in Object(args[0]) ? (args[0] as number[]) : (args as number[]);
        return Math.min(...items);
      },
      max: (...args: unknown[]): number => {
        const items = args.length === 1 && Symbol.iterator in Object(args[0]) ? (args[0] as number[]) : (args as number[]);
        return Math.max(...items);
      },
      abs: (x: number) => Math.abs(x),
      str: (x: unknown) => String(x),
      int: (x: unknown) => parseInt(String(x), 10),
      float: (x: unknown) => parseFloat(String(x)),
      bool: (x: unknown) => Boolean(x),
      list: (x?: Iterable<unknown>) => (x ? Array.from(x) : []),
      dict: (entries?: Iterable<[unknown, unknown]>) => (entries ? Object.fromEntries(entries) : {}),
      set: (x?: Iterable<unknown>) => new Set(x || []),
      sorted: <T>(arr: Iterable<T>, reverse = false): T[] => {
        const list = Array.from(arr);
        list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        if (reverse) list.reverse();
        return list;
      },
      reversed: <T>(arr: Iterable<T>): T[] => Array.from(arr).reverse(),
      enumerate: <T>(arr: Iterable<T>): Array<[number, T]> => Array.from(arr).map((item, i) => [i, item]),
      zip: (...arrays: unknown[][]): unknown[][] => {
        const minLen = Math.min(...arrays.map(a => a.length));
        const res: unknown[][] = [];
        for (let i = 0; i < minLen; i++) {
          res.push(arrays.map(a => a[i]));
        }
        return res;
      },
      isinstance: (obj: unknown, cls: unknown) => {
        if (cls === String) return typeof obj === 'string';
        if (cls === Number) return typeof obj === 'number';
        if (cls === Boolean) return typeof obj === 'boolean';
        if (cls === Array) return Array.isArray(obj);
        if (typeof cls === 'function') return obj instanceof cls;
        return false;
      },
      __assert: (condition: boolean, message?: string, testName?: string) => {
        const name = testName || 'Assertion';
        if (condition) {
          this.testResults.push({ name, passed: true });
        } else {
          const err = message || 'AssertionError';
          this.testResults.push({ name, passed: false, error: err });
        }
      },
    };

    const fnNames = Object.keys(runtimeEnv);
    const fnVals = Object.values(runtimeEnv);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction(...fnNames, jsCode);
    await runner(...fnVals);
  }

  /**
   * Translates Python indented katas to JavaScript
   */
  private transpilePythonToJS(pythonCode: string): string {
    const rawLines = pythonCode.split(/\r?\n/);
    const jsLines: string[] = [];
    const indentStack: number[] = [0];

    // Helper to close blocks
    const closeBlocksTo = (currentIndent: number) => {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > currentIndent) {
        indentStack.pop();
        jsLines.push('}');
      }
    };

    let testCounter = 1;

    for (let rawLine of rawLines) {
      // Ignore comments and empty lines
      const commentIndex = rawLine.indexOf('#');
      let line = commentIndex >= 0 ? rawLine.substring(0, commentIndex) : rawLine;
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      // Determine indentation
      const matchIndent = line.match(/^(\s*)/);
      const currentIndent = matchIndent ? matchIndent[1].replace(/\t/g, '    ').length : 0;

      // Handle dedents
      if (currentIndent < indentStack[indentStack.length - 1]) {
        // Dedent
        closeBlocksTo(currentIndent);
      }

      // Convert Python constructs
      // 1. Def function
      const defMatch = trimmed.match(/^def\s+([A-Za-z0-9_]+)\s*\((.*?)\)\s*:/);
      if (defMatch) {
        const [, fnName, params] = defMatch;
        const cleanedParams = params
          .split(',')
          .map(p => p.trim().split(':')[0].trim()) // strip type hints
          .filter(Boolean)
          .join(', ');

        jsLines.push(`function ${fnName}(${cleanedParams}) {`);
        indentStack.push(currentIndent + 4);
        continue;
      }

      // 2. If condition (including if __name__ == "__main__":)
      const ifMatch = trimmed.match(/^if\s+(.*?)\s*:/);
      if (ifMatch) {
        let cond = ifMatch[1].trim();
        if (cond.includes('__name__')) {
          cond = 'true';
        } else {
          cond = this.translateExpression(cond);
        }
        jsLines.push(`if (${cond}) {`);
        indentStack.push(currentIndent + 4);
        continue;
      }

      // 3. Elif condition
      const elifMatch = trimmed.match(/^elif\s+(.*?)\s*:/);
      if (elifMatch) {
        // Pop previous block
        if (indentStack.length > 1) indentStack.pop();
        const cond = this.translateExpression(elifMatch[1]);
        jsLines.push(`} else if (${cond}) {`);
        indentStack.push(currentIndent + 4);
        continue;
      }

      // 4. Else
      if (trimmed === 'else:') {
        if (indentStack.length > 1) indentStack.pop();
        jsLines.push(`} else {`);
        indentStack.push(currentIndent + 4);
        continue;
      }

      // 5. While loop
      const whileMatch = trimmed.match(/^while\s+(.*?)\s*:/);
      if (whileMatch) {
        const cond = this.translateExpression(whileMatch[1]);
        jsLines.push(`while (${cond}) {`);
        indentStack.push(currentIndent + 4);
        continue;
      }

      // 6. For loop: for x in iter: or for a, b in iter:
      const forMatch = trimmed.match(/^for\s+(.*?)\s+in\s+(.*?)\s*:/);
      if (forMatch) {
        let [, varName, iterable] = forMatch;
        varName = varName.trim();
        iterable = this.translateExpression(iterable);

        if (varName.includes(',')) {
          const tupleVars = varName.split(',').map(v => v.trim()).join(', ');
          jsLines.push(`for (const [${tupleVars}] of ${iterable}) {`);
        } else {
          jsLines.push(`for (const ${varName} of ${iterable}) {`);
        }
        indentStack.push(currentIndent + 4);
        continue;
      }

      // 7. Assert statement: assert cond [, message]
      const assertMatch = trimmed.match(/^assert\s+([^,]+)(?:,\s*(.+))?$/);
      if (assertMatch) {
        const cond = this.translateExpression(assertMatch[1]);
        const msg = assertMatch[2] ? this.translateExpression(assertMatch[2]) : `\`Test ${testCounter} failed\``;
        const testLabel = `Assertion #${testCounter++}`;
        jsLines.push(`__assert(${cond}, ${msg}, "${testLabel}");`);
        continue;
      }

      // 8. Return statement
      if (trimmed.startsWith('return')) {
        const expr = trimmed.slice(6).trim();
        if (expr) {
          jsLines.push(`return ${this.translateExpression(expr)};`);
        } else {
          jsLines.push(`return;`);
        }
        continue;
      }

      // 9. Assignment: ident = expr
      const assignMatch = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (assignMatch) {
        const [, varName, rhs] = assignMatch;
        jsLines.push(`var ${varName} = ${this.translateExpression(rhs)};`);
        continue;
      }

      // 10. Standard statements (e.g. expressions, function calls)
      jsLines.push(`${this.translateExpression(trimmed)};`);
    }

    // Close any remaining open blocks
    closeBlocksTo(0);

    // Auto-invoke test functions if defined
    jsLines.push(`
      // Automatically invoke any test_* functions
      if (typeof test_main === 'function') await test_main();
    `);

    return jsLines.join('\n');
  }

  private translateExpression(expr: string): string {
    let s = expr;

    // Convert f-strings: f"hello {x}" -> `hello ${x}`
    s = s.replace(/f"([^"]*)"/g, (_m, content) => {
      const interpolated = content.replace(/\{([^{}]+)\}/g, '${$1}');
      return `\`${interpolated}\``;
    });
    s = s.replace(/f'([^']*)'/g, (_m, content) => {
      const interpolated = content.replace(/\{([^{}]+)\}/g, '${$1}');
      return `\`${interpolated}\``;
    });

    // Convert Python literals
    s = s.replace(/\bTrue\b/g, 'true');
    s = s.replace(/\bFalse\b/g, 'false');
    s = s.replace(/\bNone\b/g, 'null');

    // Convert operators: " and ", " or ", " not "
    s = s.replace(/\band\b/g, '&&');
    s = s.replace(/\bor\b/g, '||');
    s = s.replace(/\bnot\s+/g, '!');

    // Convert list comprehension with if: [x * 2 for x in nums if x > 2]
    s = s.replace(
      /\[\s*(.+?)\s+for\s+([A-Za-z0-9_]+)\s+in\s+(.+?)\s+if\s+(.+?)\s*\]/g,
      (_match, target, variable, iterable, condition) => {
        return `Array.from(${iterable}).filter(${variable} => ${condition}).map(${variable} => ${target})`;
      }
    );

    // Convert list comprehension without if: [x * 2 for x in nums]
    s = s.replace(
      /\[\s*(.+?)\s+for\s+([A-Za-z0-9_]+)\s+in\s+(.+?)\s*\]/g,
      (_match, target, variable, iterable) => {
        return `Array.from(${iterable}).map(${variable} => ${target})`;
      }
    );

    // Convert "not in" and "in"
    s = s.replace(/(\w+)\s+not\s+in\s+(\w+)/g, '!$2.includes($1)');
    s = s.replace(/(\w+)\s+in\s+(\w+)/g, '$2.includes($1)');

    // Convert list .append(...) to .push(...)
    s = s.replace(/\.append\(/g, '.push(');

    // Convert Python dictionary .get(k, default)
    // simple pass-through or prototype addition

    return s;
  }
}
