# Guided visual learning: implementation and verification

2026-10-27. Companion to [visual learning research](visual-learning-product-research.md) and [product experience research](product-experience-research.md).

## Product decisions

A useful visual lets a learner change something, predict an outcome and observe the consequence. A labeled sequence alone is insufficient for concepts involving state, memory or causality. Presentation preferences remain editable choices, not permanent learning-style classifications. Independent understanding still requires fresh assessment without the same support.

### Production interactions

- **Go slice memory:** drag the start and length bounds; directly edit array cells; observe the pointer, length, capacity and slice contents; copy a separate header; mutate shared storage; append within capacity; trigger allocation of a second array. The two views update from the same state. Re-slicing `s` leaves the copied `t` header unchanged. A short highlight marks changed header fields; reduced-motion preferences disable it.
- **Go channels:** choose zero, one or two buffer slots; send and receive values; observe waiting goroutines, occupied slots, FIFO delivery and a blocked send completing when a receiver frees space. One sender and receiver, open integer channels only. Nil channels, `select` and closing are outside this model.
- **Go HTTP response writer:** choose body writing and final status operations in either order. Watch which operation commits the final status, inspect the resulting body and operation history, then reset to compare. Headers, informational statuses and network timing are explicitly omitted.
- **Phrase construction:** select chunks into a phrase, remove and reorder them, check the order and read the meaning of each part. Correct diacritics remain intact. This is supported practice; there is no audio, listening assessment or pronunciation scoring.
- **Smaller representations:** phrase parts, comparisons, flow and state steps remain available when these genuinely explain the idea better. The tutor is instructed to prefer manipulation when an applicable owned model exists, without forcing a Go simulation onto another subject.

These are a first set of reusable teaching models, not an arbitrary simulation generator for every subject. The learner's original interest, current goal and active question remain in the tutor context. Existing courses can request a visual through **Show me visually**; new plans can include optional visuals when useful. Editing preferences does not regenerate existing lessons or rewrite saved history.

## Slides instead of a scrolling lesson

The session presents one active information unit. Prose, code examples, visuals, question references, choices and feedback appear in separate views with explicit continuation, back links and progress indicators. Code fences remain intact. Long question context is read first, then the choices have their own slide; the reference remains one click away. Optional confidence and reasoning fields are collapsed until requested. Earlier conversation is available through saved history, rather than stacked under the current activity. The compact composer leaves more room for the slide. Transitions respect reduced motion. Unusually long individual content can still scroll for accessibility; content is never clipped merely to hide a scrollbar.

## Progressive feedback

Answer submission now saves and grades the attempt locally, brings the feedback into view and stops. The review panel includes the selected answer and committed explanation. The learner explicitly chooses **Continue**, **Work through this**, or **Review readiness** before the next tutor request starts. A wrong answer can still trigger a focused prerequisite repair, but only after that continuation. The composer remains available for an explicit follow-up question.

Clarifying a question and requesting a visual cannot replace its pending check, create a coding challenge or approve advancement. Fresh assessment requests suppress visual scaffolding in that response. Viewed or manipulated visuals are recorded against the current unanswered check, retained on its attempt, and excluded from independent-success counts. Supported visual practice itself never grants competency approval.

## Preferences and accessibility

Settings now has Learning and AI connection sections. Learners can choose visual explanations automatically, on request or text first; brief or deeper explanations; progressive steps or an overview; and optional familiar examples. Preferences persist locally and are included in tutor requests. They do not change the learning subject or replace evidence of competence.

Controls are native buttons, ranges, selects and number inputs with accessible labels. Text equivalents, reset actions and explicit next-step controls accompany diagrams. The UI renders owned components from validated descriptors; model output cannot inject executable markup, JavaScript or arbitrary SVG. Unknown model names and malformed descriptors are rejected. Go-only models are rejected for general or other-language courses.

## Scroll and map repairs

The interest dialog now has one vertical scroll owner: the form. The header remains fixed and all bottom actions remain reachable. Other standard dialogs follow the same fixed-header/scrolling-content structure.

The sidebar uses the current compact path. Expanded-map connections attach outside node bounds, adjacent links travel through layer gaps, and long prerequisite links take separate outside lanes. Repeated “enables” labels were removed. Narrow windows use a vertical graph; initial fitting preserves readable node sizes.

## Verification

- **129 tests passed across 22 test files.** Includes descriptor validation and escaped text, partial-stream hiding, persistence and text export, preferences, support evidence, independent-readiness rules, route geometry, channel rendezvous/FIFO/full-buffer behavior, HTTP final status ordering, slice aliasing/reallocation, offset bounds, direct cell editing and empty-slice safety.
- TypeScript and the production Vite/Tauri build pass.
- Browser checks use isolated fixture data and the production components. Verified feedback waits without AI generation until continuation; fresh checks close earlier support; saved preferences survive reload; the interest dialog has exactly one scrolling content element, with its bottom actions reachable and header fixed.
- Verified HTTP body-first versus status-first outcomes; phrase-order error and correction; unbuffered handoff and a full two-slot channel buffer; slice copy, mutation, append and reallocation; direct cell editing; **physical dragging** of slice bounds; a 390px iframe viewport for the model layout.
- Live desktop check: reopened the rebuilt app with its existing track intact. The configured AI provider selected and generated the owned slice model for the current slice-header lesson. The pending question remained available. A native copy-header click updated the header and shared-cell labels. The subsequent direct-manipulation revision adds drag bounds and editable cells.

Screenshots are in [visual-learning-release](design/visual-learning-release/). Browser fixture examples are synthetic teaching data, not learner mastery records. Prototype and fixture files under `.lazyweb/` are ignored and are not bundled into the desktop app.

## Source of model semantics

- [Go slices: usage and internals](https://go.dev/blog/slices-intro): slice descriptors, shared backing storage and growth. The example growth capacity of 8 is illustrative, not an allocation guarantee.
- [Go specification: channel types](https://go.dev/ref/spec#Channel_types): buffered and unbuffered communication.
- [Go HTTP ResponseWriter](https://pkg.go.dev/net/http#ResponseWriter): body writes, implicit status and final status commitment.

The broader learning-science and design evidence, including limitations of learning-style classifications, is recorded in the companion research document.


## Permanent topic deletion — explicit product preference

Delete replaces the earlier archive/remove behavior. The confirmation names the topics and explains that their lessons, conversations, progress, drafts and review cards will be erased from LearnForge. No Undo or Restore is offered after confirmation. Legacy removed topics are summarized behind a single **Clear permanently** action; clearing them requires the same deliberate confirmation rather than silently erasing previously recoverable data during an app update.

Topic deletion cancels pending generation for the active topic, clears its draft timers and ownership-scoped storage, removes custom track metadata and switches to a remaining topic or the empty workspace. Review cards now carry session/milestone ownership; deletion also handles legacy cards associated with a deleted session's known lesson titles, while preserving cards from other sessions.

Verified in the isolated browser workspace: Cancel retains the topic; confirmed deletion removes a non-active topic while preserving the other; deleting the last active topic leaves an empty workspace; reload does not restore deleted topics. Database tests verify persistence, card cleanup, drafts/progress cleanup, preservation of other topics and same-title ownership boundaries. Existing personal topics in the desktop app have not been purged automatically; the user chooses **Clear permanently** to confirm that action.
