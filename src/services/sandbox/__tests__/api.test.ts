import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const compilers = [
  { name: 'cpython-head', language: 'Python', version: '3.16-dev' },
  { name: 'cpython-3.14.0', language: 'Python', version: '3.14.0' },
  { name: 'gcc-15.2.0', language: 'C++', version: '15.2.0' },
  { name: 'bash-current', language: 'Bash script', version: '5.3' },
  { name: 'sqlite-3.50', language: 'SQL', version: '3.50' },
  { name: 'lua-5.4', language: 'Lua', version: '5.4' },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Real execution adapters', () => {
  it('discovers stable compiler IDs, shares the catalog, and supports SQL and additional catalog languages', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(compilers)).mockResolvedValue(json({ status: '0', program_output: '42\n' }));
    vi.stubGlobal('fetch', fetch);
    const api = await import('../api');
    const [python, sql, lua] = await Promise.all([
      api.resolveWandboxCompiler('py'), api.getExecutionEnvironment('sql'), api.getExecutionEnvironment('lua'),
    ]);
    expect(python?.name).toBe('cpython-3.14.0');
    expect(sql.available).toBe(true);
    expect(lua.label).toContain('Lua 5.4');
    expect(fetch).toHaveBeenCalledTimes(1);
    const result = await api.executeWandbox('sql', 'SELECT 42;');
    expect(result.stdout).toBe('42');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ compiler: 'sqlite-3.50', code: 'SELECT 42;', save: false });
  });

  it('marks absent languages editor-only and never submits their code', async () => {
    const fetch = vi.fn().mockResolvedValue(json(compilers));
    vi.stubGlobal('fetch', fetch);
    const api = await import('../api');
    expect((await api.getExecutionEnvironment('kotlin')).available).toBe(false);
    await expect(api.executeWandbox('kotlin', 'private code')).rejects.toThrow('has not been run');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not relabel zsh as Bash', async () => {
    const { normalizeLanguage } = await import('../runners');
    expect(normalizeLanguage('zsh')).toBe('zsh');
  });

  it('leaves JavaScript on device and does not promise Node.js', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const api = await import('../api');
    expect(await api.getExecutionEnvironment('ts')).toMatchObject({ available: true, detail: expect.stringContaining('Node.js modules') });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves Go source and test imports as separate files, including a source main()', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ Status: 0, IsTest: true, TestsFailed: 0, Events: [{ Kind: 'stdout', Message: '=== RUN   TestDouble\n--- PASS: TestDouble (0.00s)\nPASS\n' }] }));
    vi.stubGlobal('fetch', fetch);
    const api = await import('../api');
    const source = 'package main\nimport f "fmt"\nfunc main() { f.Println("hi") }\nfunc Double(n int) int { return n*2 }';
    const tests = 'package main\nimport "testing"\nfunc TestDouble(t *testing.T) { if Double(2)!=4 { t.Fatal("bad") } }';
    const result = await api.executeGoPlayground(source, tests);
    const payload = new URLSearchParams(fetch.mock.calls[0][1].body).get('body')!;
    expect(payload).toBe(`${tests}\n-- learner.go --\n${source}`);
    expect(payload).not.toContain('&testing.T{}');
    expect(result.testResults?.[0].passed).toBe(true);
  });

  it('uses Go status rather than interpreting stderr as failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ Status: 0, Events: [{ Kind: 'stderr', Message: 'a normal diagnostic' }] })));
    const api = await import('../api');
    expect(await api.executeGoPlayground('func main() {}')).toMatchObject({ exitCode: 0, stderr: 'a normal diagnostic' });
  });

  it('preserves nonzero Go exit status even when the program prints nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ Status: 7, Errors: '', Events: null })));
    const api = await import('../api');
    expect(await api.executeGoPlayground('package main\nimport "os"\nfunc main(){os.Exit(7)}')).toMatchObject({ exitCode: 7, stderr: 'Program exited with status 7.' });
  });

  it('rejects malformed results and does not simulate success when the API fails', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({})).mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const api = await import('../api');
    await expect(api.executeGoPlayground('func main() {}')).rejects.toThrow('invalid execution result');
    const { GoSandboxRunner, PythonSandboxRunner } = await import('../runners');
    await expect(new GoSandboxRunner().execute('package main\nfunc main() {}')).rejects.toThrow('offline');
    await expect(new PythonSandboxRunner().execute('print(42)')).rejects.toThrow('offline');
  });

  it('does not retry an execution POST, even after rate limiting', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(compilers)).mockResolvedValueOnce(json({}, 429));
    vi.stubGlobal('fetch', fetch);
    const api = await import('../api');
    await expect(api.executeWandbox('cpp', 'int main() {}')).rejects.toThrow('429');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves complete Python test setup and multiline assertions', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(compilers)).mockResolvedValueOnce(json({ status: '1', compiler_error: 'compile warning', program_error: 'test_mod.py::assert_1 FAILED: incorrect' }));
    vi.stubGlobal('fetch', fetch);
    const api = await import('../api');
    const tests = 'expected = 4\nassert (\n    double(2) == expected\n), "incorrect"';
    const result = await api.executeWandbox('python', 'def double(x): return x*2', tests);
    const code = JSON.parse(fetch.mock.calls[1][1].body).code;
    expect(code).toContain(JSON.stringify(tests));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('compile warning');
    expect(result.stderr).toContain('incorrect');
  });

  it('retries catalog discovery after a failed lookup, without caching the failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(json(compilers)));
    const api = await import('../api');
    await expect(api.listWandboxCompilers()).rejects.toThrow('offline');
    expect(await api.resolveWandboxCompiler('bash')).toMatchObject({ name: 'bash-current' });
  });
});

describe('Desktop transport', () => {
  it('uses scoped native HTTP rather than WebView CORS for packaged execution', async () => {
    const nativeFetch = vi.fn().mockResolvedValue(json({ Status: 0 }));
    vi.doMock('@tauri-apps/plugin-http', () => ({ fetch: nativeFetch }));
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const browserFetch = vi.fn(); vi.stubGlobal('fetch', browserFetch);
    const { executionFetch } = await import('../transport');
    await executionFetch('https://play.golang.org/compile', { method: 'POST', body: 'fixture' });
    expect(nativeFetch).toHaveBeenCalledOnce();
    expect(browserFetch).not.toHaveBeenCalled();
    vi.doUnmock('@tauri-apps/plugin-http');
  });
});
