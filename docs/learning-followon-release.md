# Sources, written reasoning and optional retrieval

28 October 2026. Continues the work in [the progression release](progression-release.md) and [the elevation plan](learnharness_elevation_plan.md).

## Saved references follow the learner

An uploaded file now becomes a topic-owned saved excerpt, not just a one-time curriculum prompt. The reference travels from the generated track into its session and milestones, including adaptive prerequisite repairs. Later tutoring, written-answer grading and side questions receive bounded, query-selected excerpts with stable source IDs and line ranges.

“Your source” exposes the saved text and its line numbers. It states that relevant excerpts go to the selected AI provider and identifies truncated content. Opening source notes while a question is pending immediately marks the attempt as supported practice. Source text is treated as subject matter rather than instructions; prompts tell the model to distinguish source-backed claims from its own examples and to acknowledge insufficient evidence.

The saved text is limited to 16,000 characters per source. Extraction accepts up to 64,000 characters before this limit, so longer input can be identified as truncated. File uploads are bounded at 10 MB. The PDF extractor remains limited: it handles some selectable text streams, not OCR, layout reconstruction or every PDF font encoding. This is a bounded local excerpt system, not full-document semantic search. Model-supplied citations are not independently verified factual claims.

Deleting a topic removes its saved reference data with its sessions and track metadata. Exported session notes include saved source excerpts. Original files on disk are not a direcchanged. Earlier topics whose original uploads were never saved cannot recover those files automatically.

## Written answers have a real grading path

`forge-check` now supports a `free-response` kind with an expected answer and 1–5 committed rubric criteria. The UI accepts an answer without choices, saves its draft, and submits the actual text for grading by the learner's configured provider. The rubric and expected answer stay out of the unanswered question UI.

The returned judgment must cover every committed criterion exactly once. The application derives the outcome from those criteria rather than accepting an arbitrary `correct` flag. Low-confidence judgments remain unresolved. A failed or malformed grading response preserves the draft and offers retry or continuing without a grade. Feedback saves the submitted text and lets the learner inspect the rubric and expected answer; it pauses until Continue.

“This feedback missed something” marks the result disputed and removes its readiness credit, including after reload. A fresh case can establish understanding without relying on the disputed judgment. The application does not infer a missing prerequisite from an uncertain grade. Notes, visuals, side-question help, retries and other tracked support remain separate from independent evidence.

This is model-based rubric grading, not a validated assessment instrument. Paraphrase acceptance, subject accuracy and the appropriateness of a generated rubric need domain and learner evaluation. Existing readiness gates still require multiple independent applications and an explicit evidence-based review; no written answer alone establishes mastery. Recall-before-choices remains available as a different practice aid.

## One illustration contract

Lessons and `/btw` now share the illustration/pictogram instructions and renderer. The contract distinguishes illustrations, explorable labels and simulations whose controls actually change a modeled outcome. Standalone drawings can include a plain text description, exposed through “Read as text.” A render failure gives a recoverable text message instead of inserting raw SVG.

The old regex filter has been replaced by XML parsing followed by reconstruction of an explicitly limited SVG language. Only supported vector geometry, text, gradients and local clips are copied into a new SVG tree. Scripts, HTML, external resources, CSS, links, animation and event handlers are not part of that language. Documents with declarations, entities, malformed XML, excessive size/depth or excessive node counts are rejected. Local IDs are namespaced, viewboxes are finite and pictogram inputs are bounded.

