import React, { useState, useEffect } from "react";
import { mainPdfSections, sectionsFromContents, withPageRanges, type PdfBook } from "../../services/learning/pdfContents";
import "./pdf-chapters.css";

export function PdfChapterPicker({ book, selected, enabled, busy, onChange, onSelected, onEnabled }: {
  book: PdfBook; selected: string[]; enabled: boolean; busy: boolean;
  onChange: (book: PdfBook) => void; onSelected: (ids: string[]) => void; onEnabled: (enabled: boolean) => void;
}) {
  const [manual, setManual] = useState("");
  const roots = mainPdfSections(book.sections);
  const [manualError, setManualError] = useState("");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setManual(""); setManualError(""); setShowAll(false); }, [book.name]);
  const visibleSections = showAll || !roots.length ? book.sections : roots;
  return <section className="pdf-chapters" aria-label="PDF curriculum chapters" tabIndex={-1}>
    <div className="pdf-chapters-heading"><strong>Build a curriculum from this PDF</strong><span>{book.pageCount} PDF pages</span></div>
    <p>{book.contentsFrom === "bookmarks" ? "Found the document’s chapter bookmarks." : book.contentsFrom === "contents-page" ? "Found a printed table of contents. Check the page ranges below." : book.contentsFrom === "pasted" ? "Using your pasted table of contents. Assign PDF page ranges to include the chapter text." : "No table of contents was detected. Paste the contents listing below, or use this PDF as reference notes."}</p>
    {book.previewOnly && <p className="pdf-chapters-note">The contents are ready. Selected chapter excerpts will be read when you prepare the curriculum.</p>}
    {book.contentsTruncated && <p role="status">This document has an unusually large contents list. Some entries are not shown; replace the listing to include other chapters.</p>}
    {book.sections.length > 0 && <>
      <label className="pdf-chapters-toggle"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => onEnabled(e.target.checked)} /><span>Use selected chapters as the curriculum outline</span></label>
      {enabled && <>
        <div className="pdf-chapters-toolbar"><span>{selected.length} sections selected</span><button type="button" disabled={busy} onClick={() => { onSelected(roots.map(s => s.id)); setShowAll(false); }}>Select main chapters</button><button type="button" disabled={busy} onClick={() => onSelected([])}>Clear</button></div>
        <p className="pdf-chapters-note">Choose the sections you want to learn. Page numbers below refer to physical PDF pages, which may differ from printed numbers.</p>
        {book.sections.length > roots.length && <button type="button" disabled={busy} aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>{showAll ? "Show main chapters only" : `Show all ${book.sections.length} sections`}</button>}
        <ol className="pdf-chapter-list">{visibleSections.map(section => <li key={section.id} style={{ "--chapter-depth": Math.min(section.level, 3) } as React.CSSProperties}>
          <label className="pdf-chapter-choice"><input type="checkbox" disabled={busy} checked={selected.includes(section.id)} onChange={e => onSelected(e.target.checked ? [...selected, section.id] : selected.filter(id => id !== section.id))} /><span>{section.title}{(!section.pageStart || !section.pageEnd) && <small>Page range unresolved · outline only</small>}</span></label>
          <div className="pdf-chapter-pages"><label>From<input type="number" min={1} max={book.pageCount} disabled={busy} value={section.pageStart || ""} aria-label={`PDF start page for ${section.title}`} placeholder="?" onChange={e => {
            const value = e.target.valueAsNumber;
            const pageStart = Number.isInteger(value) && value >= 1 && value <= book.pageCount ? value : undefined;
            onChange({ ...book, sections: withPageRanges(book.sections.map(s => s.id === section.id ? { ...s, pageStart } : s), book.pageCount) });
          }} /></label><label>To<input type="number" min={section.pageStart || 1} max={book.pageCount} disabled={busy || !section.pageStart} value={section.pageEnd || ""} aria-label={`PDF end page for ${section.title}`} placeholder="?" onChange={e => {
            const value = e.target.valueAsNumber;
            const pageEnd = Number.isInteger(value) && value >= (section.pageStart || 1) && value <= book.pageCount ? value : undefined;
            onChange({ ...book, sections: book.sections.map(s => s.id === section.id ? { ...s, pageEnd } : s) });
          }} /></label></div>
        </li>)}</ol>
        <p className="pdf-chapters-note">You’ll review the outcomes before saving. Lessons are prepared one unit at a time. Selected source excerpts are sent to your chosen AI provider when you generate the plan.</p>
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
