# LearnForge: evidence audit and product elevation plan

Updated 28 October 2026. This audits the current local checkout against the assessment shared in chat. It does not establish that LearnForge teaches better than LearnHarness. The issue numbers below come from that assessment; their present status and the current LearnHarness implementation were not reverified in this audit.

Implementation update: the audit table below records the pre-change findings. The first delivery now preserves placement evidence and prerequisites, separates deferral from mastery, and makes feedback a recoverable pause. See [the progression release report](progression-release.md) for the implemented behavior and validation. The remaining roadmap items are proposals, not shipped claims.

## Product direction

Make each session a clear sequence: attempt an idea, see what happened, understand one distinction, try a different case, then review readiness. The roadmap should explain those decisions. A larger feature list is not the success measure.

Preserve the learner's subject and practical goal, including nontechnical subjects. Presentation preferences can change; they should not become fixed learner-type labels. Keep the focused slides, explicit Continue, optional coding workspace, and permanent topic deletion.

## What the current code supports

| Shared claim | Finding in this checkout | Evidence / limitation |
| --- | --- | --- |
| Feedback waits for Continue (#64) | Implemented separation between saving an attempt and requesting the next teaching response. | [App](../../src/App.tsx), `handleSubmitCheck` and `handleContinueCheck`. This still needs desktop interaction and recovery coverage across asynchronous failures. |
| Questions have their own slide (#187/#248) | Implemented lesson/reference/check/reply/visual activities. | [ChatPane](../../src/components/chat/ChatPane.tsx). Long individual activities may still require scrolling; a dedicated slide does not guarantee that every question fits. |
| One retry before revealing (#237) | Conditional: wrong answers on checks with at least three options get one retry. Two-option checks and “don't know” reveal feedback immediately. | [QuestionCard](../../src/components/learning/QuestionCard.tsx). Record the initial miss separately from a successful retry. |
| Free recall and predict-and-run (#99/#221) | Partial. Recall hides choices while collecting thinking, but final grading still compares selected option IDs. Predict-and-run compares a learner-entered prediction with execution output; it is not a separately graded prediction task. | [QuestionCard](../../src/components/learning/QuestionCard.tsx), [grading](../../src/services/learning/checks.ts). Equal option length is a prompt instruction, not an enforced generation constraint. |
| Closed-book versus supported practice (#176/#235) | Support tracking and mastery gates exist. | [preferences](../../src/services/learning/preferences.ts), [adaptation](../../src/services/learning/adaptation.ts). This is an application label, not proof that the learner used no external help. Test every in-app reveal path. |
| Side questions (#16) | Implemented an ephemeral `/btw` response, outside the main lesson timeline. | [studySheet](../../src/services/learning/studySheet.ts), [ChatPane](../../src/components/chat/ChatPane.tsx). The current prompt already requests SVG/pictograms and forbids ASCII fallback when SVG fits. The pasted claim that these instructions are missing is outdated for this checkout. Visual quality remains unproven. |
| Placement and plan approval (#75/#252) | A plan approval UI and area progress indicator exist. Placement reuses each lesson's check; one correct selected option can add the concept to `skippedIds`. | [NewTopicModal](../../src/components/curriculum/NewTopicModal.tsx). This prunes the concept and its dependency references instead of preserving diagnostic evidence. It is not calibrated placement. The UI's “60s” label is not a measured guarantee. |
| Study Sheet and Anki (#166) | Markdown and TSV exports exist. | [studySheet](../../src/services/learning/studySheet.ts), [history UI](../../src/components/chat/ChatPane.tsx). Export is not a retention loop. Claims such as “verified” or “repaired” need to distinguish retry success from later independent success. |
| Teaching from a file (#175/#249) | File extraction and excerpts feed topic suggestions and initial curriculum generation. | [fileExtractor](../../src/services/learning/fileExtractor.ts), [curriculum](../../src/services/ai/curriculum.ts). The generated track persists learning intent but does not persist the original reference excerpt as a retrievable source for subsequent tutor turns. This is initial generation grounding, not durable source-backed teaching. |
| Topic separation (#71/#207) | Sessions, messages, intent and topic-owned deletion are present. | [App](../../src/App.tsx), [topicDeletion](../../src/services/learning/topicDeletion.ts). This supports isolation; it cannot guarantee that a model never drifts off subject. |
| Built-in execution (#58) | Runners exist, with different capabilities. | [runners](../../src/services/sandbox/runners). Rust calls the public Rust Playground. Go has a simulator and optional WASM path; Python has an optional Pyodide path and a built-in fallback. Do not describe all languages as equivalent full local runtimes. |
| Long-term retention was dropped | The learner-facing review entry and modal rendering are absent, but FSRS scheduling, stored cards and some card creation remain. | [App](../../src/App.tsx), [Header](../../src/components/layout/Header.tsx), [FSRS](../../src/services/fsrs/engine.ts). Card creation currently happens when advancing to a next milestone, so the final concept can also miss scheduling. Existing review data should not be erased. |
| Production sign-in does not work | The ChatGPT/Codex bridge is registered through Vite's `configureServer`; the frontend calls its relative `/api/chatgpt-codex/*` routes. The native entrypoint contains no corresponding bridge. | [Vite config](../../vite.config.ts), [connection](../../src/services/ai/connection.ts), [native entry](../../src-tauri/src/lib.rs). A successful static build does not verify packaged authentication. This audit does not establish OpenAI's support policy or authorize reuse of another client's identity. |
| 144 tests prove the fixes | Current result: **147 tests pass across 25 files**; production web build passes. | These are software checks. They do not measure placement accuracy, delayed retention, visual comprehension or superiority over another product. |

## Recommended delivery order

### 1. Make progression trustworthy

Keep plan editing separate from evidence of competence. A learner may choose to defer an area; that does not mean they mastered it. Preserve its node and prerequisites instead of deleting them from the learning model.

Change the placement result from a skip decision into a tentative starting recommendation. Preserve the question, attempt, confidence and help used. One correct answer can propose a harder follow-up; it should not certify mastery. An uncertain answer should propose a small prerequisite, with a plain-language reason and an easy route back to the original goal.

Acceptance criteria:

- One correct placement guess cannot silently remove a prerequisite or count as mastery.
- Multi-select checks are graded as complete sets, including during placement.
- “Not sure” keeps the concept available, and revisiting a probe replaces its recommendation rather than preserving a stale pass.
- Manually deferred areas remain discoverable and are not relabeled as completed.
- The first teaching activity matches the chosen starting point and preserves the original goal.
- New-topic cancellation or reload cannot promote temporary probe state into completion evidence.

### 2. Close the learning loop before adding more activity types

Keep feedback visible until Continue. Preserve both the first answer and the retry, with separate outcomes. On a miss, teach one distinction in everyday language, then ask a fresh small application. Require independent evidence for readiness.

Make the current “Recall before seeing choices” accurately described as recall practice. A genuine free-response check needs an answer schema, a rubric, an explicit uncertain-grading state and a correction path. Do not count merely typing an answer as evidence of understanding. Prediction tasks should commit the prediction before a run and label run-assisted outcomes consistently.

Acceptance criteria:

- Submission leaves the learner's answer and outcome in view; no teaching request starts until Continue.
- A network failure, restart, side question or topic switch preserves the pending answer and feedback stage.
- Successful retries stay classified as supported practice.
- Reading a solution, using a model or running the answer cannot create independent mastery evidence.
- A correct answer with weak reasoning leads to another useful diagnostic case, not an unsupported mastery claim.

### 3. Make visuals explain a useful relationship

Do not treat “outputs SVG” as the goal. Use an illustration for appearance or anatomy, a comparison for distinctions, and a constrained simulation when changing an input reveals a rule. Static illustrations should be labeled as illustrations. Reserve “interactive model” for controls that change a relevant outcome.

For `/btw`, reuse a common visual contract rather than adding another isolated prompt rule. Keep side questions separate from progression. Provide a short text equivalent, keyboard controls, a reset, and a recoverable failure state. A diagram must not expose an unanswered check's solution.

Before broadening generated SVG use, replace the current regex-based filtering with a deliberately limited SVG element/attribute policy or a maintained SVG-capable sanitizer. Test scripts, event handlers, external resources, CSS and malformed markup. Current render smoke tests do not establish that arbitrary generated markup is safe.

Acceptance criteria:

- A visual has a named learning purpose and an observable relationship or distinction.
- Code examples, everyday language and another nontechnical subject all have useful visual fixtures.
- Controls visibly update the represented state, with equivalent explanatory text.
- Diagram failure leaves the question, answer draft and lesson position intact.
- No external loads or executable markup survive the supported SVG contract.

### 4. Establish packaged-app reliability as a release gate

Use the existing configured API connection as the release baseline. Clearly disclose or disable development-only authentication in packaged builds until a supported production architecture is chosen and implemented. Do not advertise subscription-backed access as a proven packaged capability.

Run the same real workflow in the production desktop app: create a topic, cancel generation, answer, retry, Continue, ask `/btw`, restart, resume, export, then delete a synthetic topic. Check failure and expired-connection paths. Verify each execution engine's limits and disclose when source leaves the device.

### 5. Evaluate an integrated retention experiment

The shared assessment says review was intentionally removed. This plan does **not** restore a modal or change that decision. Preserve scheduling data while considering a smaller, optional return-session retrieval activity.

Proposed flow: on a later visit to the same topic, offer “Try one from last time” with a clear reason and a choice to continue the current goal. Use a fresh application, commit the attempt before showing help, then repair briefly if needed. Schedule eligible evidence when mastery is saved, including the final concept, rather than only on navigation.

Success measures: voluntary uptake, delayed independent accuracy, whether a short repair helps on a second fresh case, and whether the interruption feels useful. Anki export remains optional. Do not schedule work for deleted topics or present a scheduler's interval as an individually proven optimum.

## Evaluation before claiming superiority

Start with a small moderated usability pilot that includes programming, a practical nontechnical subject, and a beginner language goal. Match topic scope and learner starting knowledge. Counterbalance app order or use equivalent topic sets; using the identical topic twice confounds the second app with practice from the first.

Record task completion, navigation confusion, scrolling needed to recover feedback, lost drafts, help used and ability to explain the concept in the learner's own words. Follow with fresh applications and a later retrieval check. Grade explanations against a subject-reviewed rubric rather than using the teaching model's self-report as the outcome.

Treat the pilot as discovery, not a statistically established winner. Prioritize observed failures. Ship one focused improvement, repeat the same tasks, and compare outcomes. Do not turn a feature-comparison table or passing test count into a claim that learners learn more.

## Verification performed in this audit

- `npm test`: 147 passed, 25 files.
- `npm run build`: TypeScript and Vite production build passed; Vite reports large bundle warnings.
- Read current UI, prompt, grading, placement, source-grounding, runner, scheduling and authentication code.
- No provider login, native build, live model quality test, learner study or current LearnHarness issue-status verification was performed here.
- This change adds the audit and plan only; it does not restore review, alter personal topics or change application behavior.
