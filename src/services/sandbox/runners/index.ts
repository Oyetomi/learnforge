/**
 * LearnForge Sandbox Runner Registry
 */

import { SandboxRunner, SupportedLanguage } from '../types';
import { GoSandboxRunner } from './go/runner';
import { JavaScriptSandboxRunner } from './javascript';
import { PythonSandboxRunner } from './python';
import { RustSandboxRunner } from './rust';
import { UniversalSandboxRunner } from './universal';

export * from './javascript';
export * from './python';
export * from './rust';
export * from './universal';
export * from './go/types';
export * from './go/runner';

const jsRunner = new JavaScriptSandboxRunner();
const pyRunner = new PythonSandboxRunner();
const goRunner = new GoSandboxRunner();
const rustRunner = new RustSandboxRunner();
const universalRunners = new Map<string, UniversalSandboxRunner>();

export function normalizeLanguage(lang: string): SupportedLanguage {
  const clean = lang.trim().toLowerCase();
  switch (clean) {
    case 'go':
    case 'golang':
      return 'go';
    case 'rust':
    case 'rs':
      return 'rust';
    case 'python':
    case 'py':
    case 'python3':
      return 'python';
    case 'typescript':
    case 'ts':
      return 'typescript';
    case 'javascript':
    case 'js':
    case 'node':
      return 'javascript';
    case 'cpp':
    case 'c++':
    case 'cxx':
    case 'cc':
      return 'cpp';
    case 'c':
    case 'clang':
      return 'c';
    case 'java':
      return 'java';
    case 'csharp':
    case 'cs':
    case 'c#':
    case 'dotnet':
      return 'csharp';
    case 'bash':
    case 'sh':
    case 'shell':
      return 'bash';
    case 'ruby':
    case 'rb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'swift':
      return 'swift';
    case 'zig':
      return 'zig';
    case 'elixir':
    case 'ex':
    case 'exs':
      return 'elixir';
    case 'sql':
      return 'sql';
    default:
      return clean as SupportedLanguage;
  }
}

export function getRunnerForLanguage(language: string): SandboxRunner {
  const norm = normalizeLanguage(language);
  switch (norm) {
    case 'go':
      return goRunner;
    case 'rust':
      return rustRunner;
    case 'python':
      return pyRunner;
    case 'typescript':
    case 'javascript':
      return jsRunner;
    default: {
      let runner = universalRunners.get(norm);
      if (!runner) {
        runner = new UniversalSandboxRunner(norm);
        universalRunners.set(norm, runner);
      }
      return runner;
    }
  }
}
