# LearnForge 0.2.4 verification

2 November 2026 (Africa/Lagos).

## Observed application behavior

A full numeric progression check used the production App with authored offline responses in a disposable browser origin. A wrong answer led to tutoring and a smaller guided exercise. Guided success kept independent evidence at zero. A fresh unaided answer counted as one independent application. Success on a changed-whole transfer question led to “Ready for tutor review,” not automatic completion. Only explicit Review readiness and an evidence-linked authored review marked the unit ready. This verifies application state transitions, not the quality of a live model's mastery judgment. [Reviewed readiness](design/release-0.2.4/readiness-reviewed.png).

A separate live-provider session used the current development application, fresh browser storage, and the configured local proxy displaying `gemini-3.8-flash-high`. The goal was beginner everyday Yoruba greetings with diagnostic-first instruction. Three diagnostics came before the lesson. Uncertainty responses led to a simple morning greeting lesson, with translations and elder/peer context rather than code or acoustic modelling. A deliberately casual greeting for a grandmother received a retry offer; revealing the explanation led to substantive correction. A live walkthrough returned to the original submitted answer and tutoring position. A simpler guided greeting for an uncle was marked supported, with no independent readiness credit. A fresh classmate scenario was graded separately as one independent application, with correct-answer tutoring. [Walkthrough](design/release-0.2.4/yoruba-help.png), [supported answer](design/release-0.2.4/yoruba-supported.png), [fresh answer](design/release-0.2.4/yoruba-independent.png).

This is a scripted UX check, not a learner trial or a native-speaker audit of Yoruba accuracy, dialect, cultural register, or pronunciation. Some generated language advice is categorical; native-speaker/domain review remains necessary before claiming linguistic accuracy. The numeric case is deterministic; the Yoruba case is provider-backed. Neither measures human retention or comparative teaching effectiveness.

## Additional fixes found during this check

- Plan approval acknowledges a completed pre-teaching diagnostic instead of offering another placement quiz.
- Revealing feedback after the first miss no longer displays the same original guess as a second submitted retry. Actual distinct retries retain both answer records. Historical data stays intact.

## Checks and packaging

409 frontend tests across 59 files pass; two native Rust tests pass. TypeScript and the production web/Mac build pass. Existing bundle-size warnings remain. Version fields agree at 0.2.4.

The Mac app is ad-hoc signed, not Apple-notarized. The ZIP was extracted and its app signature verified; its executable SHA-256 matches the built executable. The DMG passes `hdiutil verify`. SHA256SUMS covers both downloads. The local app is updated, with a backup; the already-running process was left open. Browser flow verification used current source, not a claim that the running Mac process had restarted.

ElevenLabs is an optional Settings → Plugins integration using each user's own Keychain credential. No user key or generated audio is included in the release. The nontechnical check did not invoke ElevenLabs or change saved personal topics. GitHub publishing uses the existing authenticated GitHub CLI because the Composio CLI reported no connected GitHub toolkit; no Composio write was attempted.
