/**
 * LearnForge Starter Code & Kata Templates
 * Curated templates for Go, Python, and JavaScript/TypeScript katas.
 */

import { SupportedLanguage } from './types';

export interface KataTemplate {
  topic: string;
  language: SupportedLanguage;
  title: string;
  starterCode: string;
  testCode?: string;
  description: string;
}

export const STARTER_KATAS: KataTemplate[] = [
  // ================= Go Concurrency Katas =================
  {
    topic: 'worker-pool',
    language: 'go',
    title: 'Go Concurrency: Worker Pool Pattern',
    description: 'Implement a concurrent worker pool processing tasks via unbuffered channels with WaitGroup synchronization.',
    starterCode: `package main

import (
	"fmt"
	"sync"
)

// Task represents a unit of work
type Task struct {
	ID    int
	Value int
}

// Result represents the processed task result
type Result struct {
	TaskID int
	Output int
}

// worker processes tasks from jobs channel and sends to results channel
func worker(id int, jobs <-chan Task, results chan<- Result, wg *sync.WaitGroup) {
	defer wg.Done()
	for task := range jobs {
		// Process task: multiply value by 2
		results <- Result{TaskID: task.ID, Output: task.Value * 2}
	}
}

func main() {
	const numJobs = 6
	const numWorkers = 3

	jobs := make(chan Task, numJobs)
	results := make(chan Result, numJobs)
	var wg sync.WaitGroup

	// 1. Launch worker pool
	for w := 1; w <= numWorkers; w++ {
		wg.Add(1)
		go worker(w, jobs, results, &wg)
	}

	// 2. Submit jobs
	for j := 1; j <= numJobs; j++ {
		jobs <- Task{ID: j, Value: j * 10}
	}
	close(jobs)

	// 3. Wait for workers to finish and close results
	wg.Wait()
	close(results)

	// 4. Collect results
	for res := range results {
		fmt.Printf("Task %d completed with output: %d\\n", res.TaskID, res.Output)
	}
}
`,
    testCode: `func TestWorkerPool(t *testing.T) {
	jobs := make(chan Task, 3)
	results := make(chan Result, 3)
	var wg sync.WaitGroup

	wg.Add(1)
	go worker(1, jobs, results, &wg)

	jobs <- Task{ID: 10, Value: 5}
	close(jobs)
	wg.Wait()
	close(results)

	res := <-results
	if res.Output != 10 {
		t.Errorf("expected 10, got %d", res.Output)
	}
}`,
  },
  {
    topic: 'context-cancellation',
    language: 'go',
    title: 'Go Concurrency: Context Cancellation',
    description: 'Handle graceful shutdown and worker cancellation using context.Context.',
    starterCode: `package main

import (
	"context"
	"fmt"
	"time"
)

func worker(ctx context.Context, id int) {
	for {
		select {
		case <-ctx.Done():
			fmt.Printf("Worker %d received stop signal: %v\\n", id, ctx.Err())
			return
		default:
			// Simulating continuous work
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	fmt.Println("Starting workers...")
	for i := 1; i <= 2; i++ {
		go worker(ctx, i)
	}

	<-ctx.Done()
	fmt.Println("Main finished gracefully")
}
`,
  },
  {
    topic: 'mutex',
    language: 'go',
    title: 'Go Concurrency: Mutex Synchronization',
    description: 'Prevent data races on shared counters using sync.Mutex.',
    starterCode: `package main

import (
	"fmt"
	"sync"
)

type SafeCounter struct {
	mu    sync.Mutex
	value int
}

func (c *SafeCounter) Inc() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value++
}

func (c *SafeCounter) Value() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.value
}

func main() {
	counter := SafeCounter{}
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			counter.Inc()
		}()
	}

	wg.Wait()
	fmt.Printf("Final counter value: %d\\n", counter.Value())
}
`,
  },
  {
    topic: 'channels-select',
    language: 'go',
    title: 'Go Concurrency: Non-blocking Select',
    description: 'Coordinate multiple channels with select and timeout branches.',
    starterCode: `package main

import (
	"fmt"
	"time"
)

func main() {
	ch1 := make(chan string, 1)
	ch2 := make(chan string, 1)

	ch1 <- "Fast message from ch1"

	select {
	case msg1 := <-ch1:
		fmt.Printf("Received: %s\\n", msg1)
	case msg2 := <-ch2:
		fmt.Printf("Received: %s\\n", msg2)
	case <-time.After(100 * time.Millisecond):
		fmt.Println("Timeout reached")
	}
}
`,
  },

  // ================= Python Katas =================
  {
    topic: 'lru-cache',
    language: 'python',
    title: 'Python: LRU Cache Implementation',
    description: 'Implement a Least Recently Used (LRU) cache with O(1) get and put operations.',
    starterCode: `class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}
        self.order = []

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1
        # Move key to most recently used
        self.order.remove(key)
        self.order.append(key)
        return self.cache[key]

    def put(self, key: int, value: int) -> None:
        if key in self.cache:
            self.order.remove(key)
        elif len(self.cache) >= self.capacity:
            oldest = self.order.pop(0)
            del self.cache[oldest]
        self.cache[key] = value
        self.order.append(key)

# Demonstrate usage
cache = LRUCache(2)
cache.put(1, 100)
cache.put(2, 200)
print("Get 1:", cache.get(1))
cache.put(3, 300) # Evicts key 2
print("Get 2 (evicted):", cache.get(2))
print("Get 3:", cache.get(3))
`,
    testCode: `def test_main():
    c = LRUCache(2)
    c.put(1, 10)
    c.put(2, 20)
    assert c.get(1) == 10, "key 1 should return 10"
    c.put(3, 30)
    assert c.get(2) == -1, "key 2 should have been evicted"
    assert c.get(3) == 30, "key 3 should return 30"
    print("All LRUCache tests passed!")
`,
  },
  {
    topic: 'binary-search',
    language: 'python',
    title: 'Python: Binary Search',
    description: 'Classic logarithmic search over a sorted list.',
    starterCode: `def binary_search(arr, target):
    left = 0
    right = len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
            
    return -1

nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
target = 23
idx = binary_search(nums, target)
print(f"Target {target} found at index: {idx}")
`,
    testCode: `def test_main():
    arr = [1, 3, 5, 7, 9]
    assert binary_search(arr, 5) == 2, "binary_search(5) should return index 2"
    assert binary_search(arr, 1) == 0, "binary_search(1) should return index 0"
    assert binary_search(arr, 9) == 4, "binary_search(9) should return index 4"
    assert binary_search(arr, 10) == -1, "binary_search(10) should return -1"
`,
  },

  // ================= JavaScript / TypeScript Katas =================
  {
    topic: 'async-event-loop',
    language: 'typescript',
    title: 'TypeScript: Async Event Loop & Rate Limiter',
    description: 'Implement a token bucket or concurrency throttler limiting active async tasks.',
    starterCode: `interface Task<T> {
  (): Promise<T>;
}

class ConcurrencyLimiter {
  private activeCount: number = 0;
  private queue: Array<() => void> = [];

  constructor(private limit: number) {}

  async run<T>(task: Task<T>): Promise<T> {
    if (this.activeCount >= this.limit) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }

    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        next();
      }
    }
  }
}

// Example usage
const limiter = new ConcurrencyLimiter(2);
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
  console.log("Starting concurrency limiter tasks...");
  const tasks = [1, 2, 3, 4, 5].map(id =>
    limiter.run(async () => {
      console.log(\`Task \${id} started\`);
      await sleep(20);
      console.log(\`Task \${id} finished\`);
      return id * 10;
    })
  );

  const results = await Promise.all(tasks);
  console.log("All tasks completed:", results);
}

main();
`,
    testCode: `describe("ConcurrencyLimiter", () => {
  it("executes all tasks successfully", async () => {
    const lim = new ConcurrencyLimiter(2);
    const results = await Promise.all([
      lim.run(async () => 1),
      lim.run(async () => 2),
      lim.run(async () => 3)
    ]);
    expect(results).toEqual([1, 2, 3]);
  });
});
`,
  },
  {
    topic: 'reactive-signals',
    language: 'typescript',
    title: 'TypeScript: Fine-Grained Reactive Signals',
    description: 'Build a minimalist Signal and Effect reactivity system.',
    starterCode: `type Subscriber = () => void;
let activeEffect: Subscriber | null = null;

function createSignal<T>(initialValue: T): [() => T, (nextValue: T) => void] {
  let value = initialValue;
  const subscribers = new Set<Subscriber>();

  const read = (): T => {
    if (activeEffect) {
      subscribers.add(activeEffect);
    }
    return value;
  };

  const write = (nextValue: T): void => {
    value = nextValue;
    for (const sub of subscribers) {
      sub();
    }
  };

  return [read, write];
}

function createEffect(fn: () => void): void {
  const effectWrapper = () => {
    activeEffect = effectWrapper;
    try {
      fn();
    } finally {
      activeEffect = null;
    }
  };
  effectWrapper();
}

// Example usage
const [count, setCount] = createSignal(1);
createEffect(() => {
  console.log("Current count:", count());
});

setCount(2);
setCount(3);
`,
    testCode: `describe("Reactive Signals", () => {
  it("triggers subscriber on write", () => {
    const [val, setVal] = createSignal(10);
    let captured = 0;
    createEffect(() => {
      captured = val();
    });
    expect(captured).toBe(10);
    setVal(42);
    expect(captured).toBe(42);
  });
});
`,
  },
];

