# Contributing to LearnForge

Thanks for considering contributing. This document covers the basics of getting set up and submitting changes.

## Prerequisites

- Node.js 20+
- Rust 1.78+
- npm

## Development setup

```bash
git clone https://github.com/Oyetomi/learnforge.git
cd learnforge
npm install

# Web dev mode (hot reload, no native shell)
npm run dev

# Desktop mode (Tauri native window)
npm run tauri -- dev
```

## Running tests

```bash
npm test
```

All 190+ tests should pass before you open a pull request.

## Project structure

```
src/                    # React frontend
  components/           # UI components (editor, chat, session)
  services/
    sandbox/            # Code execution runners (Go Playground, Wandbox, Rust Playground)
    ai/                 # AI provider integrations (Gemini, Claude, OpenAI, Ollama)
    spaced-repetition/  # FSRS-4.5 scheduling engine
    database/           # SQLite schema and queries
src-tauri/              # Rust backend (Tauri 2.0)
docs/                   # Design docs and images
```

## Submitting changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Run `npm test` and confirm everything passes.
4. Run `npm run build` to verify the production build compiles.
5. Open a pull request with a clear description of what changed and why.

## Commit messages

Follow conventional commit style where possible:

```
feat(sandbox): add Haskell runner via Wandbox
fix(spaced-repetition): correct interval calculation for lapsed cards
docs: update quickstart prerequisites
```

## Areas where help is welcome

- Additional language runners and compiler integrations
- Improving the prompt state machine for edge cases
- Accessibility improvements
- Windows and Linux packaging and testing
- Documentation and examples

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
