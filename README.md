# LearnForge (Working Title)
> An AI-native, hands-on learning harness built for software engineers, systems programmers, and technical masters.

---

## 1. Executive Summary & Why This Exists

### The Problem with Existing AI Tutors (Including LearnHarness)
Existing AI learning tools fall into two traps:
1. **Passive Chatbots (ChatGPT / Claude chats)**: Great at explaining things, but you don't actually learn because you are passively reading text. You get the *illusion of competence*.
2. **Rigid "Quiz Docks" (LearnHarness)**: Forcing active recall is the right philosophy, but:
   - **Static Markdown Only**: In a coding lesson (like Golang interfaces or concurrency), questions are multiple-choice quizzes ("What does this print?"). You cannot edit, execute, or experiment with the code.
   - **The Locked Composer Trap**: When a quiz appears, the UI locks the input box. You cannot ask a clarifying side-question without guessing an answer first.
   - **Graph Bloat vs. Retention**: Extracting 500 atomic proposition nodes with D3 force layouts looks cool, but learners rarely browse a dense graph. What actually creates long-term memory is **deliberate coding challenges** and **scheduled spaced retrieval (FSRS)**.
   - **Heavyweight Electron Overhead**: Multi-process Electron bundles running 400MB+ Next.js standalone servers prone to viewport overflow bugs on laptop displays.

### The LearnForge Vision
**LearnForge** is designed around how technical minds actually learn:
> **"Hear and forget. See and remember. Build and understand."**

Instead of quizzing you on code trivia, LearnForge pairs **Socratic dialogue** with **live code execution**, **guided milestone builds**, and **FSRS spaced repetition**.

---

## 2. App Name Candidates

Pick the name that resonates most with your taste:

| Name | Vibe | Concept |
| :--- | :--- | :--- |
| **LearnForge** *(current default)* | Craft, Industry | Forging mental models through code execution and building. |
| **Adept** | Mastery | Turning complex domains into fluent, second-nature skill. |
| **Socrat** | Dialogue | Pure Socratic dialogue—guiding you to answers rather than lecturing. |
| **Katas** | Martial Arts / Coding | Deliberate practice forms that build muscle memory for engineering concepts. |
| **Loom** | Synthesis | Weaving threads of knowledge, code, and reasoning into understanding. |
| **CogLab** | Scientific | A personal cognitive laboratory for mastering hard technical topics. |

---

## 3. Core Architectural Pillars

```
┌────────────────────────────────────────────────────────┐
│             User Interface (Tauri 2.0 / Web)           │
│  - Split view: Socratic Chat + Interactive Sandbox     │
│  - Never-locked composer (ask clarifying tangents)     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│                    Orchestrator                        │
│  - Socratic State Machine (Assess -> Guide -> Test)    │
│  - FSRS (Free Spaced Repetition Scheduler) Engine      │
│  - Local Proxy Bridge (http://127.0.0.1:10532)         │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
┌─────────────┴───────────┐    ┌───────────┴─────────────┐
│    Execution Sandbox    │    │      Local Storage      │
│  - WebAssembly Runner   │    │  - SQLite (WAL mode)    │
│    (Go / Python / TS)   │    │  - Markdown note export │
└─────────────────────────┘    └─────────────────────────┘
```

### Pillar 1: Dual-Pane Interface (Chat + Live Sandbox)
- **Left Pane (50%)**: Socratic conversation stream. Markdown, KaTeX math, diagrams.
- **Right Pane (50%)**: Live Monaco / CodeMirror code editor with:
  - Editable starter code
  - **Run** button ($\le 50\text{ms}$ execution via Wasm)
  - Output / compiler error console
  - Test runner output ("3/3 tests passed")
- **Layout Safety**: Responsive flexbox layout with proper `min-h-0 overflow-y-auto` bounds. No absolute-bottom overlay traps that clip on 13" laptop screens.

### Pillar 2: The "Never-Locked" Composer
- If a coding challenge or check is posed:
  - You can write your solution in the code editor.
  - **OR** you can type in the chat: *"Wait, explain why `var _ MyInterface = (*MyStruct)(nil)` is idiomatically used here?"*
  - The AI answers your tangent, then smoothly brings you back to the challenge.

### Pillar 3: Milestone-Driven Projects vs. Abstract Quizzes
Instead of arbitrary isolated questions, courses are structured around mini-projects:
- **Example (Go Concurrency)**:
  - *Milestone 1*: Build a worker pool with unbuffered channels.
  - *Milestone 2*: Handle cancellation with `context.Context`.
  - *Milestone 3*: Prevent goroutine leaks and race conditions (verified with `-race`).

