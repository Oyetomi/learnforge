/**
 * LearnForge Pre-Built Curriculum Tracks
 *
 * Authentic, production-grade starter tracks for systems programming:
 * 1. Go Concurrency & Worker Pools
 * 2. Rust Memory Ownership & Lifetimes
 * 3. Distributed Systems & Raft Consensus
 * 4. Python Asyncio Internals & Event Loops
 */

import type { CourseTrack, LearningSession, ChatMessage, Milestone } from './types';

export const TRACK_GO_CONCURRENCY: CourseTrack = {
  id: 'go-concurrency',
  title: 'Go Concurrency & Worker Pools',
  tagline: 'Master goroutines, channels, WaitGroups, context cancellation, and thread-safe worker pools.',
  language: 'go',
  difficulty: 'Intermediate',
  estimatedHours: 4,
  description:
    "Deep dive into Go's CSP concurrency model. Learn how channels synchronize goroutines under the hood, how to coordinate worker lifecycles with sync.WaitGroup and context.Context, how to architect high-throughput worker pools with fan-out/fan-in, and how to eliminate race conditions.",
  concepts: [
    'Buffered vs Unbuffered Channels',
    'Deadlock Prevention & Channel Ownership',
    'sync.WaitGroup & Goroutine Lifecycles',
    'Worker Pool Pattern (Fan-Out / Fan-In)',
    'context.Context Cancellation & Deadlines',
    'Race Detection & Mutex Synchronization',
  ],
  initialPrompt:
    "Welcome to **Go Concurrency & Worker Pools**! Go's concurrency model is based on CSP (Communicating Sequential Processes)—*don't communicate by sharing memory; share memory by communicating*. In this track, we'll build a production-grade worker pool step by step. Let's start with our first atomic mental model: **how unbuffered channels coordinate goroutines**.",
  milestones: [
    {
      id: 'go-m1-channels',
      title: 'Buffered vs Unbuffered Channels & Deadlock Prevention',
      concept: 'Unbuffered channel synchronization handoff and avoiding deadlock',
      prompt:
        'In Go, sending to an unbuffered channel blocks until another goroutine is ready to receive. The current starter code attempts to send and receive on an unbuffered channel within the same goroutine, causing a fatal deadlock. Fix the program by spawning a separate goroutine to produce the message, demonstrating clean synchronous handoff.',
      starter_code: `package main

import (
	"fmt"
)

// SendMessage sends a value into an unbuffered channel.
// Currently this causes a deadlock because there is no concurrent receiver.
// Fix this function so it sends the message from a concurrent goroutine.
func SendMessage(msg string) string {
	ch := make(chan string)

	// TODO: Spawn a goroutine to send msg into ch
	ch <- msg

	// Main goroutine receives the message
	received := <-ch
	return received
}

func main() {
	res := SendMessage("Hello LearnForge!")
	fmt.Println("Result:", res)
}
`,
      test_code: `package main

import (
	"testing"
	"time"
)

func TestSendMessage(t *testing.T) {
	done := make(chan string)

	go func() {
		done <- SendMessage("concurrency-ok")
	}()

	select {
	case res := <-done:
		if res != "concurrency-ok" {
			t.Fatalf("expected concurrency-ok, got %s", res)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Test timed out: deadlock detected in SendMessage")
	}
}
`,
      hints: [
        'An unbuffered channel requires both sender and receiver to be ready at the exact same moment.',
        'Use the `go` keyword to run the channel send operation in a separate goroutine: `go func() { ch <- msg }()`',
        'Think about channel ownership: who sends, and who receives?',
      ],
    },
    {
      id: 'go-m2-waitgroup',
      title: 'Coordinating Goroutines with sync.WaitGroup',
      concept: 'Deterministic multi-goroutine synchronization using sync.WaitGroup',
      prompt:
        'When spawning multiple workers, `main()` must wait for all of them to finish without relying on brittle `time.Sleep` calls. Coordinate 5 concurrent task workers using `sync.WaitGroup`. Ensure `wg.Add()` is called before launching the goroutine, and `defer wg.Done()` is invoked inside each worker.',
      starter_code: `package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

// ProcessAllTasks launches 'workerCount' goroutines to process items.
// Uses sync.WaitGroup to wait for all workers to finish.
func ProcessAllTasks(workerCount int) int32 {
	var counter int32
	var wg sync.WaitGroup

	// TODO: For each worker 0..workerCount:
	// 1. Call wg.Add(1) BEFORE starting goroutine
	// 2. Launch goroutine that calls defer wg.Done()
	// 3. Atomically increment counter by 1
	for i := 0; i < workerCount; i++ {
		// Spawn worker here...
		atomic.AddInt32(&counter, 1)
	}

	// TODO: Wait for all workers to complete
	// wg.Wait()

	return atomic.LoadInt32(&counter)
}

func main() {
	count := ProcessAllTasks(5)
	fmt.Printf("Completed %d tasks\\n", count)
}
`,
      test_code: `package main

import (
	"testing"
)

func TestProcessAllTasks(t *testing.T) {
	count := ProcessAllTasks(10)
	if count != 10 {
		t.Fatalf("expected 10 completed tasks, got %d", count)
	}
}
`,
      hints: [
        'Always call `wg.Add(1)` in the parent goroutine before `go func()`, never inside the goroutine.',
        'Use `defer wg.Done()` as the first statement in the worker goroutine to ensure it runs even if errors occur.',
        'Call `wg.Wait()` after the loop to block until the WaitGroup counter reaches zero.',
      ],
    },
    {
      id: 'go-m3-worker-pool',
      title: 'The Worker Pool Pattern (Fan-Out / Fan-In)',
      concept: 'Distributing jobs across fixed worker goroutines with channels',
      prompt:
        'Implement a classic worker pool. Spawn a fixed number of workers (e.g. 3) consuming from a shared `jobs` channel and writing computed results into a `results` channel. Ensure channels are closed cleanly and all jobs are processed.',
      starter_code: `package main

import (
	"fmt"
	"sync"
)

type Job struct {
	ID    int
	Value int
}

type Result struct {
	JobID  int
	Output int
}

// Worker processes jobs from jobsChan and writes results to resultsChan
func Worker(id int, jobs <-chan Job, results chan<- Result, wg *sync.WaitGroup) {
	defer wg.Done()
	// TODO: Range over jobs until channel is closed
	for job := range jobs {
		// Process job: double the value
		results <- Result{
			JobID:  job.ID,
			Output: job.Value * 2,
		}
	}
}

// RunWorkerPool executes 'jobs' across 'numWorkers' and returns all results
func RunWorkerPool(numWorkers int, jobs []Job) []Result {
	jobsChan := make(chan Job, len(jobs))
	resultsChan := make(chan Result, len(jobs))
	var wg sync.WaitGroup

	// TODO:
	// 1. Spawn numWorkers worker goroutines with wg
	// 2. Send all jobs into jobsChan and close jobsChan
	// 3. Wait for workers in a separate goroutine, then close resultsChan
	// 4. Collect all results from resultsChan into a slice and return

	for w := 1; w <= numWorkers; w++ {
		wg.Add(1)
		go Worker(w, jobsChan, resultsChan, &wg)
	}

	for _, job := range jobs {
		jobsChan <- job
	}
	close(jobsChan)

	// Close resultsChan when workers are done
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	var results []Result
	for res := range resultsChan {
		results = append(results, res)
	}

	return results
}

func main() {
	jobs := []Job{{ID: 1, Value: 10}, {ID: 2, Value: 20}, {ID: 3, Value: 30}}
	results := RunWorkerPool(2, jobs)
	fmt.Printf("Processed %d results\\n", len(results))
}
`,
      test_code: `package main

import (
	"testing"
)

func TestWorkerPool(t *testing.T) {
	jobs := []Job{
		{ID: 1, Value: 5},
		{ID: 2, Value: 10},
		{ID: 3, Value: 15},
		{ID: 4, Value: 20},
	}

	results := RunWorkerPool(3, jobs)
	if len(results) != 4 {
		t.Fatalf("expected 4 results, got %d", len(results))
	}

	// Verify all job outputs are doubled
	m := make(map[int]int)
	for _, r := range results {
		m[r.JobID] = r.Output
	}

	expected := map[int]int{1: 10, 2: 20, 3: 30, 4: 40}
	for id, exp := range expected {
		if m[id] != exp {
			t.Fatalf("job %d: expected %d, got %d", id, exp, m[id])
		}
	}
}
`,
      hints: [
        'Notice directional channels: `<-chan Job` is receive-only, `chan<- Result` is send-only.',
        'Range over a channel (`for job := range jobs`) automatically exits when the channel is closed!',
        'Always close `jobsChan` after enqueuing all jobs so workers know no more work is coming.',
      ],
    },
    {
      id: 'go-m4-context-cancellation',
      title: 'Graceful Shutdown with context.Context',
      concept: 'Propagating cancellation signals and preventing goroutine leaks',
      prompt:
        'In production, tasks must be cancellable when HTTP requests terminate or timeouts expire. Use `context.Context` and `select` inside the worker to listen on `ctx.Done()`. If cancelled, the worker must exit immediately without leaking.',
      starter_code: `package main

import (
	"context"
	"fmt"
	"time"
)

// CancellableWorker listens for jobs or cancellation signal.
// Returns true if completed, false if aborted due to context cancellation.
func CancellableWorker(ctx context.Context, jobID int) bool {
	// TODO: Use select to either:
	// 1. Detect ctx.Done() and return false immediately
	// 2. Simulate work (e.g. time.Sleep) and return true
	select {
	case <-ctx.Done():
		return false
	case <-time.After(50 * time.Millisecond):
		return true
	}
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	success := CancellableWorker(ctx, 1)
	fmt.Println("Worker completed:", success)
}
`,
      test_code: `package main

import (
	"context"
	"testing"
	"time"
)

func TestCancellableWorker_Timeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()

	if CancellableWorker(ctx, 1) {
		t.Fatal("expected worker to be cancelled, but it reported completion")
	}
}

func TestCancellableWorker_Success(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	if !CancellableWorker(ctx, 2) {
		t.Fatal("expected worker to complete successfully")
	}
}
`,
      hints: [
        '`ctx.Done()` returns a channel that is closed when the context is cancelled or times out.',
        'Reading from a closed channel returns immediately with zero value, triggering the select case.',
        'Never ignore `ctx.Done()` in long-running or blocking loops.',
      ],
    },
    {
      id: 'go-m5-race-conditions',
      title: 'Detecting & Eliminating Data Races',
      concept: 'Thread-safety with sync.Mutex and sync/atomic',
      prompt:
        'Multiple goroutines writing to a shared struct without synchronization triggers a data race. Protect the shared `SafeCounter` using `sync.Mutex` (or `sync.RWMutex`) so concurrent calls to `Inc()` and `Value()` are completely safe under the Go race detector.',
      starter_code: `package main

import (
	"fmt"
	"sync"
)

// SafeCounter tracks counts safely across concurrent goroutines
type SafeCounter struct {
	// TODO: Add sync.Mutex field
	mu    sync.Mutex
	value int
}

func (c *SafeCounter) Inc() {
	// TODO: Lock before modifying value, unlock via defer
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value++
}

func (c *SafeCounter) Value() int {
	// TODO: Lock before reading value, unlock via defer
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.value
}

func main() {
	counter := &SafeCounter{}
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			counter.Inc()
		}()
	}

	wg.Wait()
	fmt.Println("Final count:", counter.Value())
}
`,
      test_code: `package main

import (
	"sync"
	"testing"
)

func TestSafeCounter_Concurrent(t *testing.T) {
	c := &SafeCounter{}
	var wg sync.WaitGroup
	const iterations = 100

	for i := 0; i < iterations; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.Inc()
		}()
	}

	wg.Wait()

	if c.Value() != iterations {
		t.Fatalf("expected %d, got %d", iterations, c.Value())
	}
}
`,
      hints: [
        'A data race occurs when 2+ goroutines access the same memory location concurrently and at least one is a write.',
        'Embed or declare `mu sync.Mutex` in your struct.',
        '`defer c.mu.Unlock()` guarantees the lock is released even if a panic occurs.',
      ],
    },
  ],
};

