import { afterEach, describe, expect, it, vi } from 'vitest';
import { RustSandboxRunner } from '../runners/rust';
import { parseRustTestOutput } from '../assertions';

describe('Rust Sandbox Runner', () => {
  afterEach(() => vi.unstubAllGlobals());
  const runner = new RustSandboxRunner();

  it('correctly parses Rust test assertions output', () => {
    const stdout = `
running 2 tests
test tests::test_calculate_length ... ok
test tests::test_fail ... FAILED

failures:

---- tests::test_fail stdout ----
thread 'tests::test_fail' panicked at src/main.rs:15:9:
assertion \`left == right\` failed
  left: 10
  right: 20

test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
`;
    const results = parseRustTestOutput(stdout, '');
    expect(results.length).toBe(2);
    expect(results[0].name).toBe('tests::test_calculate_length');
    expect(results[0].passed).toBe(true);
    expect(results[1].name).toBe('tests::test_fail');
    expect(results[1].passed).toBe(false);
    expect(results[1].error).toContain('assertion `left == right` failed');
  });

  it('executes Rust code and passes tests via playground runner', async () => {
    const code = `
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    println!("Sum: {}", add(3, 4));
}
`;
    const tests = `
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }
}
`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, stdout: 'test tests::test_add ... ok\n', stderr: '' }))));
    const result = await runner.execute(code, tests);
    expect(result.exitCode).toBe(0);
    expect(result.testResults).toBeDefined();
    expect(result.testResults?.length).toBeGreaterThan(0);
    expect(result.testResults?.[0].passed).toBe(true);
  }, 15000);
});