The [xmldom project](https://github.com/xmldom/xmldom) supplies parsing/serialization; the LearnForge allowlist controls what is rendered. Tests cover hostile markup and preservation of supported geometry. These checks reduce the supported surface; they do not claim a formal security proof or evaluate the artistic/teaching quality of live generated drawings. The editor's transitive DOMPurify dependency is pinned through an override to the patched 3.4.17 release; the remaining npm audit findings are low severity.

## Optional revisits stay inside the session

Settings → Learning has an opt-in revisit preference, off by default. It offers one due concept from the same topic after at least 20 hours from card creation. A learner can choose “Not now” or return to their current lesson. There is no review modal, daily queue, streak or forced interruption.

A revisit requests a fresh application, usually a written answer, and keeps the current lesson mounted with its place and draft intact. The result is stored separately from lesson/mastery attempts. Grading alone does not update the schedule: Finish revisit does so once, using recorded correctness and help used. Uncertain or disputed judgments do not change the schedule. A miss can lead to a smaller supported example. Topic deletion also removes revisit records, drafts and dismissal state.

The existing scheduler is an FSRS implementation. Its intervals are scheduling estimates, not individually proven optimal intervals. This release does not claim improved delayed retention. A later real-learner check is part of the study protocol.

## Packaged authentication boundary

The ChatGPT/Codex bridge in `vite.config.ts` is a development-server implementation. It is now labeled as such and disabled for packaged/static production builds. Saved selections of that provider get an actionable message and choices for local or API-key providers. Chat, model discovery, status and login paths are guarded before network requests, so the app does not silently try missing relative routes or change providers behind the learner's back.

This is a production capability gate, **not native subscription sign-in**. Current official OpenAI documentation does describe [Sign in with ChatGPT for open-source apps](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt), including installation identity, issued client registration, protected credential storage and permission checks. That is a different integration from reusing a command-line client's identity. The [registration/sign-in guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) is the basis for a future native implementation. No new account authorization or credential migration was performed here.

Packaged LearnForge continues to support its configured API-key/local-provider routes. OpenAI's [API authentication documentation](https://developers.openai.com/api/reference/overview) describes API bearer credentials. This change does not make a hosted browser frontend a secure place for embedded shared API keys; the existing bring-your-own-key storage model has not been replaced by a server or OS credential vault.

## Evaluation is prepared, not completed

The [moderated pilot protocol](evaluation/learner-pilot.md) covers topic creation, placement interpretation, feedback, written reasoning, disputed grading, source peeking, illustrations, interruptions, connection failures, fresh transfer and delayed retrieval. It includes counterbalanced comparison guidance and domain-review requirements. The [observation sheet](evaluation/session-observations.csv) contains headers only.

No participants were recruited, no messages were sent, and no comparative learning results were invented. Synthetic browser fixtures and passing tests are software validation only.

## Verification

- 187 tests across 30 files pass, including the prior progression checks plus source persistence, source context, exact rubric coverage, malformed/uncertain grading, disputed-grade persistence, inert SVG handling, packaged-auth guards, topic-isolated retrieval and single-use scheduling.
- Browser walkthroughs use production components with deterministic local responses in ignored QA fixtures. They verify independent written-answer evidence, revocation on dispute, draft restoration, rubric inspection, failure recovery, uncertain outcomes, source support labeling, SVG/text rendering, pending-revisit restoration, “Not now,” and explicit Finish scheduling without roadmap evidence.
- TypeScript, production web output and the macOS Tauri build passed. The final bundle is `src-tauri/target/release/bundle/macos/LearnForge.app` (20.21 MiB). It was opened on the existing saved workspace, and its new revisit setting was verified off without changing preferences. Static production settings were also checked with a synthetic saved development-bridge selection: unavailable sign-in/model controls were hidden and recovery choices remained visible. Live provider accuracy, real account sign-in and learner outcomes are not asserted by these checks.
- Earlier local changes from the other model have been preserved. No existing personal topic or answer was deleted during validation.

## Screenshots from synthetic test workspaces

- [Written answer and committed rubric](design/followon-release/written-rubric.png)
- [Side-question illustration and text equivalent](design/followon-release/side-illustration.png)
- [Recoverable grading failure](design/followon-release/grading-recovery.png)
- [Revisit feedback before scheduling](design/followon-release/revisit-feedback.png)
- [Production authentication capability gate](design/followon-release/production-auth-gate.png)

## Direction-loading visibility fix

Selecting a suggested direction now scrolls the dialog's form to the processing indicator once the request starts. The dialog header stays in place. Reduced-motion preferences use an immediate scroll, and later progress-text updates do not trigger more scrolling.

Verified with a long five-direction list: the form moved from scroll position 3 to 671, with the entire loading indicator inside the form viewport. Cancel request remained visible and cancelled without creating a topic. The existing 187 tests and macOS build pass. [Loading-state screenshot](design/direction-loading-scroll.png).