export const TRACK_RUST_OWNERSHIP: CourseTrack = {
  id: 'rust-ownership',
  title: 'Rust Memory Ownership & Lifetimes',
  tagline: 'Conquer the borrow checker, move semantics, explicit lifetimes, and interior mutability.',
  language: 'rust',
  difficulty: 'Intermediate',
  estimatedHours: 5,
  description:
    'The foundational mental model shift for systems programming. Understand affine type systems, stack vs heap allocation, move vs copy semantics, reference exclusivity (aliasing XOR mutability), explicit lifetime parameters, and runtime borrow checking with Rc and RefCell.',
  concepts: [
    'Move Semantics & Affine Types',
    'Stack vs Heap Allocation',
    'The Aliasing XOR Mutability Invariant',
    'Explicit Lifetime Annotations (\'a)',
    'Struct Lifetimes & Lifetime Elision',
    'Interior Mutability with RefCell<T>',
    'Shared Ownership with Rc<T> and Arc<T>',
  ],
  initialPrompt:
    "Welcome to **Rust Memory Ownership & Lifetimes**! In languages like C, manual memory management leads to use-after-free and double-free bugs. In Go or Python, a garbage collector pauses execution. Rust achieves memory safety *at compile time with zero runtime overhead* through **Ownership**. Let's examine the first pillar: **Move Semantics vs. Borrowing**.",
  milestones: [
    {
      id: 'rust-m1-move-semantics',
      title: 'Move Semantics vs Borrowing',
      concept: 'Single-owner invariant and borrowing string slices (&str)',
      prompt:
        'In Rust, assigning or passing a heap-allocated type (like `String`) transfers ownership (a "move"), invalidating the original variable. Refactor `calculate_length` to borrow a string slice `&str` instead of taking ownership of `String`, so the caller can continue using `greeting` afterward.',
      starter_code: `// Fix calculate_length to take a borrowed reference (&str) instead of moving String
fn calculate_length(s: &str) -> usize {
    s.len()
}

fn main() {
    let greeting = String::from("Hello LearnForge");

    // Borrow greeting instead of transferring ownership
    let len = calculate_length(&greeting);

    // We can still use greeting here because it was borrowed, not moved!
    println!("'{}' has length {}", greeting, len);
}
`,
      test_code: `#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_length() {
        let msg = String::from("systems-mastery");
        let len = calculate_length(&msg);
        assert_eq!(len, 15);
        // Assert msg is still valid and accessible
        assert_eq!(msg.as_str(), "systems-mastery");
    }
}
`,
      hints: [
        'Types that do NOT implement the `Copy` trait (like `String` or `Vec<T>`) move on assignment or function calls.',
        'Use `&str` as the parameter type to borrow any string reference without taking ownership.',
        'Pass `&greeting` at the callsite.',
      ],
    },
    {
      id: 'rust-m2-aliasing-xor-mutability',
      title: 'The Golden Rule: Aliasing XOR Mutability',
      concept: 'You may have any number of immutable references (&T) OR exactly one mutable reference (&mut T), never both simultaneously',
      prompt:
        'The Rust borrow checker enforces: at any given time, you can have either one mutable reference or any number of immutable references, but not both. Refactor the code below so the mutation to `data` does not overlap with an active immutable reference.',
      starter_code: `fn update_and_read(data: &mut Vec<i32>, value: i32) -> i32 {
    // TODO: Fix the borrow order so that we append to 'data'
    // and then read the first element without conflicting borrows.
    data.push(value);
    let first = data[0];
    first
}

fn main() {
    let mut numbers = vec![10, 20];
    let first = update_and_read(&mut numbers, 30);
    println!("First element is: {}", first);
}
`,
      test_code: `#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_and_read() {
        let mut v = vec![1, 2];
        let first = update_and_read(&mut v, 3);
        assert_eq!(first, 1);
        assert_eq!(v, vec![1, 2, 3]);
    }
}
`,
      hints: [
        'Pushing to a `Vec` can reallocate memory on the heap, which would invalidate any existing pointers to its elements.',
        'That is why the compiler rejects holding a reference `&data[0]` while calling `data.push()`.',
        'Perform the mutation first, or copy/clone primitive values before mutating.',
      ],
    },
    {
      id: 'rust-m3-explicit-lifetimes',
      title: "Explicit Lifetime Annotations ('a)",
      concept: "Connecting input reference lifetimes to output reference lifetimes",
      prompt:
        "When a function returns a reference, Rust's borrow checker needs to know whether the returned reference is tied to input `x` or input `y`. Add explicit lifetime parameter `'a` to `longest` so the compiler knows the returned reference lives as long as the shorter of the two input references.",
      starter_code: `// TODO: Add generic lifetime parameter 'a to function signature:
// fn longest<'a>(x: &'a str, y: &'a str) -> &'a str
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}

fn main() {
    let string1 = String::from("short");
    let string2 = String::from("longer string");

    let result = longest(string1.as_str(), string2.as_str());
    println!("Longest is: {}", result);
}
`,
      test_code: `#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_longest() {
        let s1 = "alpha";
        let s2 = "beta-omega";
        let res = longest(s1, s2);
        assert_eq!(res, "beta-omega");

        let res2 = longest("longest-string", "tiny");
        assert_eq!(res2, "longest-string");
    }
}
`,
      hints: [
        "Lifetime annotations don't change how long any reference lives; they describe relationships between lifetimes for the compiler.",
        "`fn longest<'a>(x: &'a str, y: &'a str) -> &'a str` means the returned reference is valid as long as both `x` and `y` remain valid.",
      ],
    },
    {
      id: 'rust-m4-interior-mutability',
      title: 'Interior Mutability with RefCell<T> and Rc<T>',
      concept: 'Bypassing compile-time borrow rules safely at runtime using RefCell',
      prompt:
        'Sometimes multiple components must share ownership of a data structure and mutate it (e.g. graph nodes, observer patterns). Use `Rc<RefCell<T>>` to allow shared ownership and safe interior mutability.',
      starter_code: `use std::rc::Rc;
use std::cell::RefCell;

#[derive(Debug)]
pub struct Node {
    pub value: i32,
    pub next: Option<Rc<RefCell<Node>>>,
}

impl Node {
    pub fn new(val: i32) -> Rc<RefCell<Self>> {
        Rc::new(RefCell::new(Node {
            value: val,
            next: None,
        }))
    }

    // Mutates the node value through interior mutability
    pub fn increment_value(node: &Rc<RefCell<Node>>) {
        // TODO: Borrow mutably from RefCell and increment value
        let mut borrowed = node.borrow_mut();
        borrowed.value += 1;
    }
}

fn main() {
    let node = Node::new(42);
    Node::increment_value(&node);
    println!("Node value: {}", node.borrow().value);
}
`,
      test_code: `#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_interior_mutability() {
        let node = Node::new(100);
        let alias = Rc::clone(&node);

        Node::increment_value(&alias);
        assert_eq!(node.borrow().value, 101);

        Node::increment_value(&node);
        assert_eq!(alias.borrow().value, 102);
    }
}
`,
      hints: [
        '`Rc<T>` enables multiple owners (reference counted pointer).',
        '`RefCell<T>` enforces the borrow rules at *runtime* instead of compile-time via `.borrow()` and `.borrow_mut()`.',
        'Be careful: violating borrow rules at runtime with `RefCell` causes a thread panic instead of a compiler error.',
      ],
    },
  ],
};

