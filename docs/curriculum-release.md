# Curriculum learning flow — implementation notes

29 October 2026. Implements the first curriculum flow from [the approved product design](curriculum-product-design.md).

## What is implemented

- One goal entry, with an AI scope recommendation the learner can override. Broad goals generate a bounded curriculum outline; focused goals prepare exactly one lesson. The original goal is retained.
- Starting-point and desired-ability context, optional file grounding, cancellable generation and locally saved goal drafts.
- Versioned curriculum → module → outcome-unit metadata. Structural validation rejects missing assessments, duplicate outcome text, unknown prerequisite references, unit/module cycles and oversized outlines. Structural validation does not establish expert-reviewed coverage.
- A wide outline review with editable outcomes, assessment intents, destination and exclusions. Optional placement samples up to three capability groups; placement does not award credit. Lessons prepared for placement are retained, but exposed placement questions are excluded from mastery practice.
- A curriculum workspace with a readable module map, an equivalent outline, unit-level outcome/evidence/prerequisite details, a current-unit recommendation and demonstrated-outcome counts.
- Future previews leave the active learning task unchanged. A prerequisite-check action targets an available foundation, then uses the existing fresh-practice/readiness process; it does not waive dependencies or award automatic placement credit.
- On-demand unit preparation through the configured AI provider. Preparation fills the saved runtime unit without changing its ID, approved outcome, prerequisite graph or prior evidence. Failure/cancellation leaves the outline intact; retry resumes that unit.
- Existing topics receive a pure single-module compatibility view. Their original IDs, messages, code drafts and progress remain in place. They are not expanded or regenerated. New plans seed all runtime unit IDs and prerequisite edges in one milestone storage snapshot.
- Repair detours retain their return point and approved curriculum context. Nested repairs, more than one active repair, and more than two repairs for the same parent are rejected; the tutor continues with smaller in-place teaching when a detour is unavailable. Repairs do not inflate curriculum coverage progress.

## Implementation boundaries

The curriculum definitions are generated for each goal, not supplied by a language-specific catalog. Coding and general subjects share the same plan contract. Existing execution services, syntax highlighting, safe visuals, math, written-answer grading and post-answer tutoring are reused.

`curriculumPlan.ts` owns scope/plan validation, compatibility, unit identity mapping and evidence-based progress. `curriculumOutline.ts` owns provider requests and on-demand preparation. Curriculum views handle presentation; existing learning evidence remains the authority for progression. The storage snapshot keeps template unit IDs separate from runtime milestone IDs.

This is an initial bounded curriculum release. Post-approval curriculum revision editing, curriculum quality audits, reliable spoken-language assessment and moderated learner-outcome evaluation remain follow-on work. An outline is not a qualification. Optional retention remains optional; no review modal was added.

## Verification

- TypeScript compilation and production build are checked for this release.
- Automated coverage includes invalid generated graphs, duplicate outcomes, original-goal preservation, nontechnical learning mode, legacy compatibility, prerequisite challenges, storage reload, complete deletion, bounded repairs and wrapped module-map routing.
- Browser QA uses an isolated localhost origin. Controlled fixture responses verify broad setup, optional placement, approval, future previews, on-demand preparation failure/cancellation/retry and reload persistence. Fixture content is explicitly labelled and is not embedded in the production curriculum generator.
- Final automated run: **257 tests across 38 files passed**. TypeScript and production build passed; the existing bundle-size advisory remains.
- Live local-provider validation generated a nontechnical drawing curriculum (5 modules, 10 outcomes), accepted it after a structurally incomplete first response was rejected, and prepared its first teaching unit through the same configured provider. No catalog or subject fixture was involved in that live request. A bounded automatic structural repair was subsequently added and covered by tests.
- Screenshots: [live curriculum](design/curriculum-release/live-curriculum.png), [equivalent outline](design/curriculum-release/live-outline.png), [first live lesson](design/curriculum-release/live-lesson.png).
- The current modality is text/choice and supported code execution. Practical, physical and spoken outcomes need additional evidence; the UI and tutor context now state this limit. This is not a learner-efficacy evaluation.

## Desktop installation

The Tauri release bundle built successfully (20.40 MiB). The installed copy at `/Applications/LearnForge.app` was updated, its local ad-hoc signature verified, and its four bundle-file hashes matched the rebuilt source bundle. The previous bundle is retained under `.lazyweb/install-backups/before-curriculum-26t1_hy9/`.

After reopening, the pre-existing native session resumed at the same saved answer and tutoring part. No QA topics or browser settings were copied into native storage. A later native observation also showed the new curriculum navigation in use.

The live provider additionally recognized a precise pencil-stroke question as focused, generated a single-concept plan, and opened a **1 of 1** lesson after approval. See [focused lesson](design/curriculum-release/live-focused-lesson.png). Live tests used nonprivate demonstration goals; controlled error/cancellation tests used explicitly labelled fixtures in a separate localhost origin.
