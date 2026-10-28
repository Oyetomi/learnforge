/**
 * LearnForge Universal Cloud Sandbox Runner
 *
 * Runs C, C++, C#, Java, Swift, Kotlin, Zig, Ruby, PHP, Bash, Elixir, Scala, Haskell, etc.
 * via production compiler APIs.
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
    const timeoutMs = options?.timeoutMs ?? 12000;
    return executeUniversalCode(this.language, code, tests, timeoutMs);
  }
}