export const TRACK_DISTRIBUTED_RAFT: CourseTrack = {
  id: 'distributed-systems-raft',
  title: 'Distributed Systems & Raft Consensus',
  tagline: 'Construct state machine replication, leader election, and log consistency from first principles.',
  language: 'go',
  difficulty: 'Advanced',
  estimatedHours: 6,
  description:
    'Bridge theoretical consensus and production implementation by building core components of the Raft algorithm (Ongaro & Ousterhout). Learn randomized election timeouts, split-brain prevention, quorum calculations, heartbeat broadcasting, and log matching invariants.',
  concepts: [
    'Consensus & State Machine Replication',
    'Follower, Candidate, and Leader States',
    'Randomized Election Timeouts (150ms-300ms)',
    'RequestVote RPC & Quorum Majority Logic',
    'AppendEntries Heartbeat Mechanism',
    'Log Matching Invariant & Commit Index',
  ],
  initialPrompt:
    "Welcome to **Distributed Systems & Raft Consensus**! Distributed consensus is the backbone of etcd, Kubernetes, CockroachDB, and Kafka metadata. Raft breaks consensus into three independent subproblems: **Leader Election**, **Log Replication**, and **Safety**. Let's start by implementing **Randomized Election Timeouts** to elect a stable leader without split votes.",
  milestones: [
    {
      id: 'raft-m1-election-timer',
      title: 'Randomized Election Timeouts & State Transitions',
      concept: 'Follower-to-Candidate transition with randomized jitter to prevent split votes',
      prompt:
        'In Raft, every node starts in the Follower state. If a follower does not receive a heartbeat before its election timeout expires, it transitions to Candidate, increments its term, and votes for itself. Implement `HandleElectionTimeout` to perform this transition.',
      starter_code: `package main

import (
	"fmt"
	"sync"
)

type NodeRole string

const (
	RoleFollower  NodeRole = "Follower"
	RoleCandidate NodeRole = "Candidate"
	RoleLeader    NodeRole = "Leader"
)

type RaftNode struct {
	mu          sync.Mutex
	id          int
	currentTerm int
	votedFor    int
	role        NodeRole
}

func NewRaftNode(id int) *RaftNode {
	return &RaftNode{
		id:          id,
		currentTerm: 0,
		votedFor:    -1, // -1 means voted for nobody in this term
		role:        RoleFollower,
	}
}

// HandleElectionTimeout triggers when election timer fires without a heartbeat.
// Must transition to Candidate, increment currentTerm by 1, and vote for self.
func (n *RaftNode) HandleElectionTimeout() {
	n.mu.Lock()
	defer n.mu.Unlock()

	// TODO:
	// 1. Transition role to RoleCandidate
	// 2. Increment n.currentTerm by 1
	// 3. Set n.votedFor to n.id
	n.role = RoleCandidate
	n.currentTerm++
	n.votedFor = n.id
}

func main() {
	node := NewRaftNode(1)
	node.HandleElectionTimeout()
	fmt.Printf("Node %d is now %s in term %d\\n", node.id, node.role, node.currentTerm)
}
`,
      test_code: `package main

import (
	"testing"
)

func TestHandleElectionTimeout(t *testing.T) {
	node := NewRaftNode(3)
	if node.role != RoleFollower || node.currentTerm != 0 || node.votedFor != -1 {
		t.Fatal("initial state incorrect")
	}

	node.HandleElectionTimeout()

	if node.role != RoleCandidate {
		t.Fatalf("expected RoleCandidate, got %s", node.role)
	}
	if node.currentTerm != 1 {
		t.Fatalf("expected term 1, got %d", node.currentTerm)
	}
	if node.votedFor != 3 {
		t.Fatalf("expected votedFor 3, got %d", node.votedFor)
	}
}
`,
      hints: [
        'A node transitions to Candidate upon election timeout.',
        'Terms act as a logical clock in Raft: whenever an election starts, the term is incremented.',
        'Voting for oneself is the first vote the candidate acquires toward its quorum.',
      ],
    },
    {
      id: 'raft-m2-request-vote',
      title: 'RequestVote RPC & Quorum Majority Logic',
      concept: 'Term validation, single-vote per term invariant, and strict majority (N/2 + 1)',
      prompt:
        'When a candidate requests votes via `RequestVote`, followers must decide whether to grant their vote. A vote is granted IF the candidate term >= follower term AND the follower has either not voted or already voted for this candidate in this term. If granted, update `votedFor`.',
      starter_code: `package main

import (
	"fmt"
	"sync"
)

type RequestVoteArgs struct {
	Term        int
	CandidateID int
}

type RequestVoteReply struct {
	Term        int
	VoteGranted bool
}

type RaftPeer struct {
	mu          sync.Mutex
	id          int
	currentTerm int
	votedFor    int
}

// RequestVote handles vote requests from candidates
func (n *RaftPeer) RequestVote(args RequestVoteArgs, reply *RequestVoteReply) {
	n.mu.Lock()
	defer n.mu.Unlock()

	// If candidate's term is older than our term, reject immediately
	if args.Term < n.currentTerm {
		reply.Term = n.currentTerm
		reply.VoteGranted = false
		return
	}

	// If candidate's term is newer, update our term and reset votedFor
	if args.Term > n.currentTerm {
		n.currentTerm = args.Term
		n.votedFor = -1
	}

	reply.Term = n.currentTerm

	// TODO: Grant vote if n.votedFor == -1 or n.votedFor == args.CandidateID
	if n.votedFor == -1 || n.votedFor == args.CandidateID {
		n.votedFor = args.CandidateID
		reply.VoteGranted = true
	} else {
		reply.VoteGranted = false
	}
}

func main() {
	peer := &RaftPeer{id: 2, currentTerm: 1, votedFor: -1}
	var reply RequestVoteReply
	peer.RequestVote(RequestVoteArgs{Term: 2, CandidateID: 1}, &reply)
	fmt.Printf("Vote granted: %v (Term: %d)\\n", reply.VoteGranted, reply.Term)
}
`,
      test_code: `package main

import (
	"testing"
)

func TestRequestVote_TermRejection(t *testing.T) {
	peer := &RaftPeer{id: 2, currentTerm: 3, votedFor: -1}
	var reply RequestVoteReply
	peer.RequestVote(RequestVoteArgs{Term: 2, CandidateID: 1}, &reply)

	if reply.VoteGranted {
		t.Fatal("expected vote to be rejected for stale term")
	}
}

func TestRequestVote_SingleVoteRule(t *testing.T) {
	peer := &RaftPeer{id: 2, currentTerm: 2, votedFor: 1}
	var reply RequestVoteReply

	// Candidate 3 asks for vote in same term 2, should be denied
	peer.RequestVote(RequestVoteArgs{Term: 2, CandidateID: 3}, &reply)
	if reply.VoteGranted {
		t.Fatal("node granted two votes in the same term!")
	}

	// Candidate 1 asks again in same term 2, should be allowed
	peer.RequestVote(RequestVoteArgs{Term: 2, CandidateID: 1}, &reply)
	if !reply.VoteGranted {
		t.Fatal("expected candidate 1 to keep its granted vote")
	}
}
`,
      hints: [
        'Raft guarantees that at most one leader can be elected in a given term (Election Safety).',
        'This invariant holds because each node votes for at most one candidate per term.',
        'Quorum requires strictly more than half of the cluster: `votes > totalNodes / 2`.',
      ],
    },
    {
      id: 'raft-m3-heartbeats',
      title: 'AppendEntries Heartbeats & Follower Liveness',
      concept: 'Maintaining leader authority and resetting election timers via heartbeats',
      prompt:
        'Once elected, the Leader sends empty `AppendEntries` RPCs to all peers. When a follower receives a valid heartbeat (`args.Term >= n.currentTerm`), it resets its election timer and remains in Follower state. Implement `AppendEntries`.',
      starter_code: `package main

import (
	"fmt"
	"sync"
)

type AppendEntriesArgs struct {
	Term     int
	LeaderID int
}

type AppendEntriesReply struct {
	Term    int
	Success bool
}

type FollowerNode struct {
	mu           sync.Mutex
	id           int
	currentTerm  int
	heartbeatRcv bool
}

// AppendEntries receives heartbeats from the leader
func (n *FollowerNode) AppendEntries(args AppendEntriesArgs, reply *AppendEntriesReply) {
	n.mu.Lock()
	defer n.mu.Unlock()

	// TODO:
	// 1. If args.Term < n.currentTerm, return Success = false
	// 2. If args.Term > n.currentTerm, update n.currentTerm
	// 3. Mark n.heartbeatRcv = true and return Success = true
	if args.Term < n.currentTerm {
		reply.Term = n.currentTerm
		reply.Success = false
		return
	}

	if args.Term > n.currentTerm {
		n.currentTerm = args.Term
	}

	n.heartbeatRcv = true
	reply.Term = n.currentTerm
	reply.Success = true
}

func main() {
	node := &FollowerNode{id: 1, currentTerm: 1}
	var reply AppendEntriesReply
	node.AppendEntries(AppendEntriesArgs{Term: 1, LeaderID: 3}, &reply)
	fmt.Printf("AppendEntries success: %v\\n", reply.Success)
}
`,
      test_code: `package main

import (
	"testing"
)

func TestAppendEntries(t *testing.T) {
	node := &FollowerNode{id: 1, currentTerm: 2}
	var reply AppendEntriesReply

	// Stale leader
	node.AppendEntries(AppendEntriesArgs{Term: 1, LeaderID: 2}, &reply)
	if reply.Success {
		t.Fatal("follower accepted stale heartbeat")
	}

	// Valid leader
	node.AppendEntries(AppendEntriesArgs{Term: 2, LeaderID: 3}, &reply)
	if !reply.Success || !node.heartbeatRcv {
		t.Fatal("follower failed to process valid heartbeat")
	}
}
`,
      hints: [
        'Heartbeats prevent followers from timing out and starting spurious elections.',
        'If a heartbeat arrives with a higher term, the receiving node must update its own term to match.',
      ],
    },
    {
      id: 'raft-m4-log-replication',
      title: 'Log Replication & Advancing CommitIndex',
      concept: 'Replicating entries to majority and advancing commitIndex safely',
      prompt:
        'When the leader receives a command, it appends it to its log and replicates it to followers. Once a majority has stored the entry, the leader advances its `commitIndex`. Implement `CalculateNewCommitIndex`.',
      starter_code: `package main

import (
	"fmt"
	"sort"
)

// CalculateNewCommitIndex calculates the new commitIndex for a cluster of N nodes.
// matchIndex[i] is the highest log index known to be replicated on server i.
// The leader should advance commitIndex to the median matchIndex where a majority has replicated.
func CalculateNewCommitIndex(matchIndex []int, currentCommit int) int {
	// TODO:
	// 1. Sort matchIndex in ascending order
	// 2. The median element represents the index replicated on at least majority of nodes
	// 3. Return the maximum of currentCommit and that median index
	sorted := make([]int, len(matchIndex))
	copy(sorted, matchIndex)
	sort.Ints(sorted)

	// In a cluster of size N, majority threshold index in 0-indexed sorted array is N/2
	// For N=3: [1, 2, 2] -> index 3/2 = 1 -> value 2
	// For N=5: [0, 1, 2, 3, 3] -> index 5/2 = 2 -> value 2
	median := sorted[len(sorted)/2]
	if median > currentCommit {
		return median
	}
	return currentCommit
}

func main() {
	// 5 nodes with replicated indexes: node 0 is leader (idx 4), others at 4, 4, 2, 1
	matches := []int{4, 4, 4, 2, 1}
	commit := CalculateNewCommitIndex(matches, 0)
	fmt.Println("New Commit Index:", commit)
}
`,
      test_code: `package main

import (
	"testing"
)

func TestCalculateNewCommitIndex(t *testing.T) {
	// Cluster of 3 nodes: majority is 2
	matches3 := []int{5, 5, 2}
	if c := CalculateNewCommitIndex(matches3, 2); c != 5 {
		t.Fatalf("expected commit index 5, got %d", c)
	}

	// Cluster of 5 nodes: majority is 3
	matches5 := []int{10, 10, 8, 4, 2}
	if c := CalculateNewCommitIndex(matches5, 3); c != 8 {
		t.Fatalf("expected commit index 8, got %d", c)
	}
}
`,
      hints: [
        'An entry is safely committed once it is stored on a majority of nodes.',
        'Sorting the `matchIndex` array allows easy identification of the majority replication point.',
        'The commitIndex never moves backward!',
      ],
    },
  ],
};

