import { describe, it, expect } from 'vitest';
import { GoSandboxRunner } from '../runners/go/runner';

describe('Go Sandbox Runner', () => {
  const runner = new GoSandboxRunner();

  it('executes fmt.Println and captures stdout', async () => {
    const code = `package main

import "fmt"

func main() {
	fmt.Println("Hello, LearnForge Go!")
}
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Hello, LearnForge Go!');
  });

  it('executes Go worker pool concurrency with channels and WaitGroup', async () => {
    const code = `package main

import (
	"fmt"
	"sync"
)

type Task struct {
	ID    int
	Value int
}

type Result struct {
	TaskID int
	Output int
}

func worker(id int, jobs <-chan Task, results chan<- Result, wg *sync.WaitGroup) {
	defer wg.Done()
	for task := range jobs {
		results <- Result{TaskID: task.ID, Output: task.Value * 2}
	}
}

func main() {
	jobs := make(chan Task)
	results := make(chan Result)
	var wg sync.WaitGroup

	for w := 1; w <= 3; w++ {
		wg.Add(1)
		go worker(w, jobs, results, &wg)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	go func() {
		for j := 1; j <= 4; j++ {
			jobs <- Task{ID: j, Value: j * 10}
		}
		close(jobs)
	}()

	for res := range results {
		fmt.Printf("Task %d completed: %d\\n", res.TaskID, res.Output)
	}
}
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Task 1 completed: 20');
    expect(result.stdout).toContain('Task 4 completed: 80');
  });

  it('supports context cancellation and timeouts', async () => {
    const code = `package main

import (
	"context"
	"fmt"
	"time"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	select {
	case <-ctx.Done():
		fmt.Println("Context canceled successfully")
	default:
		fmt.Println("Context not canceled")
	}
}
`;
    const result = await runner.execute(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Context canceled successfully');
  });

  it('runs Go test assertions TestXxx(t *testing.T)', async () => {
    const code = `package main

func Double(n int) int {
	return n * 2
}
`;
    const tests = `package main

import "testing"

func TestDouble(t *testing.T) {
	if Double(10) != 20 {
		t.Errorf("expected 20, got %d", Double(10))
	}
}
`;
    const result = await runner.execute(code, tests);
    expect(result.exitCode).toBe(0);
    expect(result.testResults).toBeDefined();
    expect(result.testResults?.length).toBeGreaterThan(0);
    expect(result.testResults?.[0].passed).toBe(true);
  });
});
