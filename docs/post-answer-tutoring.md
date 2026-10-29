# Post-answer tutoring and question focus

Updated 28 October 2026.

## Problem

The previous flow saved a short committed answer explanation, waited for Continue, and generally requested another check after a correct answer. It did not guarantee a visible worked teaching turn. The session also treated some replies shorter than 280 characters as question introductions, bypassing them. The user's LearnHarness screenshots showed the desired substance: explain the answer, demonstrate the connection, and use a comparison where useful.

## Current behavior

- A final submitted choice or written answer starts a dedicated teaching request automatically. The existing first-error retry on choice checks with three or more options remains available before final submission.
- Immediate feedback and the exact selected/written answer stay in view. Wrong answers retain both the chosen and committed correct answers. The tutoring request does not replace or rescore the attempt.
- The tutor explains why the answer fits, walks through a small subject-appropriate example, and connects it back to the idea. A correct selection without written reasoning is not treated as proof of the learner's thought process. Unknown, uncertain, and disputed outcomes receive neutral or simpler teaching rather than an invented diagnosis.
- Teaching requests use `teachOnly`. Parsing does not accept a new check, readiness decision, roadmap repair, or coding assignment during this turn. The explanation is stored against `tutoring_for_check_id`; short explanations use the same visible teaching surface.
- Meaningful Markdown headings define reading parts. Paragraphs, code, and the explanation of that code stay together within a part. Read together shows the continuous explanation; it does not create an AI request. The saved overview preference initializes this layout.
- A new application or readiness review requires an explicit learner action after the teaching. Existing evidence rules and prerequisite planning still apply at that point. Reading a tutorial provides no additional mastery evidence.
- Failed, empty, and stopped teaching turns offer recovery with the answer intact. Reloading saved feedback does not automatically generate another teaching turn. Completed teaching reloads without another request.

## Visual treatment

An unanswered question has its own raised panel, stronger border, distinct background, and clear option selection. Code context remains available inside the question instead of requiring the learner to remember a separate reference slide. The question receives keyboard focus when entered. The existing restrained activity entrance respects reduced motion. The workspace composer stays available.

Post-answer teaching uses a neutral reading surface; outcome colors identify the answer result. Navigation names the next section rather than presenting a generic Next button for every paragraph. Long examples and small screens may still need vertical scrolling within the session; pagination is not a promise that every possible generated example fits a viewport.

The Mac app now opens maximized to the desktop work area, with a restored window size of 1440 × 960 instead of 1280 × 840. Native zoom also expanded the existing running window. This retains normal window controls and does not enable macOS full-screen mode.

## Tables, notation, and illustrations

Markdown tables render with real table semantics, column-header scopes, compact spacing, contrasting headers, subtle alternating rows, and existing safe inline-code/math rendering. Wide tables scroll horizontally inside a labeled keyboard-focusable region, with a scroll hint only when content overflows. They do not widen the lesson. No additional vertical scrolling panel is introduced.

Shared tutor, curriculum, and side-question instructions permit concise comparison tables when the same properties are compared across alternatives. They discourage tables for layout, long prose, or multiline code. Tables must not expose an unanswered assessment's solution. LaTeX and safe SVG illustrations remain available when they clarify the actual subject; none of these formats is mandatory for every reply. No new language-specific curriculum or runtime handler was added.

## Verification

- `npm test`: 232 tests across 35 files passed.
- Production frontend and macOS bundle built successfully.
- Installed the rebuilt, locally ad-hoc-signed bundle at `/Applications/LearnForge.app`, verified matching file hashes, reopened it, and observed the expanded native window. No sample learning data was put into the native app.
- Actual App UI with disposable sample lessons and deterministic, offline AI-response fixtures: correct choice, wrong choice, written response, automatic teaching, retained answers, named section navigation, continuous reading, explicit fresh-question request, saved-feedback reload, failed-request retry, and stopped-request recovery.
- A comparison table in a 350px-wide sample container stayed within that container; its 432px content scrolled inside a 316px region. Keyboard horizontal scrolling worked and all three headers retained `scope="col"`.
- Screenshots in `docs/design/answer-tutoring/` use authored sample content, not user learning data.

These checks verify orchestration, rendering, and recovery. They do not establish that every provider follows the teaching prompt or that learning outcomes improved. Live model quality and moderated learner evaluation still need evaluation. Each final submission now makes an additional tutoring request through the configured provider.

## Recovery and continuity — 29 October 2026

A direct question now releases the answer-review hold so its reply becomes visible immediately. Returning to the answer restores the saved teaching part and reading layout. Choosing a fresh application always starts a dedicated continuation request; an intervening clarification cannot be mistaken for a prepared next question. Failed or stopped requests leave the answer available for retry. Reading controls remain below the text and no longer cover it in short windows.

Each new tutoring request records the judgment it was based on. Disputing written feedback cancels any in-progress tutoring for that judgment and excludes older explanations from the active teaching panel. The learner can request a new neutral explanation. Earlier explanations remain collapsed and labeled in history, and their changed status is also identified in AI conversation context. Existing saved teaching remains readable, except that unversioned teaching cannot substantiate a disputed judgment. Reading positions are scoped to individual saved explanations and are erased with their owning topic.

Validation: 235 tests across 35 files passed, TypeScript passed, and the macOS bundle rebuilt. Actual App checks with deterministic offline responses covered clarification → return to the same teaching part → next-question failure → successful retry, reading-layout restoration after reload without a new AI call, disputing both completed and in-progress tutoring, neutral replacement teaching, and the collapsed outdated explanation in history. Topic-deletion tests preserve another topic's reading position while removing the deleted topic's keys. These remain software-flow checks, not a claim about live model accuracy or learner outcomes.

The installed copy at `/Applications/LearnForge.app` was updated with this build. Its local signature verifies, and its file hashes match the rebuilt bundle. Sample learning data remained confined to the browser fixture.