export const TRACK_PYTHON_ASYNCIO: CourseTrack = {
  id: 'python-asyncio-internals',
  title: 'Python Asyncio Internals & Event Loops',
  tagline: 'Understand generators, coroutines, event loops, tasks, and concurrent pipelines from first principles.',
  language: 'python',
  difficulty: 'Intermediate',
  estimatedHours: 4,
  description:
    'Unravel how Python asynchronous I/O really works under the hood. Move beyond basic async/await syntax to construct generator-based coroutine trampolines, understand the OS event loop tick, orchestrate concurrent tasks with TaskGroup, manage backpressure with queues, and handle cancellation gracefully.',
  concepts: [
    'Generator Trampolines & Cooperative Multitasking',
    'Coroutines, Futures, and Tasks',
    'Event Loop Tick Phases & Selectors',
    'Structured Concurrency with TaskGroup',
    'Asyncio Queues & Backpressure Pipelines',
    'Task Cancellation & Exception Shielding',
  ],
  initialPrompt:
    "Welcome to **Python Asyncio Internals**! In Python, asynchronous programming is not multithreading—it's single-threaded cooperative multitasking coordinated by an **Event Loop**. To truly master `async/await`, we will peel back the abstraction layers and build an event loop from first principles starting with **Generator Trampolines**.",
  milestones: [
    {
      id: 'py-m1-generator-trampoline',
      title: 'From Generators to Coroutines: Building a Mini Event Loop',
      concept: 'Cooperative task scheduling using yield and generator .send()',
      prompt:
        'Before native async/await, Python coroutines were built with generators. When a generator executes `yield`, it pauses its frame and yields control back to the caller. Implement a minimal `EventLoop` with a `deque` task queue that steps each generator until all tasks complete.',
      starter_code: `from collections import deque
from typing import Generator, List, Any

class MiniEventLoop:
    def __init__(self):
        self.task_queue: deque[Generator] = deque()

    def add_task(self, task: Generator):
        """Enqueue a new generator task to run."""
        self.task_queue.append(task)

    def run_until_complete(self):
        """
        Step each generator in the task_queue by calling next() on it.
        If the generator yields, re-enqueue it.
        If it raises StopIteration, the task has finished.
        """
        # TODO: Implement loop stepping through task_queue
        while self.task_queue:
            task = self.task_queue.popleft()
            try:
                # Step the generator
                next(task)
                # Task yielded, re-enqueue for next tick
                self.task_queue.append(task)
            except StopIteration:
                # Task finished
                pass

def task_a(log: List[str]):
    log.append("A1")
    yield
    log.append("A2")
    yield
    log.append("A3")

def task_b(log: List[str]):
    log.append("B1")
    yield
    log.append("B2")

if __name__ == "__main__":
    loop = MiniEventLoop()
    execution_log = []
    loop.add_task(task_a(execution_log))
    loop.add_task(task_b(execution_log))
    loop.run_until_complete()
    print("Execution trace:", execution_log)
`,
      test_code: `import unittest

class TestMiniEventLoop(unittest.TestCase):
    def test_interleaved_execution(self):
        loop = MiniEventLoop()
        log = []
        loop.add_task(task_a(log))
        loop.add_task(task_b(log))
        loop.run_until_complete()

        # Tasks should interleave cooperatively: A1, B1, A2, B2, A3
        expected = ["A1", "B1", "A2", "B2", "A3"]
        self.assertEqual(log, expected)

if __name__ == '__main__':
    unittest.main()
`,
      hints: [
        '`next(task)` advances the generator to its next `yield` expression.',
        'When a generator returns, Python raises `StopIteration`.',
        'Re-enqueueing after `yield` gives other tasks in the queue a chance to execute—this is cooperative multitasking!',
      ],
    },
    {
      id: 'py-m2-tasks-futures',
      title: 'Asyncio Tasks & Concurrent Execution',
      concept: 'Scheduling coroutines concurrently with asyncio.gather',
      prompt:
        'Calling `await coroutine()` sequentially runs tasks in series: total time is $O(\\sum t)$. To run them concurrently in $O(\\max t)$ wall-clock time, wrap them in tasks using `asyncio.gather()`. Fix `fetch_all_metrics` to fetch concurrently.',
      starter_code: `import asyncio
from typing import List, Dict

async def fetch_metric(service_name: str, delay_sec: float) -> Dict[str, float]:
    await asyncio.sleep(delay_sec)
    return {"service": service_name, "latency": delay_sec}

async def fetch_all_metrics() -> List[Dict[str, float]]:
    # TODO: Run all three fetches concurrently using asyncio.gather()
    # Currently running sequentially:
    # res1 = await fetch_metric("auth", 0.05)
    # res2 = await fetch_metric("db", 0.05)
    # res3 = await fetch_metric("cache", 0.05)
    results = await asyncio.gather(
        fetch_metric("auth", 0.05),
        fetch_metric("db", 0.05),
        fetch_metric("cache", 0.05),
    )
    return list(results)

if __name__ == "__main__":
    res = asyncio.run(fetch_all_metrics())
    print("Fetched metrics:", res)
`,
      test_code: `import asyncio
import time
import unittest

class TestAsyncMetrics(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_timing(self):
        start = time.perf_counter()
        results = await fetch_all_metrics()
        elapsed = time.perf_counter() - start

        self.assertEqual(len(results), 3)
        # Should complete in roughly 0.05s, definitely under 0.12s (sequential would be 0.15s)
        self.assertLess(elapsed, 0.12, "Tasks did not run concurrently!")

if __name__ == '__main__':
    unittest.main()
`,
      hints: [
        '`asyncio.gather(*aws)` takes multiple awaitables and schedules them all on the event loop concurrently.',
        'It returns a future aggregating all results in the order passed.',
        'Wall-clock time of concurrent tasks equals the slowest task, not their sum.',
      ],
    },
    {
      id: 'py-m3-queues-pipelines',
      title: 'Producer-Consumer Pipelines with asyncio.Queue',
      concept: 'Bounded queues, backpressure, and graceful pipeline drainage',
      prompt:
        'When producers generate work faster than consumers can process it, memory explodes unless backpressure is applied. Use `asyncio.Queue(maxsize=5)` with `queue.put()` and `queue.get()`. Make sure consumers call `queue.task_done()` so `queue.join()` unblocks when all work is finished.',
      starter_code: `import asyncio
from typing import List

async def consumer(queue: asyncio.Queue, processed: List[int]):
    while True:
        item = await queue.get()
        # Process item
        processed.append(item * 10)
        # TODO: Notify queue that this task is done
        queue.task_done()

async def run_pipeline(items: List[int]) -> List[int]:
    queue = asyncio.Queue(maxsize=5)
    processed = []

    # Spawn 2 consumer tasks
    workers = [
        asyncio.create_task(consumer(queue, processed)),
        asyncio.create_task(consumer(queue, processed)),
    ]

    # Produce all items into queue
    for item in items:
        await queue.put(item)

    # TODO: Wait until all items in the queue have been fully processed
    await queue.join()

    # Cancel background workers
    for w in workers:
        w.cancel()

    return processed

if __name__ == "__main__":
    res = asyncio.run(run_pipeline([1, 2, 3, 4]))
    print("Processed:", res)
`,
      test_code: `import asyncio
import unittest

class TestQueuePipeline(unittest.IsolatedAsyncioTestCase):
    async def test_pipeline_drain(self):
        items = list(range(1, 11))
        results = await run_pipeline(items)

        self.assertEqual(len(results), 10)
        self.assertEqual(sorted(results), [x * 10 for x in items])

if __name__ == '__main__':
    unittest.main()
`,
      hints: [
        '`queue.put()` will automatically await if the queue is full, preventing memory exhaustion (backpressure).',
        'Every `queue.get()` must be paired with `queue.task_done()` once processing finishes.',
        '`queue.join()` blocks until the count of unfinished tasks drops to zero.',
      ],
    },
    {
      id: 'py-m4-cancellation-shielding',
      title: 'Task Cancellation & Exception Shielding',
      concept: 'Handling CancelledError cleanly and shielding critical I/O operations',
      prompt:
        'When an asyncio task is cancelled via `task.cancel()`, `asyncio.CancelledError` is raised at the current `await` point. To prevent corrupting state, critical operations should be wrapped with `asyncio.shield()`, and resource cleanup should be placed in `finally`.',
      starter_code: `import asyncio

async def critical_audit_log(event: str, audit_records: list):
    """Critical operation that must not be interrupted mid-flight."""
    await asyncio.sleep(0.02)
    audit_records.append(f"LOG: {event}")

async def resilient_worker(job_name: str, audit_records: list) -> bool:
    try:
        await asyncio.sleep(0.01)
        # TODO: Shield the critical audit log from cancellation
        await asyncio.shield(critical_audit_log(job_name, audit_records))
        await asyncio.sleep(0.1) # Long secondary work
        return True
    except asyncio.CancelledError:
        # Cleanly handle cancellation
        audit_records.append(f"CANCELLED: {job_name}")
        raise

if __name__ == "__main__":
    records = []
    async def demo():
        task = asyncio.create_task(resilient_worker("backup-db", records))
        await asyncio.sleep(0.02)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            print("Task cancelled as expected")
        print("Audit records:", records)

    asyncio.run(demo())
`,
      test_code: `import asyncio
import unittest

class TestCancellationShield(unittest.IsolatedAsyncioTestCase):
    async def test_shielded_execution(self):
        records = []
        task = asyncio.create_task(resilient_worker("save-state", records))
        await asyncio.sleep(0.015)
        task.cancel()

        with self.assertRaises(asyncio.CancelledError):
            await task

        # Critical audit log should still have succeeded because it was shielded!
        self.assertIn("LOG: save-state", records)
        self.assertIn("CANCELLED: save-state", records)

if __name__ == '__main__':
    unittest.main()
`,
      hints: [
        '`asyncio.shield(coro)` protects the inner coroutine from cancellation: even if the outer task is cancelled, the shielded task runs to completion.',
        'Never swallow `CancelledError` with a bare `except Exception:`, because `CancelledError` inherits from `BaseException` (Python 3.8+).',
        'Always re-raise `CancelledError` if caught, unless you explicitly intend to suppress cancellation.',
      ],
    },
  ],
};

