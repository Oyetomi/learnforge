# Adaptive teaching within one learning flow

1 November 2026.

LearnForge should explain an unfamiliar idea, help the learner practise it, then establish whether they can use it independently. Repeated questions are useful only when the learner has enough foundation to reason. Switching to a Japanese-branded teaching mode would add another decision without solving this problem.

## Research and product decision

Shu–Ha–Ri offers a useful metaphor: learn an established form, explore variations, then work independently. It is a traditional developmental framework, not evidence that a particular AI tutor teaches better. [A practicing teacher's explanation](https://zenways.org/video/20240818-shu-ha-ri-stages-of-learning/) provides context for the stages.

The more directly applicable instructional evidence supports alternating worked examples with problems, combining graphics and explanation, and connecting concrete and abstract representations. The [Institute of Education Sciences practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) rates these recommendations as supported by moderate evidence. [MIT's worked-example guidance](https://tll.mit.edu/teaching-resources/how-people-learn/worked-examples/) explains why examples help novices and why support should fade as learners become more capable.

Japanese mathematics instruction also uses *neriage*: discussing and comparing solution approaches to develop understanding. [Fujii's account of task design](https://link.springer.com/chapter/10.1007/978-3-319-09629-2_9) describes its classroom context. A solo tutor comparing the learner's approach with an explicitly authored alternative is a product adaptation, not a demonstrated equivalent of classroom discussion.

The resulting design uses a single session. Teach, guide, fade support, and test a changed situation as the current concept requires. These are instructional choices, not personality types or global learner ranks. Plain labels explain the next activity. No new modal, carousel, Japanese terminology, or obligatory mode selection is introduced.

## Runtime decisions

| Evidence for the current concept | Next activity | Boundary |
| --- | --- | --- |
| No attempt yet | Concrete explanation and a complete small example before a different application | The example must not solve the pending check |
| Incorrect or “I don't know” | Post-answer teaching, then one smaller guided decision | Put the cue inside question context; guided success is supported practice |
| Correct with guidance, help, retry or low confidence | Fresh case at the same conceptual difficulty, without the cue | Help stays available; its use remains recorded |
| Independent success | Change a relevant condition or context while applying the same principle | Rewording or renaming alone is not transfer |
| Independent applications including a successful changed situation | Tutor readiness review of actual evidence and reasoning | A count, activity label or passing code test cannot authorize advancement alone |
| Unresolved or disputed feedback | Neutral teaching and a clearer fresh check | No diagnosis or prerequisite detour from the unresolved judgment |

The policy is deterministic and derived from saved attempts separately for each concept. No additional AI planning request is needed to choose a teaching strategy. The existing bounded prerequisite planner runs only after a miss with actual written reasoning, and retains its existing limits. Unknown answers and uncertainty alone do not justify another prerequisite.

3 November follow-up: independent evidence also checks saved help IDs directly, even when a legacy record omits its `assisted` flag, and excludes contradictory non-correct grading. Help/retry metadata caps retention credit at supported practice. The final lesson action opens the question directly; exploring the prepared figure is an explicit optional action. The [partial same-model walkthrough](evaluation/live-2026-11-03/report.md) records the live navigation verification and provider-quota limitation.

The app owns practice metadata; the generated-question parser does not accept a model's claim that its question is guided, independent or transfer. Guided attempts are marked supported on submission and also excluded from independent evidence using saved question/attempt metadata. New typed practice requires an independent transfer attempt before readiness review, and the review must cite it. The tutor must still assess whether the task actually tests transfer and whether the reasoning supports readiness. Metadata does not verify either fact.

Legacy saved attempts retain their earlier evidence contract. Reloading preserves practice metadata, answer feedback and reading position. Unanswered new questions do not retroactively revoke an old readiness decision. Fresh errors or disputed attempts can still make earlier readiness evidence insufficient.

## Capabilities retained

The change retains substantive post-answer teaching, explicit continuation after feedback, choice and free-response questions, first-error retry, confidence and written reasoning, the side-question composer, source grounding, paper figures, interactive models, tables, LaTeX, derivations, code execution, study notes/export, optional retention, and prerequisite gates. Figures remain illustrative unless actual execution evidence exists. Text does not establish pronunciation, listening or physical performance. No topic or programming language is hardcoded into the policy.

The existing question badge now distinguishes Guided practice, Independent practice and New situation. The final tutoring part names and explains the next activity. Whole-example reading and continuous reading remain available; guidance changes do not rebuild the lesson into another slide sequence.

## Verification and limits

391 tests across 57 source files pass. TypeScript, production web and macOS app builds pass. Automated checks cover the difficulty-to-guidance-to-independent-to-transfer-to-review sequence, renewed errors, unsupported prerequisite inference, uncertain judgments, saved legacy work, supported-evidence exclusion, required transfer citations, independent topic histories, question labels, and the teaching-only boundary. Concept lessons permit complete demonstrations while active coding assignments retain analogous guidance.

The isolated `.lazyweb/adaptive-teaching-qa/` fixture mounts the production App with authored offline responses and prevents real provider calls. Browser checks exercised an incorrect answer, automatic tutoring with retained answer, explicit continuation, supported guided success with no independent credit, reload restoration with no repeated tutoring request, independent success, a changed-whole application, readiness approval, and withdrawal after disputed feedback. A subsequent unknown answer returned to guided practice with its cue directly beside the question, without another reference slide. [Guided question](design/adaptive-teaching/guided-question.png), [retained feedback](design/adaptive-teaching/feedback.png), [fading support](design/adaptive-teaching/fade-support.png) and [disputed feedback](design/adaptive-teaching/disputed.png) use authored test data; they establish interaction behavior separately from generated-content quality.

The rebuilt app is installed at `/Applications/LearnForge.app`, with an installation backup retained. Its ad-hoc signature and all bundle-file hashes were verified against the build. The running learning session was left open; quitting and reopening loads the new build.

This implements teaching decisions and evidence boundaries. It does not prove better retention or learning than LearnHarness, guarantee every generated task is pedagogically sound, or validate Shu–Ha–Ri as superior to Socratic dialogue. A learner evaluation should measure delayed recall and novel application, not clicks, completion rate or the apparent polish of an explanation.
