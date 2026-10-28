/** Real remote execution; compiler availability comes from the provider's live catalog. */
import { parseGoTestOutput, parsePythonTestOutput } from './assertions';
import { ExecutionResult } from './types';
import { executionFetch } from './transport';

export interface WandboxCompiler {
  name: string;
  language: string;
  version: string;
}

// Language aliases only. Compiler versions must never be assumed to exist.
const aliases: Record<string, string> = {
  golang: 'go', py: 'python', python3: 'python', rs: 'rust',
  cpp: 'c++', cxx: 'c++', cc: 'c++', clang: 'c',
  csharp: 'c#', cs: 'c#', dotnet: 'c#',
  bash: 'bash script', sh: 'bash script', shell: 'bash script',
  rb: 'ruby', js: 'javascript', node: 'javascript', ts: 'typescript',
  ex: 'elixir', exs: 'elixir', sqlite: 'sql', ocaml: 'ocaml',
};
const languageKey = (value: string) => aliases[value.trim().toLowerCase()] ?? value.trim().toLowerCase();
let catalog: { expires: number; value: WandboxCompiler[] } | undefined;
let pendingCatalog: Promise<WandboxCompiler[]> | undefined;

export async function listWandboxCompilers(): Promise<WandboxCompiler[]> {
  if (catalog && catalog.expires > Date.now()) return catalog.value;
  if (pendingCatalog) return pendingCatalog;
  pendingCatalog = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await executionFetch('https://wandbox.org/api/list.json', { signal: controller.signal });
      if (!response.ok) throw new Error(`Compiler catalog unavailable (HTTP ${response.status}). Try again shortly.`);
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.length || !data.every(c =>
        c && typeof c.name === 'string' && typeof c.language === 'string' && typeof c.version === 'string')) {
        throw new Error('The execution service returned an invalid compiler catalog.');
      }
      catalog = { expires: Date.now() + 5 * 60_000, value: data };
      return data;
    } finally {
      clearTimeout(timer);
    }
  })();
  try { return await pendingCatalog; }
  finally { pendingCatalog = undefined; }
}

export async function resolveWandboxCompiler(language: string): Promise<WandboxCompiler | undefined> {
  const candidates = (await listWandboxCompilers()).filter(c => languageKey(c.language) === languageKey(language));
  // Prefer a stable release. The catalog orders current releases before older ones.
  const stable = candidates.filter(c => !/(?:head|trunk|nightly|snapshot|preview|dev|experimental)/i.test(`${c.name} ${c.version}`));
  const preferred = stable.length ? stable : candidates;
  if (languageKey(language) === 'python') return preferred.find(c => /^cpython-3\./.test(c.name)) ?? preferred[0];
  if (languageKey(language) === 'c#') return preferred.find(c => c.name.startsWith('dotnet')) ?? preferred[0];
  return preferred[0];
}

export interface ExecutionEnvironment {
  available: boolean;
  label: string;
  detail: string;
}

export async function getExecutionEnvironment(language: string): Promise<ExecutionEnvironment> {
  const key = languageKey(language);
  if (key === 'javascript' || key === 'typescript') return {
    available: true, label: 'Browser worker · on device',
    detail: 'Runs on this device. Browser JavaScript APIs; Node.js modules and package installation are unavailable.',
  };
  if (key === 'go' || key === 'rust') {
    const provider = key === 'go' ? 'Go Playground' : 'Rust Playground';
    return { available: true, label: `${provider} · cloud`, detail: `Run sends this code and its tests to ${provider}. Internet access is required; playground limits apply.` };
  }
  const compiler = await resolveWandboxCompiler(language);
  return compiler ? {
    available: true, label: `${compiler.language} ${compiler.version} · Wandbox`,
    detail: `Run sends this code and its tests to Wandbox (${compiler.name}). Internet access is required; service limits apply.`,
  } : {
    available: false, label: `${language} · editor only`,
    detail: `Wandbox does not currently offer a runtime for ${language}. You can edit and copy this code, but it cannot be run here.`,
  };
}

function withGoPackage(source: string): string {
  return /^\s*package\s+\w+/m.test(source) ? source : `package main\n\n${source}`;
}