/**
 * All available pre-configured starter tracks
 */
export const STARTER_TRACKS: CourseTrack[] = [
  TRACK_GO_CONCURRENCY,
  TRACK_RUST_OWNERSHIP,
  TRACK_DISTRIBUTED_RAFT,
  TRACK_PYTHON_ASYNCIO,
];

/**
 * Retrieves all registered course tracks
 */
export function getAllTracks(): CourseTrack[] {
  return STARTER_TRACKS;
}

/**
 * Retrieves a course track by unique id
 */
export function getTrackById(id: string): CourseTrack | undefined {
  return STARTER_TRACKS.find((track) => track.id === id);
}

/**
 * Creates initial session objects for launching a track
 */
export function createSessionFromTrack(track: CourseTrack): {
  session: LearningSession;
  initialMessage: ChatMessage;
  firstMilestone: Milestone;
} {
  const now = Date.now();
  const sessionId = `session-${track.id}-${now}`;
  const firstM = track.milestones[0];

  const session: LearningSession = {
    id: sessionId,
    title: track.title,
    topic: track.tagline,
    language: track.language,
    created_at: now,
    updated_at: now,
  };

  const initialMessage: ChatMessage = {
    id: `msg-init-${now}`,
    session_id: sessionId,
    role: 'assistant',
    content: `${track.initialPrompt}

Here is your first milestone challenge: **${firstM.title}**.

\`\`\`forge-challenge
title: ${firstM.title}
language: ${track.language}
prompt: ${firstM.prompt}
starter_code:
${firstM.starter_code}
test_code:
${firstM.test_code}
\`\`\`

Take a look at the starter code loaded in your editor on the right. When you are ready, explain your mental model or hit **Run** to see the initial behavior!`,
    created_at: now,
  };

  const firstMilestone: Milestone = {
    id: `ms-${track.id}-1`,
    session_id: sessionId,
    title: firstM.title,
    prompt: firstM.prompt,
    starter_code: firstM.starter_code,
    test_code: firstM.test_code,
    status: 'active',
    created_at: now,
  };

  return { session, initialMessage, firstMilestone };
}
