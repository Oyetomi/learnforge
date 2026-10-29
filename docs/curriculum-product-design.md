# LearnForge: full curricula in one learning flow

Product design proposal · 29 October 2026 · **Approved direction**

Implementation update: the initial curriculum flow is now built. See [release notes and validation](curriculum-release.md). The prototype below remains a separate design artifact with authored examples.

**Confirmed direction:** one entry flow. Broad goals create a curriculum; narrow goals create a focused lesson. The learner can correct the proposed scope before starting. This is the user's explicit choice.

## 1. Recommendation

Keep the learner's original goal intact. “Data structures and algorithms in Go” should produce a coherent path through that subject, rather than require choosing one disconnected suggestion. “Why does this pointer assignment fail?” should lead to a focused explanation and check.

Build **an approved curriculum with an adaptive teaching route**. The curriculum answers “What am I working toward, and what does it include?” The tutor answers “What will help me next, and why?” Map exploration is free; assessed progress comes from evidence, not clicks.

A full curriculum means complete coverage of an agreed, bounded outcome. It does not mean everything ever written about a field. Make depth, exclusions, and evidence requirements visible. Do not market an AI-generated outline as an accredited qualification or proof of competence.

## 2. Research and limits

Research combined five Lazyweb desktop searches, two selected education screenshots, live public roadmap.sh inspection, primary teaching-design guidance, accessibility guidance, and LearnForge's current code. It did not include paid/logged-in competitor sessions or learner outcome studies. These are design hypotheses to validate, not evidence that LearnForge teaches better.