export async function executeGoPlayground(code: string, tests?: string, timeoutMs = 15000): Promise<ExecutionResult> {
  const start = performance.now();
  // Tests go in prog.go so the Playground detects test mode. Source stays in a
  // separate file, preserving imports/aliases and main(), and using real testing.T.
  const body = tests?.trim()
    ? `${withGoPackage(tests)}\n-- learner.go --\n${withGoPackage(code)}`
    : withGoPackage(code);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await executionFetch('https://play.golang.org/compile', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ version: '2', body }).toString(), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Go Playground unavailable (HTTP ${response.status}). Try again shortly.`);
    const data = await response.json();
    if (typeof data.Status !== 'number' && !data.Errors) throw new Error('Go Playground returned an invalid execution result.');
    const events: { Kind: string; Message: string }[] = Array.isArray(data.Events) ? data.Events : [];
    const stdout = events.filter(e => e.Kind === 'stdout').map(e => e.Message).join('').trim();
    let stderr = [data.Errors, events.filter(e => e.Kind === 'stderr').map(e => e.Message).join(''), data.VetErrors].filter(Boolean).join('\n').trim();
    const testResults = tests ? parseGoTestOutput(stdout, stderr) : undefined;
    const exitCode = data.Errors || data.TestsFailed > 0 || testResults?.some(t => !t.passed) ? 1 : data.Status;
    if (exitCode !== 0 && !stderr && !stdout) stderr = `Program exited with status ${exitCode}.`;
    return {
      stdout, stderr, durationMs: Math.round(performance.now() - start),
      exitCode,
      error: data.Errors ? 'Go compilation or execution failed' : undefined,
      testResults: testResults?.length ? testResults : undefined,
    };
  } finally { clearTimeout(timer); }
}

function pythonWithTests(code: string, tests: string): string {
  // Execute the complete suite (including setup and multiline assertions), rather
  // than dropping every line that doesn't start with "assert".
  return `${code}\n\nimport ast as _lf_ast, sys as _lf_sys\n_lf_failed = False\n_lf_count = 0\nfor _lf_node in _lf_ast.parse(${JSON.stringify(tests)}, filename="checks.py").body:\n    if isinstance(_lf_node, _lf_ast.Assert):\n        _lf_count += 1\n        try:\n            exec(compile(_lf_ast.Module(body=[_lf_node], type_ignores=[]), "checks.py", "exec"), globals())\n            print(f"test_mod.py::assert_{_lf_count} PASSED")\n        except AssertionError as _lf_err:\n            _lf_failed = True\n            print(f"test_mod.py::assert_{_lf_count} FAILED: {_lf_err}", file=_lf_sys.stderr)\n    else:\n        exec(compile(_lf_ast.Module(body=[_lf_node], type_ignores=[]), "checks.py", "exec"), globals())\nif _lf_failed:\n    _lf_sys.exit(1)\n`;
}

export async function executeWandbox(language: string, code: string, tests?: string, timeoutMs = 15000): Promise<ExecutionResult> {
  const start = performance.now();
  const compiler = await resolveWandboxCompiler(language);
  if (!compiler) throw new Error(`No execution runtime is available for ${language}. Your code has not been run.`);
  const python = languageKey(language) === 'python';
  const combinedCode = tests?.trim() ? (python ? pythonWithTests(code, tests) : `${code}\n\n${tests}`) : code;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await executionFetch('https://wandbox.org/api/compile.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compiler: compiler.name, code: combinedCode, save: false }), signal: controller.signal,
    });
    // Do not retry a POST automatically: the remote program may already have run.
    if (!response.ok) throw new Error(`Wandbox unavailable (HTTP ${response.status}). Try again shortly.`);
    const data = await response.json();
    if (data.status === undefined) throw new Error('Wandbox returned an invalid execution result.');
    const stdout = typeof data.program_output === 'string' ? data.program_output.trim() : '';
    const stderr = [data.compiler_error, data.program_error, data.signal ? `Signal: ${data.signal}` : ''].filter(Boolean).join('\n').trim();
    const testResults = tests && python ? parsePythonTestOutput(stdout, stderr) : undefined;
    return {
      stdout, stderr, durationMs: Math.round(performance.now() - start),
      exitCode: String(data.status) === '0' && !data.signal && !testResults?.some(t => !t.passed) ? 0 : 1,
      testResults: testResults?.length ? testResults : undefined,
    };
  } finally { clearTimeout(timer); }
}

export async function executeUniversalCode(language: string, code: string, tests?: string, timeoutMs = 15000): Promise<ExecutionResult> {
  return languageKey(language) === 'go'
    ? executeGoPlayground(code, tests, timeoutMs)
    : executeWandbox(language, code, tests, timeoutMs);
}
