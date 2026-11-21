# LearnForge 0.4.0

21 November 2026. Changes since 0.3.0: learning a book by building one real project, an IDE-style code workspace, and a large reliability and security pass.

## What changed

**Learn a book by building one project.** When you create a curriculum, choose **Build a project** and a language. The course then grows one codebase from chapter to chapter instead of handing out separate snippets. This works even for books with no code, such as *Designing Data-Intensive Applications*.
- Each chapter's build comes in 2–5 short parts (15–30 minutes each), modelled on build-along books such as *Let's Go*. Every part starts from a real limitation of your current code and follows the same shape: **Where we are**, **What to change** (files and exact signatures, never the implementation), **Check it** (what each test checks) and **Why it works**.
- The next part is prepared only after the current one passes, from the code you actually wrote. Every part adds its own test file, and every run re-runs all earlier tests, so a change that breaks an earlier step shows up immediately.
- Before a part is shown, its tests are compiled against your files. A part that doesn't compile is repaired once, or reported, rather than saved broken.

**The tutor leads the build.**
- The lesson card says when to start: **Ready to build** appears once you've answered a question about the idea on your own.
- **Start building with your tutor** opens the project. The tutor introduces the chapter's parts, the first file to open, and asks one question about your plan.
- The tutor always sees your project files and your latest test run. When tests fail, **Ask the tutor why** explains the first failure and gives one hint, without the fix.
- When a part passes, the tutor says what works now and motivates the next part. After the last part it reviews your code and names the reusable **principle**, which later steps build on.
- **Predict before you run:** after edits, Run tests first asks what you expect. The result says whether you were right.
- **Compress it:** explain the lesson's idea in two sentences, graded against a rubric.

**An IDE-style workspace in any language.** Go, Python, Rust, TypeScript, JavaScript, C, C++, Java and Ruby are built in, and more can be added in `languages.json`.
- Folder explorer, completion, live errors, hover, go to definition, rename and formatting all come from the language's own server, such as `gopls` or `rust-analyzer`.
- Test results are grouped by step, with clickable file and line links.
- Code runs on your Mac in a sandbox: no internet except localhost, writes only to the project folder, and a clean environment. Runs have a time limit and a **Stop** button.

**Models stay current.** Settings reads the model list from your provider and refreshes it automatically, so new models appear without an app update.

**Security and privacy.**
- AI and Exa keys are stored in the macOS Keychain, readable only on this Mac while it is unlocked.
- Keys are never sent to providers that don't use one.
- The code sandbox can no longer write or delete outside the project folder through links.
- Deleting a topic also deletes its project folder and cached data.

**Reliability.** A broad pass fixed dozens of issues, including:
- answers that could get stuck on **Submit**
- review cards rated twice
- a correct follow-up answer after approval re-locking later lessons
- `-x^2` plotting as `+x^2`
- PDF pages failing on fonts that aren't embedded
- a code block tagged `constructor` crashing the message view
- startup storage races
- language servers taking 2 seconds to stop

## How it was checked

- 610 frontend tests and 18 native tests pass. TypeScript and the production build pass, and CI passes on `main`.
- Project parts were prepared with a real model and compiled against a real Go project. The tutor's kickoff and failure explanations were checked on the same project.
- The packaged app was built and run on macOS, with `gopls` running inside the sandbox.
