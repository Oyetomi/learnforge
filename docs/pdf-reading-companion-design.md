# Studying alongside a PDF

Status: first implementation, 5 November 2026. PDF curricula now offer a reading companion, local original-file storage, saved page-range stops, and a cover/contents rail. An external reader’s open page is still updated manually.

## The experience

Offer **Study alongside this PDF** from the book’s existing curriculum. Keep the book as the reading surface and LearnForge as a companion for understanding and practice. A compact reading-position control shows the current section, PDF page/range, and printed page label when available.

1. The learner sets their current page or recently read range. For an external viewer this is an explicit update; do not imply automatic synchronization without a supported reader integration.
2. Suggest the next small conceptual section to read. Use headings and paragraph/example boundaries rather than a fixed page quota. The learner can change the range, read ahead, or stop.
3. On **Check what I read**, ask for a brief explanation, prediction, or application grounded in that range. Avoid revealing later sections or delivering another full lecture before checking understanding.
4. Hold the submitted answer and feedback in view. If the reasoning reveals a gap, explain that distinction with a small example, ask a guided follow-up, and return to a fresh independent application. If the answer is supported by an open book, record that support.
5. Recommend continuing, revisiting a named passage, or stopping for the day. Save the reading bookmark, covered range, unanswered work, support used, and the next suggested action.

An **I’m stuck here** action is available before the check, with page-linked help. It should not erase the question, change the approved curriculum, or create a new lesson flow. Optional later recall can revisit previously studied ideas at the next session.

## Pacing and agency

Keep reading coverage separate from learning evidence. “Read through page 92” records exposure; it does not award mastery. The tutor recommends the learning sequence using the learner’s reasoning and fresh applications. The learner controls the external book and may preview later pages. Reading ahead must not unlock competency credit.

Adapt the size of the recommended reading section to observed difficulty. A dense example may deserve its own stop; a familiar section may need only a short check. Avoid interpreting one wrong answer as a prerequisite deficit, or repeatedly expanding the prerequisite chain. Ask a clarifying question when the misconception is uncertain, explain plainly, and return to the original passage.

The current page is a boundary, not a topic replacement: preserve the book’s broader curriculum while keeping the immediate session local to what the learner has covered. Make any use of a later prerequisite or background passage explicit and optional.

## Necessary implementation

- Add a durable local document store. The current importer keeps File/Blob access in memory during import and saves bounded chapter excerpts after approval. A companion must retain/reconnect the original document to retrieve arbitrary later pages across restarts. Use a local file/Blob store, not localStorage or a base64 string. Never publish the source PDF.
- Keep document identity, physical page indexes, printed page labels, contents hierarchy, and reading bookmarks together. Handle changed/unavailable files by asking to reconnect the source while preserving progress.
- Retrieve the exact requested page range on demand through the chunked PDF reader. Current chapter excerpts alone cannot establish what an arbitrary page says. Clearly report image-only or unreadable content.
- Pass covered ranges and spoiler boundaries through question generation, help, feedback, and source review. Page claims must come from document metadata, not model guesses.
- Reuse the existing held-feedback, supported-practice, independent-evidence, and explicit-continuation machinery. Add a reading-linked entry point and compact context control rather than another collection of competing lesson modes.

## Evidence and limits

The IES [Organizing Instruction and Study to Improve Student Learning practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) supports spaced review, quizzing to revisit content, worked examples alongside independent problems, and explanatory questions. The guide assigns different evidence levels to these recommendations; it does not validate a specific page quota, number of questions per stop, or this proposed UI. Section-sized reading stops and the proposed controls are product-design choices that need usability and learning evaluation.

## Acceptance checks

- An external-reader user can set a page, study it, stop, and resume later without losing their place or draft.
- A chapter’s printed page number is never silently treated as the physical PDF page index.
- A question only depends on the covered range and explicitly supplied background. A later-page answer cannot leak into a pending check.
- Reading, supported answers, and independent understanding remain distinguishable.
- Feedback does not disappear before the learner continues; help returns to the same page-linked activity.
- Test with a dense technical page, ordinary prose, an image-only page, and a book whose printed/PDF page numbering differs. Compare the reading interruption cost with the current chapter-based flow before making it the default.

## Implemented behavior and remaining evaluation

Open **Study alongside this PDF** from a PDF curriculum, or **Resume reading study** in the book rail. Newly approved PDF curricula retain the original File/Blob in IndexedDB, outside the localStorage track JSON. Existing curricula ask for the original PDF once. Reconnection checks the PDF fingerprint when recorded; older outlines use filename, page count when available, and mapped page bounds. The first physical page becomes a local thumbnail; rendering failure uses a document placeholder and never prevents importing a valid PDF.

The contents panel comes from the document outline/contents mapping. It highlights a chapter containing the saved range; a PDF-backed lesson can instead display its source page, explicitly labelled **Lesson source**. Choosing a chapter opens its physical starting page in the companion’s page picker. This selection does not submit answers, generate a question, or award understanding.

Reading stops retain complete page text, a pending question, submitted answers, support use, tutoring and side questions. Existing question controls keep answer drafts on-device. Restoring a stop does not regenerate its question or feedback, or advance the activity; an uncached question preflight may still run. A check starts only on **Check what I read**. The default is open-book supported practice; the learner can put the book aside before a check, or mark that they referred back. Help and the covered-text disclosure preserve the question and count as support. A miss follows the shared guided-example policy; successful supported work returns to an independent opportunity. Continue remains explicit.

Page-range requests use chunked local reads. A range exceeding the 14,000-character teaching budget stops at a complete page boundary and displays the actual covered range. A single page larger than this budget needs a pasted passage in a focused lesson; the file itself is not rejected. Image-only pages are identified honestly; their figures are not interpreted. Physical PDF indexes and document-provided printed labels stay distinct. No later chapter reference is attached to the reading tutor, question preflight, written grading, help or feedback.

Next-reading suggestions use actual mapped subsection boundaries when available. After difficulty or supported work, the suggestion stays small and recommends revisiting the covered passage or trying without the cue. This is a conservative pacing heuristic, not a validated estimate of reading difficulty. Reading ahead remains available and does not update curriculum readiness. Optional delayed recall, automatic external-reader synchronization, OCR and a learner study comparing interruption costs remain follow-on work.

IndexedDB storage is device/origin-local and subject to available space and browser data clearing. Storage failures are shown with retry; they are never reported as successful saves. Deleting a topic also removes its original PDF, thumbnail, reading stops, and owned UI drafts. See [MDN’s IndexedDB guide](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) for the persistence and transaction model.
