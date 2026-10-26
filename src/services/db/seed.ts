import { LearningSession, ChatMessage, Milestone, SRSCard } from '../../types';

export const SEED_SESSIONS: LearningSession[] = [
  {
    id: 'session-go-concurrency',
    title: 'Go Concurrency & Worker Pools',
    topic: 'Go Concurrency Patterns',
    language: 'go',
    created_at: Date.now() - 1000 * 60 * 60 * 24,
    updated_at: Date.now() - 1000 * 60 * 30,
  },
  {
    id: 'session-rust-ownership',
    title: 'Rust Memory Ownership & Lifetimes',
    topic: 'Memory Safety & Borrow Checker',
    language: 'rust',
    created_at: Date.now() - 1000 * 60 * 60 * 48,
    updated_at: Date.now() - 1000 * 60 * 60 * 12,
  },
];

export const SEED_MILESTONES: Milestone[] = [
  {
    id: 'm-worker-pool-1',
    session_id: 'session-go-concurrency',
    title: 'Milestone 1: Worker Pool with Unbuffered Channels',
    prompt: 'Implement a worker pool of N workers processing jobs from an unbuffered channel and sending results to a results channel synchronized by sync.WaitGroup.',
    starter_code: `package main

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

	// Launch 3 workers
	for w := 1; w <= 3; w++ {
		wg.Add(1)
		go worker(w, jobs, results, &wg)
	}

	// Close results channel once all workers finish
	go func() {
		wg.Wait()
		close(results)
	}()

	// Send jobs in background
	go func() {
		for j := 1; j <= 5; j++ {
			jobs <- Task{ID: j, Value: j * 10}
		}
		close(jobs)
	}()

	// Collect outputs
	for res := range results {
		fmt.Printf("Task %d completed: %d\\n", res.TaskID, res.Output)
	}
}
`,
    test_code: `func TestWorkerPool(t *testing.T) {
	// Verify all tasks processed without race or deadlock
}`,
    status: 'active',
    created_at: Date.now() - 1000 * 60 * 60 * 20,
  },
  {
    id: 'm-worker-pool-2',
    session_id: 'session-go-concurrency',
    title: 'Milestone 2: Cancellation with context.Context',
    prompt: 'Enhance your worker pool to support immediate cancellation when context.WithTimeout or context.WithCancel triggers.',
    starter_code: `package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

func workerWithCtx(ctx context.Context, id int, jobs <-chan int, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case <-ctx.Done():
			fmt.Printf("Worker %d canceled: %v\\n", id, ctx.Err())
			return
		case job, ok := <-jobs:
			if !ok {
				return
			}
			fmt.Printf("Worker %d executed job %d\\n", id, job)
		}
	}
}
`,
    status: 'pending',
    created_at: Date.now() - 1000 * 60 * 60 * 18,
  },
  {
    id: 'm-worker-pool-3',
    session_id: 'session-go-concurrency',
    title: 'Milestone 3: Prevent Goroutine Leaks & Race Conditions',
    prompt: 'Ensure all goroutines exit cleanly and verify that no channels remain open indefinitely using the Go race detector.',
    starter_code: `// Ensure no goroutines leak when downstream consumers terminate early.`,
    status: 'pending',
    created_at: Date.now() - 1000 * 60 * 60 * 16,
  },
];

export const SEED_SRS_CARDS: SRSCard[] = [
  {
    id: 'srs-go-chan-close',
    topic: 'Go Concurrency',
    prompt: 'What happens when you send to a closed Go channel vs. receive from a closed Go channel?',
    target_code: `// Sending to a closed channel causes a runtime panic!
// ch <- 1 // panic: send on closed channel

// Receiving from a closed channel never blocks:
// val, ok := <-ch
// Returns the zero-value of the type, and ok == false (if empty).`,
    difficulty: 4.8,
    stability: 2.1,
    reps: 2,
    lapses: 0,
    last_review: Date.now() - 1000 * 60 * 60 * 36,
    due_date: Date.now() - 1000 * 60 * 60 * 2, // Due now!
  },
  {
    id: 'srs-go-interface-nil',
    topic: 'Go Types',
    prompt: 'Why is `var _ MyInterface = (*MyStruct)(nil)` used as an idiom in production Go codebases?',
    target_code: `// Compile-time interface verification.
// If *MyStruct fails to implement any method of MyInterface,
// compilation fails with a clear type-check error before runtime.
var _ MyInterface = (*MyStruct)(nil)`,
    difficulty: 5.2,
    stability: 1.5,
    reps: 1,
    lapses: 0,
    last_review: Date.now() - 1000 * 60 * 60 * 24,
    due_date: Date.now() - 1000 * 60 * 60 * 1, // Due now!
  },
  {
    id: 'srs-rust-borrow-aliasing',
    topic: 'Rust Memory Model',
    prompt: 'What is the "Aliasing XOR Mutability" law in Rust? Can an active `&mut T` co-exist with a `&T`?',
    target_code: `// Law: You can have ANY number of immutable references (&T),
// OR exactly ONE mutable reference (&mut T), but NEVER BOTH at the same time.
// This statically guarantees data-race freedom at compile time.`,
    difficulty: 5.5,
    stability: 3.2,
    reps: 3,
    lapses: 0,
    last_review: Date.now() - 1000 * 60 * 60 * 72,
    due_date: Date.now() - 1000 * 60 * 60 * 5, // Due now!
  },
  {
    id: 'srs-go-defer-cancel',
    topic: 'Go Context',
    prompt: 'Why must `defer cancel()` be called immediately after `context.WithTimeout` or `context.WithCancel`?',
    target_code: `// Calling cancel releases the internal timer resources and goroutines 
// associated with the context. Failing to defer cancel() causes goroutine/memory leaks!
ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
defer cancel()`,
    difficulty: 4.0,
    stability: 5.0,
    reps: 4,
    lapses: 0,
    last_review: Date.now() - 1000 * 60 * 60 * 48,
    due_date: Date.now() + 1000 * 60 * 60 * 48, // Future due date
  },
];
