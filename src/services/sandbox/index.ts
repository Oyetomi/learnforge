/**
 * LearnForge In-Browser Execution Sandbox
 * Unified API entry point for multi-language execution and test assertions.
 */

import { getRunnerForLanguage, normalizeLanguage } from './runners';
import { getStarterCode, STARTER_KATAS } from './starter-code';
import { ExecutionOptions, ExecutionResult, SupportedLanguage, TestResult } from './types';

export * from './types';
export * from './assertions';
export * from './starter-code';
export * from './runners';

/**
 * Executes source code and optional tests in the specified programming language.
 *
 * @param language The language identifier ('go', 'python', 'javascript', 'typescript')
 * @param code The user code to execute
 * @param tests Optional test code or assertions to run against the user code
 * @param options Execution timeout, globals, or runner overrides
 * @returns Promise resolving to ExecutionResult with stdout, stderr, exitCode, durationMs, and testResults
 */
export async function executeCode(
  language: string,
  code: string,
  tests?: string,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const runner = getRunnerForLanguage(language);
  return runner.execute(code, tests, options);
}

export { getStarterCode, STARTER_KATAS };
