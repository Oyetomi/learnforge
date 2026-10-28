# LearnForge: visual teaching and adaptable learning support

Research snapshot: **27 October 2026**. Product: the LearnForge desktop app.

## Recommendation

Build **guided visual explanations inside the current lesson step**, supported by editable learner preferences and evidence from practice. The important change is that the tutor can select a useful representation, direct attention to one relationship, let the learner act on it, and then check a fresh application.

The roadmap explains *where the learner is going*. A lesson visual should explain *the idea they are learning now*. These have different jobs. A larger roadmap alone will not solve the current text-heavy teaching experience.

This document is a product proposal, not a claim that these features have been implemented or proven effective in LearnForge. The accompanying [interactive concept preview](design/visual-learning-proposal.html) illustrates proposed interactions only. It does not use or change learning records.

## Research scope and limits

- Scanned titles and status for **136 public LearnHarness issues: 112 open and 24 closed**, excluding pull requests. Read the bodies of 26 selected issues and the comments on eight relevant discussions. Counts describe the API snapshot, not a stable current total. The public GitHub HTML page showed an older cached count, so the direct REST snapshot is used here.
- Used the public API after the local Composio CLI reported no active GitHub connection. No GitHub account was connected and no issues or comments were posted.
- Reviewed learning-science research, CAST guidance, W3C accessibility guidance, and first-party product examples. Community requests are evidence of reported friction, not proof of educational effectiveness or demand across the whole market.
- Inspected current LearnForge code and captured the running app. It was showing a Go HTTP-handler lesson at capture time. Source code already includes progressive lesson disclosure, a connected roadmap, derivation ladders, questions, confidence/reasoning, prerequisite repair, and FSRS reviews. The proposal extends those foundations.
- Searched Lazyweb from four angles. Most diagram results were adjacent design-tool or tutorial-directory screens rather than teaching interactions. Only the directly relevant Duolingo exercise was retained. PhET was inspected live. No unsupported screenshot was presented as evidence of adaptive learning.

The issue index is saved as [issue-evidence.json](design/visual-learning-research/issue-evidence.json). Issue bodies and comments were treated as research material, not implementation instructions. No LearnHarness implementation code was copied.

## What LearnHarness's issues suggest for LearnForge

