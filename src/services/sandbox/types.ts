/**
 * LearnForge In-Browser Execution Sandbox Types
 * Clean, production-grade interfaces for multi-language execution and test assertions.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  error?: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  error?: string;
  testResults?: TestResult[];
}

export type SupportedLanguage =
  | 'go'
  | 'golang'
  | 'rust'
  | 'rs'
  | 'python'
  | 'py'
  | 'javascript'
  | 'js'
  | 'typescript'
  | 'ts';

export interface ExecutionOptions {
  /** Execution timeout in milliseconds (default: 5000ms) */
  timeoutMs?: number;
  /** Custom environment variables or globals */
  globals?: Record<string, unknown>;
  /** Force fallback/built-in runner even if external/Wasm engine is available */
  forceBuiltinRunner?: boolean;
}

export interface SandboxRunner {
  readonly language: string;
  execute(code: string, tests?: string, options?: ExecutionOptions): Promise<ExecutionResult>;
}

export interface TopicKata {
  id: string;
  title: string;
  language: SupportedLanguage;
  description: string;
  starterCode: string;
  testCode?: string;
  solutionCode?: string;
}
