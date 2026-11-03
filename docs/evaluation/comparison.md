# LearnForge / LearnHarness comparison

Prepared 1 November 2026. A later [live native-app walkthrough](live-2026-11-01/report.md) now records one exploratory percentage case, including reproduced LearnForge defects. It used different models and did not complete matched teaching cycles or involve human learners; it does not establish an overall winner. The preparation and boundary experiment below retain their original scope.

The [3 November same-model app walkthrough](live-2026-11-03/report.md) uses fresh isolated sessions and the same requested/response-reported model ID. Upstream quota interrupted teaching, so it remains a partial comparison. It records diagnostic differences, a verified direct-question navigation repair, and stronger saved support-evidence guards; no learning winner is claimed.

Follow-on implementation: [question trust and recoverable feedback](../question-trust.md) adds a separate review gate to LearnForge's session/revisit surfaces. The results below describe the earlier pure authoring-boundary experiment, not that new gate or a live comparison.

## What we can conclude now

Both local applications can accept a structurally valid question with a false answer key. The experiment deliberately injects “2 + 2 = 5” and a single-select question with two positive-number answers. Both validators accept them. Both reject a key referring to a nonexistent option. These four fixtures test the boundary's responsibilities; they are not a sample of generated lessons and must not be reported as an accuracy rate.

LearnForge's boundary is `validateLearningCheck` in [checks.ts](../../src/services/learning/checks.ts). LearnHarness's tested boundary is its probe schema plus `quizInputProblems` in `src/core/question-core.ts`. The test does not cover either app's complete generation, tool retry, rendering, or readiness pipeline. An independent semantic checker could catch some errors; another model's agreement would still require evaluation against known answers.