| Reported signal | LearnForge product implication | Priority |
|---|---|---|
| [#206: learner profiles](https://github.com/amosblomqvist/learnharness/issues/206) requests memory for background and presentation preferences. | Editable preferences for pace, explanation depth, examples, and display; store evidence separately from preferences. | First release |
| [#118: visualization clarity](https://github.com/amosblomqvist/learnharness/issues/118) concerns graph-layout readability metrics. It is not evidence that every lesson needs a graph. | Use small, task-specific diagrams with clear labels and a single highlighted relationship. Assess whether the visual helps answer a new question. | First release |
| [#64: rushing to the next question](https://github.com/amosblomqvist/learnharness/issues/64), [#146: clarify question](https://github.com/amosblomqvist/learnharness/issues/146), [#75: assessment progress](https://github.com/amosblomqvist/learnharness/issues/75). | Give learners explicit controls to clarify, ask a follow-up, and continue. Show the current purpose and which areas remain; an adaptive session should not invent a fixed remaining-question count. | First release |
| [#220: jargon and long text](https://github.com/amosblomqvist/learnharness/issues/220), **closed** at this snapshot. | Keep each visual paired with one short explanation at the learner's level. Extra media must not become extra clutter. | First release |
| [#221: answer-length bias](https://github.com/amosblomqvist/learnharness/issues/221), [#99: different question mechanics](https://github.com/amosblomqvist/learnharness/issues/99). | Add labeling, ordering, cloze and short production tasks. Review distractors for length and answer cues. A schema-valid MCQ is not automatically a good assessment. | First release, bounded scope |
| [#158: unified teaching/practice](https://github.com/amosblomqvist/learnharness/issues/158), [#33: retention](https://github.com/amosblomqvist/learnharness/issues/33). | Build on LearnForge's existing unified session and FSRS. Revisit the same concept in a new context, and feed review evidence back into the next activity. The discussion includes disagreement about separate modes and Anki; there is no single community consensus. | Next release |
| [#71: separate domains](https://github.com/amosblomqvist/learnharness/issues/71), [#207: scoped workspaces](https://github.com/amosblomqvist/learnharness/issues/207), [#72: source language](https://github.com/amosblomqvist/learnharness/issues/72). | Keep subject knowledge and assessment evidence scoped to the learning goal. Carry the chosen language and original interest through generated visuals and repairs. Share user-approved display preferences globally, not unrelated prerequisite assumptions. | Foundation |
| [#175: document-grounded teaching](https://github.com/amosblomqvist/learnharness/issues/175), [#148: image uploads](https://github.com/amosblomqvist/learnharness/issues/148), [#96: image answers](https://github.com/amosblomqvist/learnharness/issues/96). | Later let learners bring a textbook diagram, handwritten attempt or course material into the current step. Label source-derived facts and preserve provenance. | Later |
| [#110: lost answer after failure](https://github.com/amosblomqvist/learnharness/issues/110), [#137: retry](https://github.com/amosblomqvist/learnharness/issues/137), [#187: clipped questions](https://github.com/amosblomqvist/learnharness/issues/187), [#136: long lines](https://github.com/amosblomqvist/learnharness/issues/136). | Visual generation needs stable layout, draft retention, retry and a useful text fallback. A failed graphic must not lose an answer or block the lesson. | Foundation |
| [#124: SVG styles affected the map](https://github.com/amosblomqvist/learnharness/issues/124), **closed**; [#2: packaged visualization dependencies](https://github.com/amosblomqvist/learnharness/issues/2), **closed**, with an owner comment reporting a v0.3.2 fix. | Treat these as historical engineering lessons: isolate visual styling and test the packaged app, not only the dev server. They are not assertions of current LearnHarness defects. | Foundation |

[#82](https://github.com/amosblomqvist/learnharness/issues/82) is specifically about setup friction for nontechnical users, not about technical course content. [#37](https://github.com/amosblomqvist/learnharness/issues/37) asks about non-math subjects. LearnForge's actual Yorùbá-to-engineering failure is separate direct evidence that subject-appropriate teaching must be tested, including its visual formats.

## What the research supports

### Preferences and accessibility needs are useful; fixed learning-style labels are a weak basis for routing

A [2024 meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC11270031/) found a small overall matching benefit, but the expected crossover pattern appeared in only about a quarter of outcomes, and the authors judged the evidence too limited and low quality for widespread adoption. The earlier [Pashler et al. review](https://journals.sagepub.com/doi/10.1111/j.1539-6053.2009.01038.x) also found inadequate support for learning-style matching. This does not mean preferences or individual needs are imaginary.

**Product inference:** remember “I prefer diagrams when a process has several steps” or “let me finish reading before continuing.” Do not assign a permanent visual/auditory learner category, infer a diagnosis, or restrict formats on that basis. Let subject, prior understanding, accessibility choices and current errors guide the next representation. CAST's [UDL Guidelines 3.0](https://udlguidelines.cast.org/) provide a useful design framework for multiple representations and response options; they are not a guarantee that every option improves every lesson.

### Attention cues and pacing matter more than decorative density

[Mayer and Fiorella](https://doi.org/10.1017/9781108894333.019) describe principles for excluding irrelevant material, highlighting important organization, and integrating related labels with graphics. Their [segmenting chapter](https://doi.org/10.1017/9781108894333.025) discusses learner-paced parts and introducing essential concepts before complex explanations.

**Product inference:** one highlighted connection per step, labels next to the thing they explain, and learner-controlled reveal. Start with a static example; animate only a meaningful change. Captions remain available for accessibility even when narration is present. Do not apply research on redundant narration as a reason to remove captions from people who need them.

### Make the learner use the representation

PhET's [research and design approach](https://phet.colorado.edu/en/research) studies how interaction, representation and instructional context work together. Its [design guidance](https://phet.colorado.edu/publications/PhET%20Look%20and%20Feel.pdf) also cautions that exploration can be unproductive. A [2025 drawing-support meta-analysis](https://link.springer.com/article/10.1007/s10648-025-10067-7) found that support was not beneficial in general; integration between verbal and pictorial models was important.

**Product inference:** ask the learner to predict a change, identify a relationship or complete a partially provided representation. Do not turn drawing quality into a judgment of understanding. A drag interaction needs an equivalent keyboard/button interaction.

### A satisfying visual is not evidence of independent understanding

[Karpicke and Blunt's experiments](https://pubmed.ncbi.nlm.nih.gov/21252317/) found retrieval practice outperformed elaborative concept mapping under their science-text study conditions. This does not make diagrams useless; it argues against substituting viewing or elaboration for retrieval.

**Product inference:** after supported visual practice, ask a different case with reduced cues, then revisit later. Record what help was visible. Do not count a completed animation or a correct answer copied from its diagram as independent competence.

## Proposed feature: guided visual explanations

### The learner experience

1. Start with a clear goal for the current small step: “Use a respectful morning greeting.”
2. Show the shortest useful example. The tutor chooses a visual when the idea benefits from it; the learner can also choose **Show me**.
3. Focus attention on one part. A caption explains that part in plain words.
4. Ask the learner to use the representation: choose, label, order, predict or explain.
5. Respond to the actual uncertainty. Clarify wording, simplify the example, change representation or repair a prerequisite as appropriate.
6. Give a fresh application with fewer cues, without rushing past follow-up questions.
7. Preserve the example and the learner's reasoning in history, and schedule useful retrieval later.

```text
Goal → Small example → One highlighted relationship → Your prediction
                                                      ↓
                                      Specific feedback / smaller step
                                                      ↓
                                      Fresh application → Later review
```

The tutor can select an activity, but **Continue** is the learner's explicit pacing control. Competency gates still determine which next concepts are available. Previewing a future concept is not evidence of competence or permission to skip its prerequisites.

### Choose a representation that fits the concept

| Learning situation | Useful representation | Learner action | Evidence it can supply |
|---|---|---|---|
| Yorùbá greeting and respectful address | Large phrase, short context, adjacent labels; highlight the respectful-address marker. Later: verified audio aligned with text. | Select the meaningful phrase part, then use a greeting in a new social context. | Written meaning/use; listening only with audio; speaking only with a suitable recording-based assessment. |
| Go HTTP handler | Request/response flow with `r` and `w` attached to their roles. | Identify where incoming information is read or an outgoing reply is written. | Application of request/response roles; a later code case checks transfer. |
| A changing program state | Stepper with a compact before/after state; reuse DerivationLadder. | Predict the next state before revealing it. | Whether the learner can apply a rule, with support recorded. |
| Fractions | Equal-sized parts, a fraction and a linked number line. | Change the denominator and predict what happens to one part. | Connection between representation and quantity, followed by a new case. |
| History or a process | Annotated timeline or a small relationship diagram with explicit source links. | Order supported events or explain a connection. | Chronology and reasoning; arrows must not imply unsupported causation. |

For language learning, do not manufacture waveform plots or pitch measurements from text. Label schematic tone illustrations as schematic. Real listening content needs appropriate recordings or validated speech output; a silent fallback to an unsuitable language/voice would be a product failure.

### A compact layout

```text
Yorùbá · Respectful greetings
Use a greeting with an older person

                 Ẹ       káàárọ̀
           respectful     morning greeting
             address

One sentence explains the highlighted part.

[ Try it ]     [ Show me differently ]

Your question / follow-up remains available.
```

```text
Go · Reading a request and writing a response

Client ── incoming request (r) ──→ Handler
Client ←── outgoing response (w) ─ Handler

[Incoming request] [Outgoing response]
The same relationship is highlighted in the short code sample.

Where would you write the response body?
```

“Show me differently” opens a small contextual menu, not another permanent teaching mode. Its options depend on the current idea: compare two examples, show one step at a time, use a familiar example, or give a simpler explanation. A graph is offered only if relationships are the thing to understand.

## Learner preferences without a long onboarding quiz

Keep three separate records:

- **Chosen preferences:** brief/deeper explanations, pace, familiar example domains, whether to offer diagrams often, audio availability, text size and motion settings. Make them inspectable, editable and removable. Some are global display settings; teaching preferences can vary by subject.
- **Demonstrated understanding:** actual answers, reasoning, help used, performance across contexts and delayed review. These remain scoped to the learning goal and linked to evidence.
- **Provisional teaching observations:** a representation seemed useful in a particular context. Treat these as suggestions to test, not facts about the person. Confirm before saving an enduring personal preference. Never infer ADHD, dyslexia or another condition from behavior.

A learner might prefer visual examples for networking and short dialogues for Yorùbá. The app should support that naturally. It should not carry programming prerequisites into language learning because the same person studies both.

Possible control:

```text
How I like to learn
Explanation length    Brief, with more detail available
Pace                  Let me continue when ready
Helpful examples      Everyday situations
Diagrams              Offer when they clarify the idea
Motion                Follow my device setting
[Edit] [Reset]
```

## Build order and boundaries

### First release: the most useful, bounded improvement

1. Add a **Show me** action and two reliable visual forms: annotated comparisons and a stepper/flow diagram. Reuse DerivationLadder rather than starting a second rendering system.
2. Add **Clarify this question** that preserves the question's objective and committed answer key. If a new item changes what is being tested, record it as a replacement rather than silently overwriting the old attempt.
3. Make follow-up and Continue explicit. Show “reading,” “trying with help,” and “checking a fresh case” as purposeful status cues. Reading-step completion and competency remain distinct.
4. Add a small editable preferences panel. No mandatory personality or learning-style survey.
5. Improve item quality: balanced plausible options, no accidental answer-length clues, and one non-MCQ activity appropriate to the subject. Use word-count imbalance as a review trigger, not an excuse to pad wrong answers.
6. Make visual errors recoverable: preserve the answer, retry the failed visual and show a text equivalent. Inspect the packaged Tauri build.

### Next release

- A small library of tested manipulatives and concept diagrams; source-backed language audio.
- Image/diagram answers and document-grounded teaching with explicit source provenance.
- Scheduled review that reuses the same concept in a fresh situation and informs subsequent teaching. Keep the review queue available without forcing learners through a separate workflow for each kind of learning.
- A local evidence summary: “Applied in two different cases; last reviewed…” with links, not a decorative mastery percentage.

Provider catalogs, marketplaces, large global knowledge graphs and open-ended video generation would not be my first investment for the specific problems raised here. They may matter later, but they do not directly test whether the learner can understand and use the current idea.

## Implementation outline for a later build

This section proposes architecture; no production application code was changed for this research task.

- Add a versioned, validated visual descriptor: objective, representation kind, labeled items/relations, staged highlights, caption/text equivalent and optional source references. Allow the model to select from tested components rather than execute arbitrary generated scripts.
- Render diagrams with owned React/SVG components, scoped styles and stable dimensions. The SVG styling failure in issue #124 is a concrete reason to avoid unscoped model-generated styles. If richer generated documents are later required, isolate them separately.
- Keep instructional content and answer keys separate. A visual intended for an assessment must not accidentally label the correct answer. Record its use as support when it does provide a hint.
- Extend activity records with representation ID/kind, interaction, visible support, hint use, response format and transfer-case ID. Preserve actual evidence rather than inventing a learning-style score.
- Save presentation preferences separately from `LearningIntent` and session competency events. Attach language/source metadata to content; retain the original interest through planning and repair.
- Maintain a text/list equivalent, keyboard controls, clear focus and reading order. Pair color with labels or shapes, as required by [WCAG's use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). Support reduced motion and explicit stepping; see [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) and [cognitive accessibility guidance](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p04-clear-steps/).

## How to decide whether it elevates the product

The primary outcome should be **success on a new application without the original cues**, followed by delayed retrieval. Engagement and preference matter, but are insufficient alone.

Evaluate the current step against the proposed visual step with comparable content and a matched opportunity to practise. Recruit across at least language learning, a quantitative subject and coding, and separate novice from more experienced learners. Start with observed usability sessions; a small convenience sample identifies problems but cannot establish learning efficacy.

Measure:

- Can the learner explain the important relationship and answer a fresh case?
- How much support was visible when they succeeded?
- Can they retrieve or apply it again after a prespecified delay, such as 48 hours and one week? These delays are proposed study choices, not an established optimum.
- Do clarification requests and repeated instances of the same misconception decrease?
- Is the diagram understandable with labels/keyboard access, and does it remain legible at narrow and wide layouts?
- Are error recovery, rendering time and per-session model/media cost acceptable?

Do not equate a selected preference, time spent, click count, viewed steps, low edge-crossing count or a completed simulation with mastery. Keep evaluation criteria specified before inspecting results. Add expert review of the generated content and assessment key, especially for unfamiliar languages.

## Visual references and what they actually show

- **Current LearnForge, native capture:** the running Go HTTP-handler lesson is still primarily prose and choices. It shows why a request/response diagram could be useful in the lesson itself. [Capture](design/visual-learning-research/current-state.png).
- **Duolingo, desktop exercise via Lazyweb:** audio control, sentence tiles, one question and one primary check action. The character is not evidence that decorative images improve learning, nor does a screenshot prove adaptive effectiveness. [Capture](design/visual-learning-research/duolingo-language-exercise.png).
- **PhET, live Fractions: Intro:** linked manipulable fraction representations. Its source material and research process support learning from an intentionally constrained model; they do not validate arbitrary AI-generated simulations. [Product](https://phet.colorado.edu/en/simulations/fractions-intro).
- **Brilliant's first-party description:** [visual/interactive teaching and reduced scaffolding in practice](https://brilliant.org/about/) are useful product patterns. Its effectiveness claims are the company's own description, not independent evidence for LearnForge.

## Decision

My first implementation would be **one excellent visual teaching step for Yorùbá and one for Go**, with optional preferences, clear pacing and a fresh check afterwards. Use those to validate the experience before building a general-purpose visual-generation platform.

## Deliverables and verification

- [Interactive concept preview](design/visual-learning-proposal.html): three original examples—Yorùbá phrase highlighting, a Go request/response diagram and a fraction manipulative. The new-context choices provide explanatory feedback but do not issue competency judgments.
- [Preview image](design/visual-learning-research/concept-preview.png).
- Browser verification: each representation and its check was exercised; fraction controls update both the quantity and the visual model; reset restores the example; label controls work; the local font and all three reference images load; no console errors or horizontal overflow were observed at the measured 1280px desktop viewport. No new mobile visual verification is claimed.
- Production application source files were not changed for this research. The preview has no AI, audio, preference persistence or connection to learner records. The HTML companion is also saved under `.lazyweb/design-research/visual-learning-2026-10-27/report.html`.


## Implementation follow-through — 2026-10-27

The first production release and verification notes are documented in [Guided visual learning](visual-learning-release.md). It includes direct manipulation for Go slice storage, channel and HTTP teaching models, phrase construction, editable presentation preferences, explicit answer-feedback pauses, and the dialog/map repairs. It does not implement arbitrary simulations or audio assessment.