| Evidence | Observed principle | Proposed application | Limit |
| --- | --- | --- | --- |
| [roadmap.sh AI](https://roadmap.sh/ai), inspected 29 October | Goal entry supports roadmap, course, guide and quiz formats | Keep goal entry direct; recommend scope without making learners choose an artifact format first | roadmap.sh already has AI learning; a graph alone is not a differentiator |
| [Computer Science roadmap](https://roadmap.sh/computer-science), live map and node drawer | Broad coverage, selectable nodes, resources and AI teaching actions coexist | Use a curriculum overview plus unit inspector; keep one recommended next action | Public UI inspection does not establish its assessment quality |
| [Codecademy Code Foundations](https://www.codecademy.com/learn/paths/code-foundations), Lazyweb screenshot | Syllabus and outcomes communicate scope before enrollment | Review outcomes and modules before starting | Archived public landing page; not verified as current logged-in UX |
| [Brilliant course overview](https://brilliant.org/courses/quantum-computing/?from_llp=technology), Lazyweb screenshot | Course overview and visible lesson sequence have distinct roles | Separate orientation from the daily learning surface | Visual reference only; do not copy locks or infer adaptivity |
| [CMU alignment guidance](https://www.cmu.edu/teaching/assessment/basics/alignment.html) and [ASCD Understanding by Design](https://files.ascd.org/staticfiles/ascd/pdf/siteASCD/publications/ASCD_UBD_whitepaper.pdf) | Outcomes, assessment and teaching activities should align | Define demonstrable outcomes and assessment intent before generating lessons | Teaching-design guidance is not a product efficacy trial |
| [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) | Worked examples, retrieval, spacing and verbal/visual representations have distinct instructional uses | Choose representations for the concept and evidence of difficulty | Evidence strength varies by recommendation and context |
| [WAI treeview pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) | Focus, selection and hierarchical navigation require deliberate behavior | Provide a semantic outline alongside the visual map | A prerequisite DAG is not a tree; cross-links need additional explanation |

[Private research collection](https://www.lazyweb.com/agentic-search/a573ae63-4fe1-416f-8e76-1f2b0fe474b5). Local visual report: [report.html](../.lazyweb/design-research/full-curriculum-2026-10-29/report.html). All selected references are desktop/web. No screenshot was uploaded from LearnForge to the research service.

## 3. What changes from today's experience

Today, interest suggestions encourage narrowing first. The course generator then builds a flat provisional track of 1–8 milestones. A larger milestone limit would make a longer list, not a curriculum.

| Today | Proposed behavior |
| --- | --- |
| Broad goal becomes several competing topic suggestions | Broad goal becomes one draft curriculum with a stated destination |
| A roadmap is a small set of lesson nodes | Overview shows modules; opening a module reveals units and prerequisites |
| Opening a node can look like advancing | Preview, start learning and demonstrated understanding are distinct |
| Adaptive repair can feel like another technical topic | A short repair has a plain-language reason and explicit return point |
| Every new topic starts from scratch | A curriculum retains scope, evidence and a resumable next step across sessions |

Reuse the existing teaching flow, answer tutoring, question focus, tables, safe illustrations, math, optional coding practice and saved explanations. A curriculum organizes that experience; it does not introduce another tutor tab or separate teaching mode.

## 4. Entry and setup

1. **Ask what the learner wants to do.** Accept broad goals, precise questions and references in the same entry. File grounding remains optional.
2. **Propose scope, visibly.** “This looks like a full path through …” or “Let's focus on …”. Offer Full curriculum / Focused lesson as a correction, not two separate destinations. Ambiguous goals get one useful clarification, not a silent classifier decision.
3. **Clarify the outcome.** Ask the minimum: desired ability and starting point. “I'm not sure” is valid. Time budget is optional; no mandatory calendar setup.
4. **Offer a short placement check.** Show its expected length, allow skipping, preserve answers. Self-report is provisional. A diagnostic can recommend challenge checks for familiar material; it cannot silently award mastery.
5. **Review the plan.** Show modules, outcomes, assumed prerequisites, excluded scope and draft quality status. Allow depth/scope edits and regeneration of affected sections. Approve the outline before beginning.
6. **Start the first useful unit.** Generate its teaching content on demand. Do not wait for a whole textbook to generate.

Examples use the same architecture:

- “DSA in Go”: algorithm selection, implementation and trade-off reasoning at an agreed depth; Go is a chosen medium, not an app-level curriculum branch.
- “Everyday Yoruba for a beginner”: practical communication goals and relevant listening/speaking/reading activities; never silently reinterpret this as acoustic engineering or programming. If reliable audio/assessment is unavailable, disclose the limitation and adapt scope.
- “Explain this equation”: a focused lesson with optional expansion later.

## 5. Curriculum structure

```text
Learning goal + learner context + approved scope
└─ Curriculum version
   └─ Modules: meaningful capability groups
      └─ Units: small outcomes with evidence requirements
         └─ Activities: explanation / example / model / check / application
            └─ Evidence: attempts, support used, feedback, readiness review
```

Maintain two separate relationships: **prerequisite** (required prior ability) and **recommended sequence** (a useful route). Not every neighboring module needs a hard dependency. Cross-cutting skills can link to multiple units without duplicating credit.

A unit needs stable IDs, outcome, prerequisites, assessment intent, source references, content status, evidence links and next-step rationale. Modules summarize units; they are not giant lessons. Evidence is append-only history with superseded/disputed evaluations retained visibly, rather than erased when a plan changes.

Use two state axes:

- Plan/content: draft → approved; lesson not prepared → preparing → ready/needs review.
- Learning evidence: not checked → practising → demonstrated; supported practice is recorded separately. Optional later retention evidence can indicate a revisit is useful.

“Read” and “visited” never mean demonstrated. Placement, supported attempts and independent applications remain distinguishable. A graph position is not an assessment result.

## 6. The roadmap workspace

**Daily default:** resume the current unit with a small curriculum breadcrumb and one clear next action. The full map is an orientation tool, not a permanent wall beside every question.

**Overview:** show module-level relationships, current location and a restrained evidence legend. Reveal unit detail on selection. Provide Fit/current-location controls only if actual pan/zoom is introduced. Avoid a tiny, unreadable all-node canvas.

**Inspector:** outcome, what is included, prerequisites, evidence and “Why this next?” Selecting future material previews it without changing the active unit. “Check whether I'm ready” offers a diagnostic instead of a manual completion checkbox. Learners can explore material before earning credit; requirements constrain credit and recommendations, not curiosity.

**Outline:** the same information as semantic headings, lists, buttons and disclosures, with cross-links named in text. It is a first-class alternative, not a second-class accessibility fallback. A custom ARIA tree requires its full keyboard contract; do not add tree roles to ordinary buttons.

**Progress:** show counts with explicit denominators such as “2 of 12 outcomes demonstrated” and “1 practising”. Approval and scope changes may change the denominator; show that change. Avoid equating time spent or AI confidence with learning percentage. Estimates are optional, approximate and revisable.

## 7. Adaptive route without losing the destination

A wrong answer should first lead to tutoring: connect feedback to the submitted answer, explain the smallest missing idea, use a concrete example or useful visual, then offer another application. Do not immediately generate a new module or replace the answer history.

When repeated evidence points to a missing prerequisite:

1. Explain it in learner language: “Let's practise how a value changes before returning to this problem.”
2. Propose a small repair unit with one named return point.
3. Keep the original outcome and approved curriculum visible.
4. Check transfer back to the original task before recommending advancement.
5. If the repair is not helping, offer another explanation/representation or a scope conversation. Do not create an endless chain of prerequisites.

Starting policy proposal: one active repair detour at a time; a second unsuccessful repair cycle prompts reassessment instead of automatic syllabus expansion. This is a product guardrail to test, not a research-derived universal threshold.

Significant additions/removals require a visible plan revision with rationale and learner approval. The AI can adjust activities and ordering within the approved scope without interrupting every turn. Existing readiness review remains necessary; correct-answer counts alone do not certify a unit.

## 8. Teaching, visuals and interaction

Each unit uses the existing lifecycle: orient → explain/model → attempt → inspect tutoring → apply again → readiness decision. The learner controls transitions. Keep the submitted answer and feedback accessible while tutoring prepares; no automatic move to new material.

Choose representations by the learning task, not permanent “visual learner” labels: comparison tables for distinctions, manipulable models for causal behavior, plots for quantities, diagrams for structure, math for relationships, examples and spoken practice when appropriate. An interactive control must change a meaningful state or prediction and visibly explain the consequence. A box-and-arrow diagram is not automatically an interactive model.

Retain JetBrains Mono for the interface, Google Sans Code for code, and proper mathematical typesetting. Use compact metadata, readable text hierarchy, restrained surfaces and a warm current-state accent. State labels and shapes accompany color. Motion should explain a route change, stay brief, and respect reduced motion. Navigation moves focus to the new heading; previewing a future node does not unexpectedly launch a lesson.

Each screen has one primary vertical scroll owner. Large code/tables may scroll horizontally inside their block. The teaching panel should not become one endlessly growing curriculum document. Keep one active learning task and an explicit way back to context.

## 9. Content quality and failure behavior

Generate a bounded skeleton first; validate outcomes, coverage, prerequisite cycles, duplicates, level and assessment alignment before approval. Generate and validate the next lesson just in time. Show preparation status without claiming that every future lesson is ready. Preserve the approved outline and current work if generation fails or is cancelled.

Keep the original goal and chosen depth in every generation context. Include sources and coverage limitations; validate that cited uploaded passages exist. Subject drift triggers a correction path, not a forced restart. Regeneration changes the affected draft, not unrelated evidence. Deleting a curriculum must remove its owned content/evidence through the existing deletion policy, while shared source ownership needs an explicit rule before implementation.

Grounding reduces some errors; it does not guarantee correctness. Before release, sample curricula across technical, language and general-interest subjects for expert review. Unsupported modalities must not produce fake assessments (for example, claiming spoken-language competence from multiple choice alone).

## 10. Existing-code implications — future work

| Area | Current constraint | Proposed implementation boundary |
| --- | --- | --- |
| `src/services/ai/interests.ts` | Always suggests 3–5 directions | Add scope proposal preserving original goal; suggest branches only when useful |
| `src/components/curriculum/NewTopicModal.tsx` | Suggestion → draft track → placement → approval | Reuse entry; route curriculum review to a full workspace surface |
| `src/services/ai/curriculum.ts` | Flat 1–8 milestone schema and parser | New bounded outline contract; do not simply increase the cap |
| `src/services/ai/types.ts`, `src/types/index.ts` | Flat tracks/milestones | Separate curriculum/module/unit identities and versions from activity content |
| `src/services/learning/placement.ts` | Tentative placement; starts at an available root | Add explicit challenge/diagnostic route; preserve evidence rules |
| Learning evidence and tutoring services | Independent applications plus AI readiness review | Reuse evidence; add outcome coverage and transfer checks |
| Persistence and deletion | Topic-owned data | Versioned migration and complete ownership cleanup across curriculum children |

Existing tracks become single-module curricula only through a tested compatibility migration. Preserve IDs, attempts, sources and active sessions. Do not auto-expand old topics, overwrite user material or reset progress. Map old evidence to matching outcomes conservatively; unmatched evidence remains visible history. This document does not change these files.

## 11. Delivery scope

**First useful release:** unified scope proposal; outcome clarification; editable approved module/unit outline; prerequisite validation; module overview and equivalent outline; unit inspector; one resumable teaching session; evidence-based progress; bounded repair with return; draft/preparation/error states; safe persistence/migration/deletion.

**Later, after validation:** curriculum revision comparisons, richer cross-module transfer tasks, optional integrated retention, reliable subject-specific modalities, learner-controlled scheduling, imported curricula with provenance.

**Defer:** public marketplace, certificates, streak economy, collaborative graph editor, arbitrary AI-generated widgets, one-shot generation of hundreds of lessons. Optional retention stays optional; no review modal is restored.

## 12. Acceptance and evaluation

Before implementation is accepted:

- A broad goal retains its identity through setup, plan and every unit; a narrow question avoids unnecessary curriculum setup.
- Both coding and noncoding goals use the same structure; no technical-language default leaks into general learning.
- The learner can state the destination, current unit and reason for the recommendation without opening a large map.
- Previewing never changes the active task or awards credit; a readiness challenge has explicit evidence requirements.
- A repair has a comprehensible reason, bounded scope and visible return point.
- Answers, feedback and tutoring remain reviewable; no auto-advance hides a result.
- Failed/cancelled preparation and app restart preserve the approved plan and current attempt.
- Outline and map expose equivalent outcomes/status; keyboard, reduced motion, large text and small windows remain usable.
- Migration, plan revision and deletion preserve or remove the correct owned data without silently resetting evidence.

Run a moderated exploratory pilot with broad-goal beginners, experienced learners taking a challenge route, and learners studying a nontechnical topic. Ask them to create a path, explain its scope, preview a later unit, resume learning and recover from a gap. Record setup abandonment, navigation mistakes, unplanned scrolling, comprehension of progress and repair-return success. Use alternate application tasks and a later recall/transfer check to investigate learning; satisfaction and completion clicks alone are insufficient. A small pilot finds usability problems, not statistical superiority over another product. Define efficacy study sample size and success thresholds before making learning claims.

## 13. Review artifacts and decisions

[Clickable prototype](design/curriculum-prototype/index.html) uses **authored sample fixtures**, not AI generation or a stored learner profile. It demonstrates setup, scope switching, outline review, map/outline selection, future-unit preview, repair return and a focused session. The Yoruba fixture describes outcomes in English; it is not validated language instruction. The prototype intentionally omits a working diagnostic and content editor; the product requirements above still require them.

Confirmed: one unified learning flow. Proposed for review: stable approved scope, adaptive route, module overview, visible evidence, freely previewable future material and bounded repair. After this direction is reviewed, implementation should begin with the curriculum contract and a thin end-to-end flow, not a graph redesign in isolation.


## 14. Prototype verification

Reviewed in the in-app browser on 29 October 2026 at its default 1280 × 720 viewport. Checked full-curriculum setup and approval; starting-point preservation; focused entry with a nontechnical fixture; an explicit message for unsupported custom prototype inputs; future-module preview without changing the current recommendation or evidence; map/outline switching; readiness and repair explanations; and focus moving to selected-module details. Saved [overview](design/curriculum-prototype/overview.png) and [repair preview](design/curriculum-prototype/repair-preview.png) screenshots.

This verifies the design artifact's navigation, not generation quality, assessment validity, full accessibility compliance or learning outcomes. No production app changes or native rebuild were made for this proposal.
