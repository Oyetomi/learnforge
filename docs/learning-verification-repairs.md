# Repairs from the percentage walkthrough

1 November 2026. Addresses the four findings in [the live walkthrough](evaluation/live-2026-11-01/report.md), plus the follow-up feedback screenshot about typography.

- Currency/math: a shared Markdown boundary preserves dollar-prefixed prose and tables while retaining real inline/display equations and leaving code untouched. Explicit display math escapes internal currency symbols. Visual inline labels use the same prose/math distinction. Generation instructions also distinguish currency from delimiters. This is rendering repair, not a claim that arbitrary malformed TeX or incorrect model calculations can be recovered automatically.
- Answer identity: post-answer tutoring receives answer text, selected answer text and correct answer text; raw option IDs and selected IDs are omitted from this dedicated request. Instructions prohibit positional references because display order can be shuffled. Existing stored model wording is not regenerated automatically; this fixes future tutoring requests rather than rewriting historical replies.
- Diagnostic-first: focused lessons now offer the same pre-teaching boundary check as curricula. An explicit diagnostic-first goal selects the visible option; learners can override or skip it. When selected, generation waits for diagnostic responses (including uncertainty), then passes the evidence into focused-lesson context. Ordinary goals do not force a diagnostic. Diagnostic evidence remains tentative, not mastery credit.
- Navigation: mathematical ladders embedded in post-answer tutoring render as a compact complete calculation. Tutoring owns the reading parts; the calculation has no second Next/Back paginator. Standalone figures retain their step interaction.
- Hierarchy: feedback has a quieter result and submitted-answer summary, 14px body text, 17px section headings, smaller labels, one combined reading/listening toolbar, and a compact continuation button. The requested monospace text preference is retained.

## Verification

406 tests in 59 files pass. Regressions cover currency in prose/options/table cells, genuine math, escaped money, unchanged code, compact figure navigation, ID-free tutoring data, and diagnostic intent. TypeScript, Vite and the Tauri Mac build pass; pre-existing bundle-size warnings remain.

Browser checks use the production components with authored offline fixtures and no provider calls. The observed sequence was scope → diagnostic → lesson; trying to continue with unanswered diagnostic questions showed an error and made no lesson call. After answering one question and marking the other uncertain, diagnostic evidence reached focused planning. The compact figure had zero buttons and zero horizontal overflow; document overflow was zero at a 385px content viewport (390px browser override). The override was reset. Typography was measured at 14px body / 17px heading.

Previews: [feedback hierarchy](design/learning-repairs/feedback-hierarchy.png), [compact calculation](design/learning-repairs/compact-calculation.png), [diagnostic](design/learning-repairs/diagnostic-first.png), [narrow calculation](design/learning-repairs/narrow-calculation.png). These are authored fixtures, not new live-model comparative results.

The rebuilt app is installed at `/Applications/LearnForge.app`, with a backup preserved. Signature verification and all four bundled file hashes matched the source bundle. The running app was left open; quit and reopen to load the new binary. Existing saved lessons were not edited. These repairs do not establish superiority over LearnHarness or human learning outcomes.

## Escaped-currency follow-up

The later screenshots exposed a gap in the first regression examples: micromark also treats the currency dollar in `\$` inside math as a closing delimiter. The first fix only protected dollar-prefixed prose, so it did not repair that mixed notation. Currency tokens inside recognized math now become KaTeX `\text{\textdollar}` before Markdown tokenization. Prose and code are preserved. This applies to stored content at render time, without changing saved lesson records.

A new regression reproduces the saved-style percentage explanation with escaped currency in ten inline/display expressions. All ten typeset with no KaTeX error elements; the test asserts actual equation rendering, not merely the absence of an error. Browser checks also covered the cached walkthrough: seventeen typeset expressions, zero errors, zero nested figure buttons. At a 390px browser viewport there was zero page or figure overflow; the override was reset.

Walkthrough Markdown now uses the compact figure layout as post-answer teaching does. The oversized nested Back/Next/Reset controls no longer appear in these embedded calculations. Standalone interactive figures retain their controls.

407 tests across 59 files and the web/Mac build pass. The updated bundle was signed, installed with a backup, and its four file hashes verified. The existing running process was left open. [Repaired escaped-currency preview](design/learning-repairs/escaped-currency.png), [cached walkthrough preview](design/learning-repairs/escaped-walkthrough.png). These use authored regression content matching the observed syntax, not a claim of another live generated comparison.
