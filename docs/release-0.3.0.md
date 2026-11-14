# LearnForge 0.3.0

14 November 2026. Storage, interface and PDF reading changes since 0.2.4.

## What changed

**Your records move to a local database.** Topics, lessons, conversations and review cards now live in IndexedDB instead of localStorage, which was capped at a few megabytes. Each conversation is stored separately, so answering a question no longer rewrites every conversation. On first launch, existing records are copied across automatically. The old copy is removed only after the new database confirms the save. If IndexedDB can't open, the app keeps using localStorage.

**Lessons and questions are calmer.**
- Hint, Walkthrough, Visual and Clarify sit behind one **Help** menu, and `/btw` is now **Side question**.
- Questions use a 720px reading width, and the keyboard legend stays quiet until you use the card.
- On narrow windows, **Check answer** stays visible above the message box.

**The rest of the app got the same pass.**
- The start screen hands its goal straight to scoping instead of asking again.
- The header hides topic tools until a topic exists.
- The interface says "topic" throughout.
- Wording is plainer for starting points, plan revisions and the roadmap.
- The approve button stays in reach during plan review.
- Settings and Saved explanations no longer jump between tabs.
- Explanatory text reliably uses the reading font.

**PDF study is reworked.**
- In books divided into parts, the chapter picker defaults to the chapters inside each part. A part and its chapters can no longer be picked together.
- A new book sidebar shows the cover, your place and the contents.
- The curriculum page offers **Read PDF pages …** for the current unit.
- The reading screen has a compact header and one step at a time.
- **Pages are read inside the app.** During a check the pages are hidden. **Look back at these pages** shows them again and counts as practice with help.

**Reliability.**
- The app remembers whether you were reading, planning or in a lesson, per topic.
- A screen that fails to draw shows a recoverable message instead of a blank window.
- CI was failing since 5 November: the code used `Array.prototype.at`, which the ES2020 target lacks. Local checks didn't catch it because type packages from a parent folder leaked in. Both are fixed.

**Code structure.** Session loading, AI reply interpretation, code drafts and topic membership moved out of `App.tsx`, into separately tested modules and hooks. Text colours use a six-step scale that meets WCAG AA contrast; a test guards it.

## How it was checked

- 519 frontend tests pass, including new tests for the IndexedDB backend and migration, session loading, reply interpretation, the PDF chapter picker and the page viewer. TypeScript and the production build pass. CI passes on `main`.
- A clean copy of the repository with `npm ci`, and no parent `node_modules`, reproduced the CI checks before pushing.
- The full lesson loop ran in the browser: lesson, question, worked explanation, transfer question, then the readiness review. Lesson completion and the review card were confirmed in IndexedDB.
- One real topic was created through the local AI proxy: goal, scope, curriculum approval and the first lesson.
- PDF flow on an authored 94-page test book with front matter, three parts, nine chapters and nested sections:
  - import, chapter selection and curriculum preparation through the local proxy;
  - in-app pages, a closed-book check and looking back.
- Screens were checked at 1280 × 800 and 390 × 844 with no horizontal overflow.
- The Mac app was built and ad-hoc signed. It was installed after backing up the previous app and its WebKit data. On first launch the existing records migrated to IndexedDB, and the old localStorage keys were then removed.

## Known limits

- **PDF:** there is no zoom in the page viewer, so a full page is small on very narrow windows. Page ranges are typed as physical PDF page numbers. Image-only PDFs need an OCR copy.
- **Not tested:** narration (ElevenLabs/Keychain) and remote code execution in this release.
- **Not established:** software checks don't show that learning improved.
- **Distribution:** the Mac build is ad-hoc signed and not notarized.
