import { describe, expect, it } from 'vitest';
import { PythonSandboxRunner } from '../runners/python';

describe('Python Sandbox Runner', () => {
  const runner = new PythonSandboxRunner();

  it('executes basic print statements and captures stdout', async () => {
    const code = `
print("Hello from Python!")
print("Calculation:", 21 * 2)
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Hello from Python!');
    expect(result.stdout).toContain('Calculation: 42');
    expect(result.stderr).toBe('');
  });

  it('executes functions, conditionals, and loops', async () => {
    const code = `
def fibonacci(n):
    a = 0
    b = 1
    result = []
    for _ in range(n):
        result.append(a)
        temp = a + b
        a = b
        b = temp
    return result

fibs = fibonacci(7)
print("Fibonacci:", fibs)
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Fibonacci: [0, 1, 1, 2, 3, 5, 8]');
  });

  it('supports list comprehensions and builtins', async () => {
    const code = `
nums = [1, 2, 3, 4, 5, 6]
evens = [x * 10 for x in nums if x % 2 == 0]
print("Evens:", evens)
print("Sum:", sum(evens))
print("Max:", max(evens))
print("Len:", len(evens))
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Evens: [20, 40, 60]');
    expect(result.stdout).toContain('Sum: 120');
    expect(result.stdout).toContain('Max: 60');
    expect(result.stdout).toContain('Len: 3');
  });

  it('runs assert statements and produces TestResult items', async () => {
    const code = `
def add(a, b):
    return a + b
`;
    const tests = `
assert add(2, 3) == 5, "2 + 3 should equal 5"
assert add(-1, 1) == 0, "-1 + 1 should equal 0"
`;
    const result = await runner.execute(code, tests);
    expect(result.exitCode).toBe(0);
    expect(result.testResults).toBeDefined();
    expect(result.testResults?.length).toBe(2);
    expect(result.testResults?.[0].passed).toBe(true);
    expect(result.testResults?.[1].passed).toBe(true);
  });

  it('handles failing assertions properly', async () => {
    const code = `
def multiply(a, b):
    return a * b
`;
    const tests = `
assert multiply(3, 4) == 12, "3 * 4 == 12"
assert multiply(2, 5) == 99, "2 * 5 should be 99 (bug)"
`;
    const result = await runner.execute(code, tests);
    expect(result.exitCode).toBe(1);
    expect(result.testResults).toBeDefined();
    expect(result.testResults?.length).toBe(2);
    expect(result.testResults?.[0].passed).toBe(true);
    expect(result.testResults?.[1].passed).toBe(false);
    expect(result.testResults?.[1].error).toContain('bug');
  });
});
