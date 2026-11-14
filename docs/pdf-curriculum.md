# Curriculum from a PDF’s table of contents

Choose **New topic → Add notes or a file → Choose local file** and attach a PDF. LearnForge reads document bookmarks first, then looks for an explicit printed contents listing in the opening pages. Review the detected chapters, choose your scope, check the physical PDF page ranges, and prepare a curriculum. The outline remains editable and requires approval before it is saved.

Main chapters appear first; in books divided into parts ("Part I", "Unit 2"), these are the chapters inside each part. **Show all sections** exposes the detailed bookmarks. Choosing a part replaces any of its chapters you had chosen (and the reverse), so the same pages are never taught twice. Front matter such as the cover and copyright page is not selected by default. You can replace a detected listing with pasted contents. Unresolved page ranges are labelled **outline only** until corrected; a heading is not presented as extracted chapter text.

## Large books

PDF imports have no fixed byte-size or page-count rejection. The browser’s File/Blob interface supplies only the byte ranges requested by PDF.js, in 64 KiB chunks. Opening a large book reads its structure and a short preview. Preparing the curriculum reads bounded excerpts from selected chapters, including chapters late in the book. It does not allocate an array of every page’s full text or send the complete PDF to the AI provider.

Actual capacity still depends on the device, PDF encoding, and available resources. Corrupt, inaccessible, encrypted, or image-only PDFs can fail. A stalled reader offers recovery; an import making progress does not receive a fixed total-time allowance. Cancellation destroys the worker and stops further range reads. Image-only documents need an OCR/text-searchable copy; LearnForge does not perform OCR yet.

## Source and teaching behavior

The approved plan stores the selected section names and physical page ranges. Each generated unit must map to selected section IDs, and every selected section must be covered. A structurally invalid or incomplete mapping receives one repair attempt, then fails rather than saving a misleading plan. A unit is prepared using its own saved chapter references, including chapters beyond the first six sources.

Only bounded extracted text is included in the topic JSON and provider payload. On approval, the original PDF is saved separately in local IndexedDB storage for later page-range reading; its first page supplies the book thumbnail. The original file and thumbnail are not sent to the tutor. Excerpts are capped and explicitly marked when incomplete. Bookmarks can define scope even when chapter text is unreadable, but this remains **outline-only** material. Generated examples and background must be distinguished from source-specific claims. Source text and headings are untrusted data, never instructions to the tutor.

## Read the book in the app

From the curriculum, choose **Read PDF pages …** under your next step, or **Start reading** in the book sidebar. Pages open pre-filled for the current unit. Set the physical PDF page range and save your place. The pages appear in the reading screen at reading width, drawn as you scroll; **Check what I read** stays pinned at the bottom. During a check the pages are hidden; **Look back at these pages** shows them again and counts as supported practice, as does the plain-text view. If the original PDF isn’t connected, read the pages in your own viewer instead. **Check what I read** asks before explaining; your submitted answer stays visible while tutoring is prepared. Hints, walkthroughs and visuals come from the same **Help** menu as lessons and keep the activity in place. An open book or a hint counts as supported practice; you can put the book aside for an independent check.

The book sidebar shows the first-page thumbnail, your saved position, and the chapter contents (searchable for long books). Its highlight locates you in the document, without marking the chapter as learned. Printed labels remain separate from PDF page indexes. If you also read in another app, it is not monitored: change the range when you read ahead. Existing PDF curricula need the original file reconnected once because older imports retained only excerpts.

Your bookmark, reading stops, submitted work and feedback resume across app restarts. The original PDF and reading data are removed when the topic is deleted. Available device storage and browser data clearing still apply. See the [reading companion design and limits](pdf-reading-companion-design.md).

One curriculum remains bounded to 48 selected sections / 48 observable outcome units, grouped into at most 10 modules. This is an approval/teaching scope constraint, separate from accepting large PDF files. For larger scopes, select a part of the book for the current plan. Chapter ordering and inclusion are scope choices, not evidence that the learner has mastered those chapters. Existing independent-practice and tutor-review progression still applies.

## Verification · 5 November 2026

- Actual browser uploads of authored PDFs with bookmarks, a printed contents page, no contents, and image-only pages.
- Printed pages 1–3 correctly resolved to physical PDF pages 3–5 in a document with front matter. A deselected chapter was omitted from the generated outline.
- Missing contents offered a pasted-list fallback and explicit unresolved ranges. An image-only upload produced an OCR explanation while preserving previously attached material.
- The user’s 731-page Rust textbook loaded locally, exposing all 481 bookmark entries and 24 main chapters. The file was used only for local import verification; it was not uploaded to a model/provider or committed to the repository.
- Automated reader tests cover cancellation, worker cleanup, unreadable documents, bookmark destinations, printed-page offsets, late-chapter extraction, and chunked transport. A simulated 3 GB / 6,001-page input checks that size/count guards do not reject it; this is not a claim that a real 3 GB document was benchmarked.
- Curriculum tests reject omitted and invented chapter mappings, retain source metadata through structural repair, and verify later units receive their own chapter text.

The UI’s generated-outline checks use authored offline AI responses, not a live model or an evaluation of learning quality.

To reproduce the authored PDFs: `python3 scripts/evaluation/pdf-curriculum-fixtures.py`. To open the offline UI fixture: start Vite, then visit `/scripts/screenshots/pdf-curriculum.html` in a disposable origin/profile. The fixture seeds local test records and intercepts AI calls; use a separate browser origin from personal learning data.

Implementation uses Mozilla’s [PDFDocumentProxy API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html) and [PDFDataRangeTransport](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDataRangeTransport.html). The worker, character maps, and standard-font data are bundled locally, with their upstream license.