/**
 * Returns a starter code snippet for a given topic and language
 */
export function getStarterCode(topic: string, language: string): string {
  const lang = language.trim().toLowerCase();
  const top = topic.trim().toLowerCase();

  // Try exact match or partial match on topic and language
  const match = STARTER_KATAS.find(
    k =>
      (k.topic === top || k.topic.includes(top) || top.includes(k.topic)) &&
      (k.language === lang || (lang.startsWith('go') && k.language === 'go') || (lang.startsWith('py') && k.language === 'python') || (['ts', 'js', 'typescript', 'javascript'].includes(lang) && ['typescript', 'javascript'].includes(k.language)))
  );

  if (match) {
    return match.starterCode;
  }

  // Fallback by language
  if (lang === 'go' || lang === 'golang') {
    return `package main

import "fmt"

func main() {
	fmt.Println("Hello from LearnForge Go sandbox!")
}
`;
  }

  if (lang === 'python' || lang === 'py' || lang === 'python3') {
    return `def main():
    print("Hello from LearnForge Python sandbox!")

if __name__ == "__main__":
    main()
`;
  }

  if (lang === 'rust' || lang === 'rs') {
    return `fn main() {
    println!("Hello from LearnForge Rust sandbox!");
}
`;
  }

  if (lang === 'cpp' || lang === 'c++' || lang === 'cxx') {
    return `#include <iostream>

int main() {
    std::cout << "Hello from LearnForge C++ sandbox!" << std::endl;
    return 0;
}
`;
  }

  if (lang === 'c') {
    return `#include <stdio.h>

int main() {
    printf("Hello from LearnForge C sandbox!\\n");
    return 0;
}
`;
  }

  if (lang === 'java') {
    return `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from LearnForge Java sandbox!");
    }
}
`;
  }

  if (lang === 'csharp' || lang === 'cs' || lang === 'c#') {
    return `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello from LearnForge C# sandbox!");
    }
}
`;
  }

  if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
    return `#!/usr/bin/env bash
echo "Hello from LearnForge Bash sandbox!"
`;
  }

  if (lang === 'ruby' || lang === 'rb') {
    return `puts "Hello from LearnForge Ruby sandbox!"
`;
  }

  if (lang === 'php') {
    return `<?php
echo "Hello from LearnForge PHP sandbox!\\n";
`;
  }

  if (lang === 'swift') {
    return `print("Hello from LearnForge Swift sandbox!")
`;
  }

  if (lang === 'zig') {
    return `const std = @import("std");

pub fn main() void {
    std.debug.print("Hello from LearnForge Zig sandbox!\\n", .{});
}
`;
  }

  // Default TypeScript / JavaScript
  return `function main(): void {
  console.log("Hello from LearnForge TypeScript sandbox!");
}

main();
`;
}