This is a shared product priority, rather than evidence that one app teaches better. LearnHarness [issue #417](https://github.com/amosblomqvist/learnharness/issues/417) proposes answer-key verification. Its [issue #419](https://github.com/amosblomqvist/learnharness/issues/419) proposes a simulated-learner evaluation. The issue author's reported model-judge results are not our observations or validated human outcomes.

## Versions and completed checks

| App | Local version | Source revision | Work inspected |
| --- | --- | --- | --- |
| LearnForge | 0.2.2 | `b2f946f63141edd529f93791dc59079447977a5e` | Learning checks, written grading, post-answer teaching, separate help, session restoration, paper figures, existing pilot protocol |
| LearnHarness | 0.3.8 | `d9452abc275f8aa16c71680440c05e6b5b8b67cd` | Question schemas and grading, chat API lifecycle, teaching methodology, local README and smoke setup |

These are the checked-out revisions, not a promise about either project's latest release. New evaluation files make the LearnForge working tree dirty; the production validators were not modified. The [captured contract result](question-contracts-2026-11-01.json) also fingerprints their source files. No LearnHarness files were edited.

| Observation | Evidence | What it does not establish |
| --- | --- | --- |
| LearnForge has post-answer teaching for correct, wrong, unknown and disputed responses | `answerTutoringPrompt`, production rendering and existing tests | Whether explanations actually repair a misconception |
| LearnForge help is separate from progression and its request excludes the committed answer key | `sessionHelp.ts`, restoration and scoped-cache tests | Whether a live hint leaks the answer through inference or fits the learner's level |
| LearnForge has app-owned paper figures with meaningful bounded state changes | State-model validation, renderer and existing QA fixtures | Whether generated figures are accurate, clear, preferred, or improve transfer |
| LearnHarness has a distinct probing/teaching design and persistent graph infrastructure | Local README, methodology and chat/session code | Placement accuracy or superiority of its knowledge representation |
| Both checked question boundaries validate structure without establishing truth | Four deterministic injected fixtures | Frequency of errors in actual generated questions |

Passing test counts are software verification, not comparative scores. Run commands below reproduce the narrow experiment.

## Shared task pack

[task-pack.json](task-pack.json) contains three draft cases: Go channel handoff, a changing percentage base, and an everyday visit planned from a fictional museum guide. The Go case uses the [language specification](https://go.dev/ref/spec#Channel_types) and [send semantics](https://go.dev/ref/spec#Send_statements); it makes no scheduler-order promise. The other cases define their rules in the supplied reference and have independently calculable outcomes.

Each case contains a tutor brief, a misconception, an “I don't know” response, a visual-help request, a baseline, fresh transfer, a delayed check, and reviewer criteria. Reference grounding, goal drift into technical material, and explanations of changing state are intentional tests of previously reported LearnForge failures. This is test data, not hardcoded production curriculum.

The answer oracles are authored drafts, **not yet independently domain-reviewed**. A domain reviewer must approve them before judging learning. Language learning needs an additional native-speaker-reviewed pack; this pack cannot answer whether LearnForge teaches Yoruba well. It also does not evaluate full curricula or all pages.

## Reproduce preparation without model calls

Use Node 22.18 or newer, the installed dependencies in both local checkouts, and a new output directory:

```sh
npm run eval:contracts
npm run eval:prepare -- --out /private/tmp/learnforge-comparison-run-01
```

If LearnHarness is elsewhere, append `--learnharness /absolute/path/to/learnharness` to either command. Preparation reads package versions, Git metadata and the task pack. It does not read credentials, browser profiles or learner databases, start applications, or contact a provider. Existing output directories are refused, preserving captured evidence.

Preparation writes:

- `manifest.json`: revisions, dirty flags, tracked-diff and task-pack hashes; model/settings controls start unset.
- `tutor-briefs.json`: only goals, prerequisites and reference text. This is the only pack material supplied to each tutor at session start.
- `observer-cards.json`: the testing procedure's misconception/help prompts and held-out questions, with no answer oracles. Keep outside the tutor conversation until the relevant step.
- `reviewer-only.json`: answer oracles and explanation criteria. Keep out of both tutor and simulated-learner context.
- `observations.json`: six blank app/case records. All ratings start `not-observed` with null scores; an unrun session is never scored zero or counted as a pass.

The files are a manual comparison kit. There is no live app adapter, automated learner, model judge or learning-score calculator in these commands. Copying a system prompt into a generic chat endpoint would evaluate that prompt component, not either complete product.

## First live comparison procedure

1. Use disposable workspaces/accounts in both apps, without personal topics or saved learning records. Record the exact build and manifest before the session. A dirty build needs its diff/artifacts preserved; a commit hash alone is insufficient.
2. Fill the manifest's provider, exact tutor model ID, reasoning level, auxiliary models, viewport and cost limit. Use the same main model, reference, time allowance and initial learner profile. Record settings the apps cannot match; fallback models and background calls count as confounds and cost. Do not silently replace a failed model.
3. Begin with **one case in each app**, at most 15 minutes or 12 learner submissions per app. Set a provider-side spend cap where available. These limits do not bound internal tool/subagent calls; if spend cannot be bounded, use a turn-by-turn supervised trial. No automatic retries after a failed turn.
4. Give only the tutor brief. Let the actual app conduct placement and planning. Capture visible questions, display order, committed keys/rubrics where inspectable, learner responses and tutor replies. Missing model or incomplete turn means incomplete evidence, not a teaching failure score.
5. Choose one response condition for the first pair. In later fresh, separately budgeted runs, exercise the remaining conditions: correct reasoning, the misconception, and “I don't know.” Use a response relevant to the current question rather than injecting an unrelated canned answer. A scripted wrong answer tests tutor behavior; it is not evidence that a person misunderstood. Correct selections without reasoning must not be treated as demonstrated understanding.
6. After submission, inspect whether the learner's answer and feedback remain findable while tutoring generates. Read the actual explanation for mechanism, a simpler example after a miss, and unfamiliar vocabulary. Do not reward verbosity or the number of UI panels.
7. Request the case's visual help while an answer is pending. Check that controls change a relevant modeled quantity/state, the explanation matches it, and returning preserves the question and draft. Check text alternatives and both paper appearances. A static figure can be useful; do not penalize it for correctly labeling itself static.
8. Test reload and a controlled provider failure only in the disposable session. Inspect draft, response, help, and position recovery. Record screenshots/timestamps for visibility and focus problems; a transcript alone cannot establish UI behavior.
9. Administer the held-out transfer question outside the tutor conversation. A separate reviewer evaluates the response using the oracle; the tutor must not grade its own teaching as the only authority. If teaching revealed that transfer case, mark it contaminated and replace it with a reviewed equivalent.

For a future driver, bind each reply to the specific submitted input: “idle” can precede registration of a turn. Stop on turn errors, follow actual shuffled option identities and exact multi-select sets, handle free-text questions, and wait for persisted plan artifacts. These are documented pitfalls in LearnHarness #419; this kit does not claim to implement them.

## Fixed review rubric

Use `0 = observed failure`, `1 = partial`, `2 = meets the criterion`, `not-observed = null`. Every non-null score needs a transcript quotation or timestamped UI observation and a short explanation. Treat a model judge as provisional, with its exact model and prompt recorded; blind app names for a human reviewer where feasible. Resolve disagreements against the source and learner response, rather than averaging them away.

| Dimension | Meets the criterion | Example failure |
| --- | --- | --- |
| Accuracy | Claims, question key and worked examples agree with the reference; reasonable ambiguity is acknowledged | False key, two defensible options in single-select, or an unsupported rule |
| Goal alignment | Scope, terminology and examples fit the learner's stated goal and prerequisites | An everyday goal becomes an engineering lesson |
| Misconception repair | Responds to the learner's actual reasoning, makes the distinction concrete and checks a fresh application | Repeats the same definition or invents a misconception from a guess |
| Pacing | One coherent reasoning unit at a time; examples remain attached to their explanation; learner controls continuation | Fragmented empty slides, a new check before feedback is digested, or a long unrelated lecture |
| Feedback visibility | The submitted answer, outcome and useful explanation are readily recoverable | Automatic replacement or manual scrolling to discover what happened |
| Help continuity | Help is available without losing the task/draft; supported practice is distinguishable | Help changes the question or counts as independent evidence |
| Visual meaning | A relevant representation, legible labels, explanation/text alternative and truthful controls | Decorative boxes, invisible text, or a button that only changes prose while promising simulation |
| Recovery | Reload/failure preserves work and exposes a clear recovery action | Lost response, duplicate grading or an unresponsive session |

Record factual defects and lost-work failures individually. Do not combine these eight ratings into a promotional “overall winner.” For baseline/transfer/delayed explanations use the [existing pilot's 0–2 explanation scale](learner-pilot.md), including unresolved judgments, and record help used separately.

## Human evidence remains a separate study

Use the [moderated pilot](learner-pilot.md) and [observation sheet](session-observations.csv) with consenting participants. Before comparison, add and independently review matched A/B task sets per subject, then counterbalance app and task order. Giving the same person the same case twice creates a second-exposure advantage; this three-case machine/observer pack does not solve that problem.

A scripted learner's transfer answer or an LLM asked to pretend 48 hours have passed cannot measure human transfer or retention. Delayed retrieval requires an actual later learner visit. No participants have been recruited, no reminders scheduled, and no learning outcomes recorded by this work.

## Product decision

Prioritize a bounded answer-key/ambiguity verification experiment alongside the planned paired sessions. Measure false approvals, false rejections, latency, provider failure behavior and cost against independently reviewed questions before making it a progression gate. Keep unresolved grading from advancing readiness. Preserve the current session/help stability while testing whether the tutor's explanation produces a fresh, unaided application.

The present answer to “Are we better?” remains **unproven**. The next useful evidence is a reviewed, same-model pair of actual app sessions, followed by learner observations—not more feature counting.

## Verification of this preparation

- LearnForge: `npm test` — 355 tests in 54 files passed.
- LearnHarness: `NODE_ENV=test node --import tsx --test tests/question-core.test.ts` — 69 tests passed. This is a narrow question-contract suite, not its full application suite.
- `eval:contracts` exercised the actual pure validation functions from both pinned checkouts and captured all four injected cases with source fingerprints.
- `eval:prepare` produced three tutor briefs and six unrun observation records. Smoke checks verified oracle separation, null scores and the percentage answer arithmetic. Preparing into the same directory was refused without replacing files.
- No production teaching behavior was changed, no model calls were made, and no live or human session results were entered.
