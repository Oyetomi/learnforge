# Placement and feedback reliability

28 October 2026. Implements the first delivery in [the elevation plan](learnharness_elevation_plan.md), plus the feedback and support-tracking fixes needed to make that progression trustworthy.

## Placement recommends; lesson evidence decides readiness

- Plan approval retains every concept and every prerequisite. “Keep for later” is a focus preference, not deletion or a mastery claim. Deferred concepts remain visible on the roadmap.
- The optional check works for single-concept plans, supports multi-select questions, captures confidence, and stores the exact question/choices and answer. It makes no fixed-duration promise.
- Revisiting an area restores its saved selection. Submitting a new answer replaces the previous probe result; “I don’t know yet” cannot leave an earlier pass in effect.
- Recommendations choose a currently available starting concept. A failed later probe can point back to its prerequisite even if the earlier probe was correct. One correct guess cannot approve a prerequisite.
- Approval persists the tentative evidence separately from lesson attempts. Unapproved planning state is local to the dialog; cancellation or reload does not create a topic or lesson-completion evidence.
- New sessions open the chosen independent root. Next-lesson selection can return to an earlier deferred branch; it is no longer limited to items after the current array index.
- A question already seen during placement is not seeded as a fresh lesson check. Its saved context tells the tutor to use a different applied case. Producing a meaningfully different question still depends on model quality.
- Existing sessions and progress are preserved. The change does not reconstruct concepts removed by older plan pruning.

## Feedback is a real pause

- Saving a correct answer no longer starts a background teaching request. Continue starts the next request.
- Lessons with an explanation open on that explanation. An automatic initial request cannot jump over it; a missing check is requested when the learner chooses to practise.
- The answer/result stays visible while the next step is prepared. A failed connection leaves feedback and a retry route in view, including after reload, rather than replacing it with an error transcript.
- Connection errors offer a Settings link without automatically opening a modal over the answer. Detailed error messages remain available in history.
- Feedback keeps keyboard focus when the answer stage changes.

## Supported practice stays distinct

- First-miss retry state is saved with the answer draft. Reloading cannot turn a successful retry into independent evidence.
- Multi-select retries remain editable. A partly correct first selection no longer disables correct options that are still needed in the final set.
- Saved feedback shows the first answer and the retry separately. A successful retry is explicitly labeled supported practice.
- Successful `/btw` help on a pending question counts as support for that question. Failed or aborted requests do not; switching concepts aborts the side question and clears its popover.
- Predict-and-run requires a prediction and displays an immutable snapshot of what was predicted before execution. Editing the input later cannot rewrite that displayed prediction.
- Recall-before-choices remains a practice aid followed by option-based grading. This release does not claim to add rubric-graded free-response assessment.

## Validation

- 161 tests pass across 26 files. New cases cover exact-set placement grading, stale probe replacement, dependency preservation, independent-root selection, deferred branch return, persisted evidence, prompt context, editable multi-select retries, first-answer feedback and recovery from a saved generation error.
- TypeScript, Vite production output and the Tauri macOS app build passed. The app bundle is at `src-tauri/target/release/bundle/macos/LearnForge.app` (20.18 MiB). Existing large-bundle warnings remain.
- Browser interaction checks use production components in a synthetic local workspace. Network responses are mocked only in ignored QA files; no learner topics or provider credentials were changed.
- Verified the complete-set placement interaction, revision of a previous pass, retained dependencies, chosen-root launch, a correct-answer pause with no new request, one request on Continue, saved retry after reload, no extra independent mastery credit for retry success, side-question support labeling, connection-failure recovery and successful retry.
- The fixture's request counter includes the AI client's existing fallback attempt on a failed request. A successful Continue made one request.
- A 390px-wide placement preview had equal document/client widths (390px), with no horizontal overflow. Multi-select and confidence controls remained available. [Narrow-screen preview](design/progression-release/mobile-placement.png).
- The native app's existing saved session was inspected without answering a learner question or changing their topic. The production bundle was built; this is not a claim that a previously running process reloaded its executable.
- These checks establish application behavior, not calibrated placement accuracy or improved learning outcomes. No comparative learner study or live-provider generation-quality evaluation was performed in this delivery.

## Evidence

- [Approved-plan preview](design/progression-release/placement-plan.png)
- [Paused feedback](design/progression-release/feedback-paused.png)
- [First answer and supported retry](design/progression-release/retry-feedback.png)
- [Connection recovery](design/progression-release/connection-recovery.png)

## Follow-on status

The [follow-on release](learning-followon-release.md) now adds durable uploaded-source excerpts, rubric-graded written answers, a shared illustration contract with inert SVG reconstruction, a packaged-authentication guard, and optional integrated revisits. The learner-study materials are prepared; no real participant results are claimed. Native subscription sign-in remains a separate supported integration, and no review modal was restored.
