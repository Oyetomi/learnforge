# Question trust and recoverable feedback

1 November 2026. This follows the shared failure found in the [comparison audit](evaluation/comparison.md): structural question validation does not establish factual correctness.

## Before a session question is graded

Session and optional revisit questions now pass through a bounded second review using the selected provider/model. Choice review receives the visible question, options and relevant saved reference excerpts, **without the author's key, explanation or hint**. It solves every option; the app compares the returned set with the committed key. Multiple defensible answers in a single-select question, disagreement, low confidence and insufficient evidence prevent approval. Written review checks the expected answer and fairness of the committed rubric.

The review cannot rewrite a question, replace the key, grade a learner or advance a lesson. Invalid review JSON is a failed check, not approval. This adds one model request per uncached question, with a 1,400-token output allowance and a 20-second UI deadline. It does not silently switch models or automatically retry. Provider enforcement of token limits and pricing still applies.

In the main session, review starts while the learner reads. If it has not completed when the question opens, a quiet preparation surface replaces the unanswered question. A conflict offers a different question or an explicit retry; failure preserves the lesson and saved draft. Returning to the explanation does not advance the activity. Neither the checker’s solution nor an unsettled key is exposed on that surface.

Approval is cached against the exact question, options, key, explanation, rubric, selected source excerpts, question/milestone identity and provider/model address. Hash collisions are guarded by comparing the complete stored identity. A submitted attempt carries a matching receipt; main-session and revisit handlers refuse attempts without it. This is application consistency, not a cryptographic security boundary. A failed storage write still permits the reviewed attempt in memory. Deleting a topic removes its review caches, including checks never submitted.

Existing submitted answers remain readable without a new request. This change does **not** retrospectively certify old results. Placement probes and curriculum diagnostics using their own question surfaces are outside this gate; their factual quality remains to be evaluated.

## Feedback can be challenged

Choice answers now offer “This feedback missed something,” as written answers already did. A dispute preserves the selection, reasoning and draft history while marking the outcome unresolved. The UI stops labeling the disputed key correct or repeating its explanation as settled fact. Old post-answer tutoring no longer matches the changed result. A neutral explanation and a fresh application remain available through the existing teaching flow.

The result loses independent readiness credit immediately and after reload. Prior readiness assessments depending on it cease to qualify. A disputed revisit cannot change its schedule, including when its answer was “I don’t know.” Dispute is idempotent; repeatedly pressing the action cannot append repeated state changes.

Post-answer tutoring instructions now explicitly distinguish a correct selection from sound reasoning. They ask for a smaller observable case after confusion, definitions before jargon, and compact comparisons when useful. These are teaching instructions, not proof that a live model will follow them or teach effectively.

## Evidence and limits

The reviewer is another pass through the configured model, so its errors can correlate with the author’s. High confidence is a returned judgment, not independently measured reliability. Wrong agreements remain possible; correct questions can be rejected. The important next evaluation is false approval/rejection against independently reviewed questions, along with latency, cost and recovery. No claim of superior learning or retention follows from this change.

For choice questions, the original explanation is withheld to avoid giving the checker the author's answer. That explanation is therefore not independently verified by this pass; approval covers agreement on the answer set and question answerability. Generated lessons, explanations and diagrams still need factual evaluation. Unresolved or disputed outcomes are excluded from learned-fact summaries and Anki export as well as readiness and scheduling. Operational review receipts stay out of tutoring/planning model context.

Deterministic tests exercise withheld keys, wrong-key disagreement, ambiguous single-select, exact multi-select sets, low confidence, malformed replies, written rubric review, cache invalidation, failed requests, receipt binding, topic deletion and durable choice disputes. Isolated browser QA uses the production session with a deterministic reviewer; it can verify interaction behavior but not real provider accuracy. The original [four-fixture audit](evaluation/question-contracts-2026-11-01.json) remains a historical test of the pure authoring validators, which still validate structure only.

Verification: 370 tests in 55 files pass. The production web and macOS Tauri app build pass. Browser checks exercised conflicting keys, ambiguous selection, replacement, an approved submission, dispute credit removal, provider failure with one explicit retry, a 20-second timeout, and returning to the explanation. A 390px workspace was also inspected. [Conflict](design/question-trust/conflict.png) and [disputed feedback](design/question-trust/disputed-feedback.png) screenshots are deterministic QA fixtures, not live model results.

The local macOS bundle was ad-hoc signed, verified with `codesign --verify --deep --strict`, and installed at `/Applications/LearnForge.app`. All four installed bundle files matched the build by SHA-256. The previous bundle is backed up locally under `.lazyweb/install-backups/before-question-trust-6z_oc267/`. The running app session was left open; reopening loads the update.
