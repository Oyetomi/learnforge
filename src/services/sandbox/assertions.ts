/**
 * LearnForge Test Assertion Harness
 * Provides unified test running, expectation primitives, and output parsers.
 */

import { TestResult } from './types';

export class AssertionCollector {
  private results: TestResult[] = [];
  private currentSuite: string = '';

  describe(suiteName: string, fn: () => void | Promise<void>): void | Promise<void> {
    const prevSuite = this.currentSuite;
    this.currentSuite = prevSuite ? `${prevSuite} > ${suiteName}` : suiteName;
    try {
      const res = fn();
      if (res && typeof (res as Promise<void>).then === 'function') {
        return (res as Promise<void>).finally(() => {
          this.currentSuite = prevSuite;
        });
      }
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  async runTest(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
    const fullName = this.currentSuite ? `${this.currentSuite} > ${name}` : name;
    try {
      await fn();
      const result: TestResult = {
        name: fullName,
        passed: true,
      };
      this.results.push(result);
      return result;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      let expected: string | undefined;
      let actual: string | undefined;

      if (err && typeof err === 'object') {
        const anyErr = err as Record<string, unknown>;
        if ('expected' in anyErr) expected = formatValue(anyErr.expected);
        if ('actual' in anyErr) actual = formatValue(anyErr.actual);
      }

      const result: TestResult = {
        name: fullName,
        passed: false,
        expected,
        actual,
        error: errorMessage,
      };
      this.results.push(result);
      return result;
    }
  }

  addResult(result: TestResult): void {
    this.results.push(result);
  }

  getResults(): TestResult[] {
    return [...this.results];
  }

  clear(): void {
    this.results = [];
    this.currentSuite = '';
  }
}

export function formatValue(val: unknown): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
  if (val instanceof Error) return val.message;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

export interface Matcher<T> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeGreaterThan(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toContain(item: unknown): void;
  toThrow(expectedError?: string | RegExp): void;
  not: Matcher<T>;
}

export function createExpect(actual: unknown, isNot = false): Matcher<unknown> {
  const fail = (message: string, expected?: unknown) => {
    const err = new Error(message) as Error & { expected?: unknown; actual?: unknown };
    err.expected = expected;
    err.actual = actual;
    throw err;
  };

  const matcher: Matcher<unknown> = {
    get not() {
      return createExpect(actual, !isNot);
    },
    toBe(expected: unknown) {
      const pass = Object.is(actual, expected);
      if (isNot ? pass : !pass) {
        fail(
          isNot
            ? `Expected value NOT to be ${formatValue(expected)}`
            : `Expected ${formatValue(actual)} to be ${formatValue(expected)}`,
          expected
        );
      }
    },
    toEqual(expected: unknown) {
      const pass = deepEqual(actual, expected);
      if (isNot ? pass : !pass) {
        fail(
          isNot
            ? `Expected value NOT to equal ${formatValue(expected)}`
            : `Expected ${formatValue(actual)} to deeply equal ${formatValue(expected)}`,
          expected
        );
      }
    },
    toBeTruthy() {
      const pass = Boolean(actual);
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be truthy`);
      }
    },
    toBeFalsy() {
      const pass = !actual;
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be falsy`);
      }
    },
    toBeNull() {
      const pass = actual === null;
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be null`);
      }
    },
    toBeUndefined() {
      const pass = actual === undefined;
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be undefined`);
      }
    },
    toBeDefined() {
      const pass = actual !== undefined;
      if (isNot ? pass : !pass) {
        fail(`Expected value ${isNot ? 'NOT ' : ''}to be defined`);
      }
    },
    toBeGreaterThan(expected: number) {
      const pass = typeof actual === 'number' && actual > expected;
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      const pass = typeof actual === 'number' && actual < expected;
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be less than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      const pass = typeof actual === 'number' && actual >= expected;
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be >= ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      const pass = typeof actual === 'number' && actual <= expected;
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to be <= ${expected}`);
      }
    },
    toContain(item: unknown) {
      let pass = false;
      if (typeof actual === 'string' && typeof item === 'string') {
        pass = actual.includes(item);
      } else if (Array.isArray(actual)) {
        pass = actual.some(elem => deepEqual(elem, item));
      } else if (actual instanceof Set) {
        pass = actual.has(item);
      } else if (actual instanceof Map) {
        pass = actual.has(item);
      }
      if (isNot ? pass : !pass) {
        fail(`Expected ${formatValue(actual)} ${isNot ? 'NOT ' : ''}to contain ${formatValue(item)}`);
      }
    },
    toThrow(expectedError?: string | RegExp) {
      if (typeof actual !== 'function') {
        throw new Error(`expect(fn).toThrow requires actual to be a function`);
      }
      let thrown = false;
      let thrownError: unknown;
      try {
        actual();
      } catch (e) {
        thrown = true;
        thrownError = e;
      }
      if (isNot ? thrown : !thrown) {
        fail(isNot ? `Expected function NOT to throw, but it threw: ${thrownError}` : `Expected function to throw`);
      }
      if (thrown && expectedError) {
        const msg = thrownError instanceof Error ? thrownError.message : String(thrownError);
        if (typeof expectedError === 'string' && !msg.includes(expectedError)) {
          fail(`Expected error message to include "${expectedError}", but got "${msg}"`);
        } else if (expectedError instanceof RegExp && !expectedError.test(msg)) {
          fail(`Expected error message to match ${expectedError}, but got "${msg}"`);
        }
      }
    },
  };

  return matcher;
}

/**
 * Standard Go test output parser
 * Parses lines like:
 * --- PASS: TestWorkerPool (0.01s)
 * --- FAIL: TestWorkerPool (0.02s)
 */
export function parseGoTestOutput(stdout: string, stderr: string): TestResult[] {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split('\n');
  const results: TestResult[] = [];

  const passRegex = /--- PASS:\s+([A-Za-z0-9_]+)\s*\(([^)]+)\)/;
  const failRegex = /--- FAIL:\s+([A-Za-z0-9_]+)\s*\(([^)]+)\)/;

  let currentFailedTest: string | null = null;
  let failureDetails: string[] = [];

  for (const line of lines) {
    const passMatch = line.match(passRegex);
    if (passMatch) {
      if (currentFailedTest) {
        results.push({
          name: currentFailedTest,
          passed: false,
          error: failureDetails.join('\n').trim(),
        });
        currentFailedTest = null;
        failureDetails = [];
      }
      results.push({
        name: passMatch[1],
        passed: true,
      });
      continue;
    }

    const failMatch = line.match(failRegex);
    if (failMatch) {
      if (currentFailedTest) {
        results.push({
          name: currentFailedTest,
          passed: false,
          error: failureDetails.join('\n').trim(),
        });
        failureDetails = [];
      }
      currentFailedTest = failMatch[1];
      continue;
    }

    if (currentFailedTest) {
      if (line.trim().startsWith('=== RUN') || line.trim().startsWith('FAIL') || line.trim().startsWith('PASS')) {
        results.push({
          name: currentFailedTest,
          passed: false,
          error: failureDetails.join('\n').trim(),
        });
        currentFailedTest = null;
        failureDetails = [];
      } else {
        failureDetails.push(line.trim());
      }
    }
  }

  if (currentFailedTest) {
    results.push({
      name: currentFailedTest,
      passed: false,
      error: failureDetails.join('\n').trim(),
    });
  }

  return results;
}

/**
 * Parses Python unittest / pytest style outputs into structured TestResults
 */
export function parsePythonTestOutput(stdout: string, stderr: string): TestResult[] {
  const combined = `${stdout}\n${stderr}`;
  const results: TestResult[] = [];
  const lines = combined.split('\n');

  // Regex for unittest: "test_something (test_mod.TestClass) ... ok" or "FAIL" or "ERROR"
  const unittestRegex = /^(test\w+)\s*\(([^)]+)\)\s*\.\.\.\s*(ok|FAIL|ERROR)/;
  // Regex for pytest: "test_something.py::test_fn PASSED" or "FAILED"
  const pytestRegex = /^(.+?)::(\w+)\s+(PASSED|FAILED|ERROR)/;

  for (const line of lines) {
    const uMatch = line.match(unittestRegex);
    if (uMatch) {
      const [, testName, , status] = uMatch;
      results.push({
        name: testName,
        passed: status === 'ok',
        error: status !== 'ok' ? `Test ${status}` : undefined,
      });
      continue;
    }

    const pMatch = line.match(pytestRegex);
    if (pMatch) {
      const [, , testName, status] = pMatch;
      results.push({
        name: testName,
        passed: status === 'PASSED',
        error: status !== 'PASSED' ? `Test ${status}` : undefined,
      });
    }
  }

  return results;
}
