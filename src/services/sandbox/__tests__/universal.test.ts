import { describe, expect, it } from 'vitest';
import { getRunnerForLanguage, normalizeLanguage } from '../runners';

describe('Universal Code Sandbox Runner', () => {
  it('normalizes languages correctly', () => {
    expect(normalizeLanguage('golang')).toBe('go');
    expect(normalizeLanguage('py')).toBe('python');
    expect(normalizeLanguage('rs')).toBe('rust');
    expect(normalizeLanguage('c++')).toBe('cpp');
    expect(normalizeLanguage('c#')).toBe('csharp');
    expect(normalizeLanguage('sh')).toBe('bash');
    expect(normalizeLanguage('java')).toBe('java');
    expect(normalizeLanguage('zig')).toBe('zig');
  });

  it('retrieves universal runner for C++ and executes code', async () => {
    const runner = getRunnerForLanguage('cpp');
    expect(runner).toBeDefined();
    expect(runner.language).toBe('cpp');

    const code = `
#include <iostream>

int main() {
    std::cout << "Universal C++ Execution OK" << std::endl;
    return 0;
}
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Universal C++ Execution OK');
  }, 20000);

  it('retrieves universal runner for Bash and executes commands', async () => {
    await new Promise((r) => setTimeout(r, 800));
    const runner = getRunnerForLanguage('bash');
    expect(runner).toBeDefined();

    const code = `
echo "Universal Bash OK"
expr 20 + 22
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Universal Bash OK');
    expect(result.stdout).toContain('42');
  }, 20000);
});
