import React, { useState, useEffect } from "react";
import { mainPdfSections, sectionsFromContents, withPageRanges, type PdfBook } from "../../services/learning/pdfContents";
import "./pdf-chapters.css";

const SOURCE_COPY: Record<string, string> = {
  bookmarks: "Chapters come from the PDF’s bookmarks.",
  "contents-page": "Chapters come from the printed contents page. Check the page ranges.",
  pasted: "Using your pasted contents. Add page ranges so the chapter text can be read.",
};

export function PdfChapterPicker({ book, selected, enabled, busy, onChange, onSelected, onEnabled }: {
  book: PdfBook; selected: string[]; enabled: boolean; busy: boolean;
  onChange: (book: PdfBook) => void; onSelected: (ids: string[]) => void; onEnabled: (enabled: boolean) => void;
}) {
  const [manual, setManual] = useState("");
  const roots = mainPdfSections(book.sections);
  const [manualError, setManualError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editPages, setEditPages] = useState(false);
  useEffect(() => { setManual(""); setManualError(""); setShowAll(false); setEditPages(false); }, [book.name]);
  const visibleSections = showAll || !roots.length ? book.sections : roots;
  const unresolved = book.sections.some(s => selected.includes(s.id) && (!s.pageStart || !s.pageEnd));
  const pagesEditable = editPages || unresolved || book.contentsFrom === "pasted";
  const sourceCopy = SOURCE_COPY[book.contentsFrom || ""] ?? "No contents were found. Paste the contents listing below, or use this PDF as reference notes.";

  return <section className="pdf-chapters" aria-label="PDF curriculum chapters" tabIndex={-1}>
    <div className="pdf-chapters-heading">
      <strong>Build a curriculum from this PDF</strong>
      <span>{book.pageCount} pages</span>
    </div>
    <p>
      {sourceCopy}
      {book.previewOnly && " Text from the chapters you pick is read when you prepare the curriculum."}
    </p>
    {book.contentsTruncated && <p role="status">This document has an unusually large contents list. Some entries are not shown; replace the listing to include other chapters.</p>}
    {book.sections.length > 0 && <>
      <label className="pdf-chapters-toggle"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => onEnabled(e.target.checked)} /><span>Use selected chapters as the curriculum outline</span></label>
      {enabled && <>
        <div className="pdf-chapters-toolbar">
          <span aria-live="polite"><strong>{selected.length}</strong> of {book.sections.length} selected</span>
          <button type="button" disabled={busy} onClick={() => { onSelected(roots.map(s => s.id)); setShowAll(false); }}>Main chapters</button>
          <button type="button" disabled={busy || !selected.length} onClick={() => onSelected([])}>Clear</button>
        </div>
        <div className="pdf-chapters-view">
          {book.sections.length > roots.length && <button type="button" className="pdf-chapters-link" disabled={busy} aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>{showAll ? "Show main chapters only" : `Show all ${book.sections.length} sections`}</button>}
          {!unresolved && book.contentsFrom !== "pasted" && <button type="button" className="pdf-chapters-link" disabled={busy} aria-pressed={editPages} onClick={() => setEditPages(v => !v)}>{editPages ? "Done editing pages" : "Edit page ranges"}</button>}
        </div>
        <ol className={`pdf-chapter-list ${pagesEditable ? "is-editing" : ""}`}>{visibleSections.map(section => {
          const missing = !section.pageStart || !section.pageEnd;
          return <li key={section.id} style={{ "--chapter-depth": Math.min(section.level, 3) } as React.CSSProperties}>
            <label className="pdf-chapter-choice"><input type="checkbox" disabled={busy} checked={selected.includes(section.id)} onChange={e => onSelected(e.target.checked ? [...selected, section.id] : selected.filter(id => id !== section.id))} /><span>{section.title}{missing && <small>Page range needed to read this chapter</small>}</span></label>
            {pagesEditable ? <div className="pdf-chapter-pages"><label>From<input type="number" min={1} max={book.pageCount} disabled={busy} value={section.pageStart || ""} aria-label={`PDF start page for ${section.title}`} placeholder="?" onChange={e => {
              const value = e.target.valueAsNumber;
              const pageStart = Number.isInteger(value) && value >= 1 && value <= book.pageCount ? value : undefined;
              onChange({ ...book, sections: withPageRanges(book.sections.map(s => s.id === section.id ? { ...s, pageStart } : s), book.pageCount) });
            }} /></label><label>To<input type="number" min={section.pageStart || 1} max={book.pageCount} disabled={busy || !section.pageStart} value={section.pageEnd || ""} aria-label={`PDF end page for ${section.title}`} placeholder="?" onChange={e => {
              const value = e.target.valueAsNumber;
              const pageEnd = Number.isInteger(value) && value >= (section.pageStart || 1) && value <= book.pageCount ? value : undefined;
              onChange({ ...book, sections: book.sections.map(s => s.id === section.id ? { ...s, pageEnd } : s) });
            }} /></label></div>
            : <span className="pdf-chapter-range">{missing ? "—" : section.pageStart === section.pageEnd ? `p. ${section.pageStart}` : `pp. ${section.pageStart}–${section.pageEnd}`}</span>}
          </li>;
        })}</ol>
        {pagesEditable && <p className="pdf-chapters-note">Page numbers are PDF pages, which can differ from the numbers printed in the book.</p>}
        <p className="pdf-chapters-note">You’ll review the outcomes before anything is saved. Excerpts from the selected chapters are sent to your AI provider when the plan is prepared.</p>
        {book.truncated && <p role="status">Some page text was shortened. Saved chapter excerpts may not cover the whole chapter.</p>}
      </>}
    </>}
    <details className="pdf-manual-contents"><summary>{book.sections.length ? "Replace the detected contents" : "Paste a table of contents"}</summary>
      <label>Contents listing<textarea value={manual} disabled={busy} rows={4} onChange={e => setManual(e.target.value)} placeholder={'1. First chapter .... 5\n2. Next chapter .... 19'} /></label>
      <button type="button" disabled={busy || !manual.trim()} onClick={() => {
        // Explicit pasted listings stay headings-only until a real page range is confirmed.
        const sections = sectionsFromContents([`Contents\n${manual}`]).map(s => ({ ...s, pageStart: undefined, pageEnd: undefined }));
        if (!sections.length) { setManualError("Include headings followed by page numbers, separated by dots or at least two spaces."); return; }
        setManualError("");
        onChange({ ...book, sections, contentsFrom: "pasted" });
        onSelected(mainPdfSections(sections).map(s => s.id)); onEnabled(true);
      }}>Use this contents listing</button>
      {manualError && <p role="alert">{manualError}</p>}
      <small>Include a page number after each heading, separated by dots or at least two spaces. Assign PDF page ranges above to use the chapter text.</small>
    </details>
  </section>;
}
