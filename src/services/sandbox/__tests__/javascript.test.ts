import { describe, expect, it } from 'vitest';
import { JavaScriptSandboxRunner, stripTypeScript } from '../runners/javascript';

describe('JavaScript & TypeScript Sandbox Runner', () => {
  const runner = new JavaScriptSandboxRunner();

  it('strips TypeScript type annotations cleanly', () => {
    const tsCode = `
      interface User {
        id: number;
        name: string;
      }
      type ID = string | number;
      const x: number = 42;
      function greet(name: string, count: number = 1): string {
        return "Hello " + name;
      }
      const val = "test" as string;
    `;
    const stripped = stripTypeScript(tsCode);
    expect(stripped).not.toContain('interface User');
    expect(stripped).not.toContain('type ID');
    expect(stripped).toContain('const x = 42;');
    expect(stripped).toContain('function greet(name, count = 1)');
  });

  it('executes plain JavaScript and captures console.log', async () => {
    const code = `
      const a = 10;
      const b = 20;
      console.log("Sum:", a + b);
    `;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Sum: 30');
    expect(result.stderr).toBe('');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('executes TypeScript code with type annotations', async () => {
    const tsCode = `
      interface Calculator {
        multiply(x: number, y: number): number;
      }
      const calc = {
        multiply(x: number, y: number): number {
          return x * y;
        }
      };
      const answer: number = calc.multiply(6, 7);
      console.log("Answer is", answer);
    `;
    const result = await runner.execute(tsCode);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Answer is 42');
  });

  it('runs test assertions and captures TestResults', async () => {
    const code = `
      function reverseString(s) {
        return s.split('').reverse().join('');
      }
    `;
    const tests = `
      describe("reverseString suite", () => {
        it("reverses a simple word", () => {
          expect(reverseString("hello")).toBe("olleh");
        });
        it("handles empty string", () => {
          expect(reverseString("")).toBe("");
        });
      });
    `;
    const result = await runner.execute(code, tests);
    expect(result.exitCode).toBe(0);
    expect(result.testResults).toBeDefined();
    expect(result.testResults?.length).toBe(2);
    expect(result.testResults?.[0].passed).toBe(true);
    expect(result.testResults?.[0].name).toBe('reverseString suite > reverses a simple word');
    expect(result.testResults?.[1].passed).toBe(true);
  });

  it('handles failing test assertions cleanly', async () => {
    const code = `
      function add(a, b) { return a + b + 1; } // bug on purpose
    `;
    const tests = `
      describe("add tests", () => {
        it("correctly adds numbers", () => {
          expect(add(2, 3)).toBe(5);
        });
      });
    `;
    const result = await runner.execute(code, tests);
    expect(result.exitCode).toBe(1);
    expect(result.testResults?.length).toBe(1);
    expect(result.testResults?.[0].passed).toBe(false);
    expect(result.testResults?.[0].error).toContain('Expected 6 to be 5');
  });

  it('terminates execution when timeout is exceeded', async () => {
    const code = `
      // Simulating infinite loop or slow promise
      await new Promise(resolve => setTimeout(resolve, 2000));
    `;
    const result = await runner.execute(code, undefined, { timeoutMs: 50 });
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('timed out');
  });
});
