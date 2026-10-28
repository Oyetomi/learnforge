import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRunnerForLanguage, normalizeLanguage } from '../runners';

afterEach(() => vi.unstubAllGlobals());
describe('Universal runner routing', () => {
  it('normalizes supported aliases without changing language semantics', () => {
    expect(['golang', 'py', 'rs', 'c++', 'c#', 'sh', 'zig'].map(normalizeLanguage)).toEqual(['go', 'python', 'rust', 'cpp', 'csharp', 'bash', 'zig']);
  });
  it('runs a catalog language through the real API adapter', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: 'gcc-current', language: 'C++', version: '15' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '0', program_output: '42\n' })));
    vi.stubGlobal('fetch', fetch);
    const result = await getRunnerForLanguage('cpp').execute('#include <iostream>\nint main(){std::cout << 42;}');
    expect(result).toMatchObject({ exitCode: 0, stdout: '42' });
    expect(fetch.mock.calls[1][0]).toBe('https://wandbox.org/api/compile.json');
  });
});
