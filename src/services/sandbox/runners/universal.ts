/**
 * LearnForge Universal Cloud Sandbox Runner
 *
 * Runs languages present in Wandbox's current compiler catalog.
 * Missing runtimes return an explicit error; no simulated fallback.
 */

import { executeUniversalCode } from '../api';
import { ExecutionOptions, ExecutionResult, SandboxRunner } from '../types';

export class UniversalSandboxRunner implements SandboxRunner {
  readonly language: string;

  constructor(language: string) {
    this.language = language;
  }

  async execute(
    code: string,
    tests?: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const timeoutMs = options?.timeoutMs ?? 15000;
    return executeUniversalCode(this.language, code, tests, timeoutMs);
  }
}
