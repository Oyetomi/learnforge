# Live native-app verification: changing percentage bases

1 November 2026. One exploratory walkthrough, with agent-authored responses. This is actual provider-backed app interaction, not mocked UI, a model-prompt-only benchmark, or a human learning study.

**Decision: LearnForge has not earned an overall superiority claim. This walkthrough reproduces serious readability and feedback-consistency defects. Both apps adapt to a wrong response, through different learning flows.**

## Setup and limits

The same goal was entered into fresh sessions in the installed Mac applications: understand why increasing a price by 20% and then decreasing it by 20% does not restore it. The learner brief says basic multiplication is known, percentages are confusing, and requests a short diagnostic before teaching.

LearnForge displayed `gemini-3.8-flash-high` through Local proxy; LearnHarness displayed `gpt-6.1-sol`, `xhigh`, ChatGPT. Models/settings were not changed. These are display labels, not independently verified upstream model identities. Familiarity preferences caused LearnForge to use basketball examples. Existing personal lessons were not answered or edited; a new comparison topic/session remains in each app. Live Exa grounding was disabled in the new LearnForge brief; no narration requests were made.

Installed bundles report LearnForge 0.2.3 and LearnHarness 0.4.0. LearnForge was already running before this audit; its exact loaded executable revision was not established. The installed-file hash in [manifest.json](manifest.json) fingerprints the bundle on disk, not a proven running-process image. The local LearnHarness source checkout is 0.3.8 and must not be presented as the installed 0.4.0 implementation. The current dirty LearnForge source also includes changes newer than the running session. This is verification of the observed installed experience, not certification of every pending source change.

The question formats and prior teaching differ. Do not derive accuracy percentages, speed rankings, model superiority, or learning-effect sizes from this run. Native accessibility/input updates were sometimes delayed; only visibly committed answers and outputs are counted. Stopwatch-quality latency measurements were not made.

## Observed sequence

| Stage | LearnForge | LearnHarness |
| --- | --- | --- |
| Goal entry | Scope preparation, focused-lesson confirmation, plan approval, then explanation | Directly generated a diagnostic probe |
| Requested diagnostic first | Began by explaining the changing base and revealing the mechanism; not a closed-book baseline | Asked the final price for 100 → +20% → −20%, before instruction; options 100, 96, 104; confidence and reasoning available |
| Wrong response | Submitted written reasoning that equal percentages cancel and final price is 100 | Selected 100, with reasoning that percentages cancel |
| Response to error | Correctly identified changing bases, retained the written answer, generated tutoring with three parts, and paused for explicit continuation | Marked the original probe incorrect and subsequently asked a smaller prerequisite probe: how many dollars does 20% off 60 remove? Options 3, 20, 12 |
| Guided repair | After explicit “Try a guided step,” generated 50 → +10% → 55, asking whether the next discount exceeds 5; first arithmetic step exposed and practice labeled guided | Continued diagnosis rather than giving the full original explanation; the prerequisite probe was left awaiting an answer |
| Correct response | Selected visible option A: more than 5 because discount uses 55. Marked correct and explicitly said supported success needs a fresh case before readiness | Not submitted/observed in this walkthrough |
| Post-correct tutoring | Generated a relevant mathematical explanation, but called the selected answer “Option b,” contradicting visible option A | Not observed; no completed teaching or transfer cycle was scored |

LearnHarness's follow-up took long enough to remain pending across several inspections, then completed. That observation is not a comparable latency score: configured model/reasoning and stages differed. An attempted Stop used an expired accessibility element and failed; refreshing revealed the completed second probe. No cancellation success is claimed and no generation was left visibly running at the end.

## Reproduced LearnForge defects

1. **P1 — Currency breaks prose, questions, feedback, and tables.** Dollar-prefixed prices are consumed as math delimiters. Normal phrases become tightly set italic math without word spacing; literal backslashes and TeX escape sequences appear in the worked explanation and table. This happens before grading and again in both wrong- and correct-answer tutoring. [Initial lesson](forge-explanation.png), [worked example](forge-worked-example.png), [correct feedback](forge-correct-feedback.png). Source inspection finds unconditional `remarkMath` in `src/components/chat/MarkdownView.tsx`; `VisualRichText.tsx` has only a narrow currency-range exclusion. Fix the shared currency/math boundary and add examples from this run, rather than relying on prompt wording alone.
2. **P1 — Tutor answer letters disagree with displayed choices.** The selected guided answer was shown as A and marked correct; post-answer teaching said “Option b is correct.” Its calculation was substantively right (10% of 55 = 5.50), so this was a label contradiction, not a demonstrated wrong answer key. Tutor context should use the final rendered option mapping or refer to answer text instead of internal option IDs. [Captured feedback](forge-correct-feedback.txt).
3. **P2 — Diagnostic intent is lost in focused-lesson onboarding.** Despite the explicit diagnostic-first request and uncertain starting point, the default focused path taught the mechanism before its first assessment. The assessment therefore cannot establish an uninstructed baseline. Make that choice explicit and honor the learner's stated request; do not claim every focused lesson should require placement.
4. **P2 — Nested pacing and figure overflow remain.** The interface simultaneously shows outer question/feedback slides, tutoring parts, and derivation steps. The worked example required scrolling inside the session, and its starting-state math had horizontal overflow. An app-owned paper figure exists, but that does not establish readable visual teaching. [Worked-example screenshot](forge-worked-example.png).

## Verified strengths

- The wrong written response received specific changing-base feedback, not a bare incorrect badge.
- The submitted answer remained available during tutoring generation; the app did not silently replace it with a new question.
- The observed tutoring paused for explicit continuation and offered a genuinely smaller guided example after the misconception.
- Correct supported practice was identified as supported and did not immediately establish readiness; the UI still showed “Building evidence.”
- LearnHarness honored diagnostic-first intent, rendered the observed currency amounts readably, and adapted the next probe to a simpler prerequisite.

These are observations from one case. They do not establish either app's overall pedagogy, long-term retention, reliability across subjects, or correctness of generated visuals.

## Automated checks

- Current LearnForge working tree: **401 tests across 58 files pass** (`npm test`). This includes newer source than the running app and did not catch the live defects above.
- Local LearnHarness 0.3.8 source checkout: **69 question-core tests pass** (`node --import tsx --test tests/question-core.test.ts`). This is a narrow local-source check, not a test of the installed 0.4.0 binary.

Passing these checks is not evidence that either app teaches better.

## Repair follow-up

The [repair delivery](../../learning-verification-repairs.md) addresses currency boundaries, future tutor answer references, diagnostic-first focused planning, embedded figure navigation and feedback typography. It records production-component browser checks and a rebuilt installed Mac app; it is not a new live same-model comparison. The observations above preserve the original failure evidence.

## Next acceptance check

Repair currency rendering and option mapping, then replay this exact case in the rebuilt app. Follow with a controlled same-model pair covering a complete teaching cycle, an “I don't know” response, side-help continuity, recovery, and fresh unaided transfer. Keep model settings and prior knowledge explicit. Human delayed retention remains unmeasured and requires an actual later learner visit; an agent pretending time has passed cannot substitute for that.

LearnHarness also publicly describes visual explanations and interactive demonstrations in its [README](https://github.com/amosblomqvist/learnharness#how-it-works), and its current repository lists KaTeX/math support. Earlier claims that LaTeX/interactive visuals alone give LearnForge a unique advantage were too broad.