### Pillar 4: FSRS (Free Spaced Repetition Scheduler)
- Uses modern **FSRS-4.5** (proven to reduce review workload by 20-30% compared to Anki's 1980s SM-2 algorithm).
- Every concept or bug you struggle with is saved as a 3-minute review challenge scheduled at optimal retention decay intervals:
  $$R(t) = \left(1 + \text{factor} \cdot \frac{t}{S}\right)^{-w}$$
- Daily review queue: 5 minutes every morning to keep your Go, Rust, or Distributed Systems concepts rock-solid.

### Pillar 5: Lightweight Local-First Stack
- **Desktop Shell**: **Tauri 2.0** (Rust backend + Webview frontend).
  - Starts in $< 100\text{ms}$.
  - Uses $\sim 35\text{MB}$ RAM (compared to Electron's $400\text{MB}+$).
  - Zero port collisions or orphan node background processes.
- **Local Database**: **SQLite3** via `rusqlite` or `better-sqlite3`. Everything is stored locally on your Mac in `~/Library/Application Support/LearnForge/learnforge.db`.
- **LLM Integration**: Works out-of-the-box with your existing LaunchAgent background proxy (`http://127.0.0.1:10532`), giving you fast, free Gemini streaming, plus optional support for local Ollama / MLX models.

---

## 4. SQLite Data Schema

```sql
-- Learning Sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    language TEXT NOT NULL, -- 'go', 'python', 'rust', 'ts'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Messages & Socratic Turns
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    code_snippet TEXT,
    created_at INTEGER NOT NULL
);

-- Milestones & Challenges
CREATE TABLE milestones (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    starter_code TEXT,
    test_code TEXT,
    solution_code TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'completed'
    created_at INTEGER NOT NULL
);

-- FSRS Spaced Repetition Cards
CREATE TABLE srs_cards (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    prompt TEXT NOT NULL,
    target_code TEXT,
    difficulty REAL NOT NULL DEFAULT 5.0,
    stability REAL NOT NULL DEFAULT 1.0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_review INTEGER,
    due_date INTEGER NOT NULL
);
```

---

## 5. Local Environment & Zero-Setup Infrastructure

This project is already pre-configured to build and run on this Mac without needing any external paid API keys or cloud setup:

| Resource | Value / Location | Notes |
| :--- | :--- | :--- |
| **Local Gemini API Proxy** | `http://127.0.0.1:10532/v1beta` | Managed by LaunchAgent `com.gemini.oauth.plist`. Free, permanent streaming with `gemini-2.5-flash` and `gemini-2.5-pro`. |
| **Hardware / OS** | macOS (Apple Silicon M1 Pro, 2020) | Target platform for native Tauri 2.0 bundle and ARM64 binaries. |
| **GitHub CLI** | `gh` authenticated as `Oyetomi` | Ready for automated repo creation, commits, and pushes. |
| **Project Workspace** | `/Users/abbey/Desktop/learnforge` | Root directory for all source code, SQLite databases, and UI components. |

---

## 6. Implementation Roadmap & Immediate Next Steps for a New Session

When starting the new conversation, the agent can immediately pick up with:

### Milestone 1: The Core Prototype (Immediate Objective)
1. **Initialize Project Scaffold**:
   - Set up Vite + React + TypeScript + Tailwind CSS inside `/Users/abbey/Desktop/learnforge` (configured with Tauri 2.0).
2. **Wire Dual-Pane Layout**:
   - Left: Socratic chat stream with markdown and KaTeX.
   - Right: Monaco / CodeMirror code editor with Run & Reset buttons.
3. **Connect Streaming AI Client**:
   - Hook up streaming client to `http://127.0.0.1:10532/v1beta/models/gemini-2.5-flash:streamGenerateContent`.
   - Inject the Socratic Tutor system prompt (assess knowledge $\to$ teach 1 concept $\to$ pose code challenge).
4. **Embed Code Execution**:
   - Integrate WebAssembly Go / Python execution engine so code runs instantly in-browser.

---

## 7. Development Quickstart (Prompt for the New Chat)

Copy and paste this one-liner into your new chat to instantly resume:

```markdown
I want to build LearnForge (a Socratic coding harness with dual-pane chat, live Wasm code sandbox, and FSRS spaced repetition). 
Please read /Users/abbey/Desktop/learnforge/README.md for the full architecture, schema, and local proxy setup, and let's start Milestone 1.
```
