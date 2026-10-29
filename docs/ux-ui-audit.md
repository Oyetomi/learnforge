# LearnForge UX/UI audit

29 October 2026. Audit of reachable application surfaces and their main states. Existing topics, assessments, code drafts and previous feature work are preserved.

## Scope and method

Reviewed production components and used the running app plus isolated component fixtures for visual and interaction checks. The fixtures contain sample content only and are not a topic catalog or a production route. Responsive checks use explicit 900 × 600 and 390 × 844 iframe viewports, alongside ordinary desktop views; no learner data is seeded into the installed app.

| Surface | Coverage | Fixes |
| --- | --- | --- |
| Empty workspace and navigation | App/code; topic switcher keyboard interaction | Removed an unnecessary single Session tab on noncoding topics; added a keyboard skip link and clearer compact context navigation |
| New-topic setup and files | App/code; pending, cancel, errors, file lifecycle | Cancel notices and focus; safe file-import/request races; preserved goal; clearer scope controls |
| Curriculum outline and placement | App/code; edit, disclosures, choice semantics, placement request lifecycle | Honest approval label; cached/revisitable placement with prior answers; bounded requests, sibling cancellation, disabled edits while preparing; explicit choice probes |
| Curriculum map and outline | App/code; current/future unit details, narrow layout | Accurate current-unit rationale, lesson availability and module labels; clear disclosure icons; focus and scroll to selected details |
| Lesson reading and questions | App/fixtures; prose, code context, choice, retry, feedback, written answer, busy | Readable hierarchy; wider answering surface; actions follow choices instead of covering them; retry/feedback focus; scoped shortcuts; busy controls; cancellable written grading; preserved question context |
| Readiness and next steps | Code/fixtures | Replaced exact-answer-count promises and mastery claims with evidence-based readiness language; tests alone do not expose a misleading advancement action |
| Coach and side questions | App/code | Bounded side-question surface; dismiss aborts the request, restores focus and allows retry; quieter footer with model access retained |
| Saved explanations and study sheet | App; Timeline/Study sheet; code | Keyboard tab navigation; awaited clipboard success/error; Markdown download fallback; separate export controls; future concepts labelled Not started; completion alone does not claim readiness |
| Saved sources | Code/fixtures | Per-source disclosure and keyboard-scrolling; supported-practice tracking begins when text is actually visible |
| Tables, math, illustrations and steps | Fixtures/code | Semantic tables/math and illustration layout checked; more code grammars highlighted; existing language-neutral visual models retained |
| Topic management | App/fixtures; confirmation cancel | Keyboard access to Manage topics; cancel returns to initiating control; correct module/outcome counts; long-title layout |
| Learning settings and AI connection | App; minimum/narrow windows; code | Stale async result guards, polling cleanup, model-discovery timeout, save validation/errors, secret remasking and blocked-sign-in fallback |
| Code workspace and output | Fixtures/code; run scope, output/tests, stale/reset states | Editor-only run shortcut, Monaco command, stale-output notice, focus-preserving reset/clear, honest test results and gated next-step CTA |
| Optional integrated retention | Code and existing tests | Request cancellation and busy-state reset, disabling retention aborts work, revisit heading/focus restoration; remains optional |

The legacy daily-review modal is not a reachable feature and was not restored. Generated lesson quality, every possible provider error, every execution runtime, and every generated visual are not exhaustively covered by a finite interface audit.

## Shared design improvements

- Retained JetBrains Mono for interface text, Google Sans Code for source, and mathematical typesetting for equations.
- Improved the reading/title hierarchy, keyboard focus visibility, compact navigation, narrower-window composer layout and long-content wrapping.
- Operational token/context details are available on demand rather than competing with the learning task.
- Kept a single primary vertical scroll owner on each workspace/dialog, with local horizontal scrolling for wide code/tables.
- Respect reduced-motion preferences across transitions, loading indicators and scrolling.
- Existing successful code execution is distinguished from demonstrated conceptual understanding.

## Validation

- **279 tests passed across 42 test files.** This includes placement caching/lifecycle, code grammar output, editor shortcut scope, question retry shortcuts, settings validation, deletion focus recovery, and study-sheet status coverage.
- TypeScript and the production web build passed. `git diff --check` passed. The existing large-chunk advisory remains for the application/editor bundles.
- Verified in the browser: a wrong answer and supported retry keep both answers visible; feedback receives focus and holds until Continue; topic picker Tab reaches Manage topics and Escape restores its trigger; cancelling deletion restores the initiating Delete control; future curriculum previews preserve the current activity; history tabs switch with arrow keys; settings fit 900 × 600 and 390 × 844 viewports; source entry uses one dialog scroll area; running code outside editor focus does not trigger execution.
- Tauri release build passed (20.42 MiB). The signed bundle was installed at `/Applications/LearnForge.app`; strict signature verification and SHA-256 comparison of every bundled file passed. The prior application bundle is backed up at `.lazyweb/install-backups/before-ux-audit-460cc824fa/LearnForge.app`.
- Opened the installed Mac app and verified that the saved curriculum/session rendered with highlighted code, the updated readiness status and the compact help/model controls. No learning answer was submitted during this launch check.

## Representative screenshots

- [Installed Mac application](design/ux-audit/installed-mac-app.jpg).
- [Focused question](design/ux-audit/question-focus.jpg) (QA origin; actions no longer overlay the choices).
- [Focused answer feedback](design/ux-audit/answer-feedback.jpg) (isolated component fixture).
- [Curriculum preview](design/ux-audit/curriculum-preview.jpg) (generated drawing curriculum on the QA origin).
- [Study sheet](design/ux-audit/study-sheet.jpg).
- [Tables, math and highlighted code](design/ux-audit/tables-math-code.jpg) (isolated component fixture).
- [Code test results](design/ux-audit/code-results.jpg) (mock execution, no learner code run).
- [Minimum-window settings](design/ux-audit/settings-minimum.jpg) and [narrow settings](design/ux-audit/settings-narrow.jpg) (explicitly labelled QA frame).
- [New-topic source entry](design/ux-audit/new-topic-minimum.jpg) and [topic management](design/ux-audit/manage-topics.jpg).

These checks establish interface behavior, not learning efficacy or correctness of every model-generated response. No learner data was deleted or replaced for this audit.
