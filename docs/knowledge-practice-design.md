# Knowledge and practice — implementation design

2 November 2026. User-authorized direction: strengthen persistent knowledge and practice infrastructure.

The learner needs to see what an idea means, where it came from, what it depends on, and what happened when they tried applying it later. This extends the existing curriculum and session; it does not replace them or award progress for opening a graph.

## Flow

Header → Knowledge & practice → choose a topic → build a map from saved explanations/source excerpts → inspect an idea and its provenance → choose up to three ideas → practise one fresh application at a time → review the submitted response and tutoring → explicitly continue or try a smaller case → review the run and resume later.

Keep the default topic scoped. Cross-session material within that topic is available, while unrelated topics remain separate. A semantic list accompanies the connection view. Sources and complete premise groups remain inspectable; a prerequisite link is not silently treated as a logical proof. Generated assertions stay labelled as extracted ideas, not verified facts or mastery.

## Data and trust

- Source-backed propositions carry exact source quotes and stable topic-scoped IDs. Extraction rejects missing/invented anchors, dangling links, cycles and incomplete argument records.
- A reasoning relation stores its complete set of premises together. No automatic semantic merging or premise removal.
- Practice snapshots the selected source material. Questions, attempts, help use, feedback and disputes persist independently of curriculum readiness.
- The existing question-review gate and written-response rubric are reused. Correct supported answers are distinguishable from unaided applications. Disputes invalidate practice credit.
- Selection is explicit. Recommendations prioritize difficulty/untried/older practice; they do not infer a learner's competence from map layout or a generated claim.
- Runs are bounded, resumable, cancellable and topic-owned. Deleted topics remove this new data. Storage/provider errors are visible and preserve the current response.
- Existing concept-ledger entries remain intact. This feature does not silently migrate them into proven propositions.

## Verification

Exercise malformed extraction, exact quote anchoring, multi-premise preservation, topic isolation/deletion, duplicate submissions, disputed/support-dependent evidence, resume after reload and failed generation. Browser checks use authored data and a fake provider first; no learner records or microphone are used. Any comparison with LearnHarness remains an implementation comparison until matched learner evidence exists.
