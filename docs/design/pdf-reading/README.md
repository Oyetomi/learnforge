# PDF reading companion verification

5 November 2026. The screenshot uses the production reading components with an authored Everyday Money PDF. Tutor replies are offline fixtures, not a benchmark of provider quality. No private source document or book cover is bundled with this fixture.

![Reading companion with actual first-page thumbnail and chapter index](reading-companion.jpg)

Reproduce by starting Vite and opening `/scripts/screenshots/pdf-reading.html` on a disposable origin. Generate the authored PDFs with `python3 scripts/evaluation/pdf-curriculum-fixtures.py`; reconnect the matching file (the fixture expects the five-page contents version named `Everyday Money.pdf`). Use a separate origin from personal learning data.

Verified in the browser:

- Original PDF and first-page thumbnail survive refresh.
- A pending choice selection restores without creating another question.
- Submitted answer and complete tutoring restore together; new practice requires an explicit action.
- Walkthrough opens alongside/over the activity according to width, then returns to the same saved answer.
- At 390 px, the page has no horizontal overflow. Learning tables keep their own horizontal scrolling when needed.
- Actual local Rust textbook: 731 pages, 481 bookmark entries, 24 main chapters, physical PDF 517 mapped to printed 493. The cover renders from the real first page. Its source bytes and cover were not sent to a provider or committed.
- The long-book index locates the current chapter, offers search, and scrolls within the contents list while the cover remains visible.
- Chapter selection opens its page in the picker and preserves prior reading stops.

Automated checks cover page-only extraction, page-label offsets, cancellation/cleanup, range splitting, unavailable text, IndexedDB transactions, storage failure, rollback after failed outline creation, resume, document identity, owned deletion and protection from stale writes after deletion. Source boundaries apply to question generation/review, written grading, tutoring and all three help types. These checks do not establish learning effectiveness or automatic synchronization with an external PDF reader.
