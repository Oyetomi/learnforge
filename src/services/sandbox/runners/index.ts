/**
 * LearnForge Sandbox Runner Registry
 */

import { SandboxRunner, SupportedLanguage } from '../types';
import { GoSandboxRunner } from './go/runner';
import { JavaScriptSandboxRunner } from './javascript';
import { PythonSandboxRunner } from './python';
import { RustSandboxRunner } from './rust';

export * from './javascript';
export * from './python';
export * from './rust';
export * from './go/types';
export * from './go/runtime';
export * from './go/interpreter';
export * from './go/runner';

const jsRunner = new JavaScriptSandboxRunner();
const pyRunner = new PythonSandboxRunner();
const goRunner = new GoSandboxRunner();
const rustRunner = new RustSandboxRunner();

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
    default:
      return 'javascript';
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
    default:
      return jsRunner;
  }
}
