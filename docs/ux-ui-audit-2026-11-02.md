# UX/UI audit — 2 November 2026

This pass covered first-run onboarding, the learning session, curriculum navigation, topic management, code practice, saved explanations, and all three settings sections. Production components were exercised in browser fixtures with authored examples, plus the real empty app on a separate localhost origin. Existing learner topics and saved preferences were not changed. Plugin switches were tested as unsaved drafts and cancelled.

## Fixes

| Finding | Result |
|---|---|
| Even a one-sentence question context forced a separate reading stop. | Short context and small snippets stay beside the question. References longer than 420 characters or 10 lines retain a reading screen. Guided cues continue to stay with their question. |
| A brief unheaded introduction became a whole lesson slide. | An introduction of up to 240 characters joins the first meaningful section. Long introductions, fences, and subsequent headings remain intact. |
| Disabled plugins showed their complete configuration forms. | Exa and native ElevenLabs configuration use labelled disclosures, opening when enabled. Users can also open connection settings before enabling. Disabling preserves saved keys. Shorter descriptions remove repeated device-voice notices and API jargon from the overview. |
| Exa's switch was named only “Enable,” making it ambiguous to assistive technology. | Its accessible name is “Enable Exa Neural Search.” Browser checkbox interaction was verified by that name. |
| The new-topic web-source prompt assumed programming interests. | It now asks “Want to learn from web sources?” |

These changes preserve explicit answer review, readiness gates, source material, code highlighting, and the current typefaces. They introduce no fixed subject curriculum.

## Coverage

| Surface | Checks performed | Result / boundary |
|---|---|---|
| Empty workspace and header | Desktop and 390px window; new-topic entry; empty track picker; Escape and focus return | Controls remain reachable; no horizontal document overflow. |
| New topic | Real first-run form; source-material disclosure; narrow layout; close without saving | Goal remains primary, optional sources stay secondary. AI suggestion/placement requests were not completed in this pass. |
| Learning session | Production ChatPane with authored short context; intro folding; question focus; explanation access | Short reference shown next to question without “Continue to question.” First teaching section contains the brief introduction. |
| Choice / written / feedback | Authored pending, busy, written-answer and submitted-answer states | Answers, reasoning controls and feedback remain readable; feedback waits for Continue. Full provider tutoring quality is outside this UI fixture. |
| Curriculum | Map, outline, second-module preview, narrow outline and inspector focus | Preview identifies its module and prerequisites; browsing does not establish competence or unlock assessed practice. |
| Topics | Long title; open permanent-delete confirmation; cancel and focus return | Warning and actions fit narrow window. No permanent deletion performed. |
| Code practice | Production editor; mocked Run result; Tests and Output tabs | Results remain separate from tutor readiness. No remote executor or package installation tested. |
| Saved explanations | Production session history; Timeline and Study sheet tabs | Both views accessible; export controls visible. Download/Anki import not exercised. |
| Derivations | Saved-derivation empty state | Clear generation action; no unrelated worked example inserted. |
| Rich content | Markdown table, KaTeX, Java highlighting, SVG wrapper | Content rendered with separate code and math typography. This is not validation of arbitrary generated SVG/HTML. |
| Learning / AI settings | Desktop, 900×600 and 390×844; navigation and footer visibility | Forms fit tested sizes. No credentials saved or provider sign-in performed. |
| Plugins | Disabled overview; enable Exa expands; labelled checkbox; cancel restores saved draft | Browser Exa behaviour verified. ElevenLabs native disclosure changed in source; native Keychain/voice service was not manually retested. |

The browser viewport override was reset after testing. Screenshots use authored QA data, not learner records.

## Validation

- `npm test`: **413 tests passed across 59 files**. Added integration coverage for short versus long references and regressions for intro grouping.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Existing large-chunk warnings remain.
- Follow-up at the user’s request: `npm run tauri -- build --bundles app` passed. The bundle was ad-hoc signed, verified, and installed at `/Applications/LearnForge.app`; all four installed file hashes match the build. The previous app is backed up under `.lazyweb/install-backups/before-typeset-figures-595053a098/`. The running session was left open; reopen the app to load the update. No new GitHub release was published.

## Evidence

- [Short reference beside the question](design/ux-audit-2026-11-02/short-reference.jpg)
- [Introduction with the first teaching section](design/ux-audit-2026-11-02/lesson-introduction.jpg)
- [Compact plugin overview](design/ux-audit-2026-11-02/plugins-collapsed.jpg)
- [Plugin overview in a narrow window](design/ux-audit-2026-11-02/plugins-narrow.jpg)

## Remaining verification

Live suggestion → placement → plan approval, packaged authentication, native ElevenLabs/Keychain, actual execution services, file import/export round trips, and generated interactive simulations need dedicated end-to-end checks. Content quality and learning effectiveness require real learner evaluation. This audit does not claim that every provider response or possible state is flawless.
