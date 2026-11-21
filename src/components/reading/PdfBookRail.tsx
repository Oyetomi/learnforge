import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, FileText, MapPin } from "lucide-react";
import type { CurriculumSource } from "../../services/learning/pdfContents";
import { mainPdfSections, readableFileTitle } from "../../services/learning/pdfContents";
import {
  loadReadingDocument,
  loadReadingState,
  READING_CHANGED,
  type ReadingDocument,
  type ReadingState,
} from "../../services/learning/readingStore";
import "./book-rail.css";

export function PdfBookRail({
  trackId,
  source,
  onRead,
  onChoosePage,
  lessonPage,
}: {
  trackId: string;
  source: CurriculumSource;
  onRead: () => void;
  onChoosePage: (page: number) => void;
  lessonPage?: number;
}) {
  const [book, setBook] = useState<ReadingDocument>(),
    [bookmark, setBookmark] = useState<ReadingState>();
  const [cover, setCover] = useState(""),
    [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  // Contents are the rail's main navigation on wide windows; a horizontal bar on narrow ones.
  const [indexOpen, setIndexOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 1150
  );
  const index = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true,
      revision = 0;
    const refresh = () => {
      const request = ++revision;
      void Promise.allSettled([
        loadReadingDocument(trackId),
        loadReadingState(trackId),
      ]).then(([fileRes, placeRes]) => {
        if (!active || request !== revision) return;
        if (fileRes.status === "fulfilled") {
          const file = fileRes.value;
          setBook((previous) =>
            previous?.fingerprint === file?.fingerprint &&
            previous?.file.size === file?.file.size &&
            previous?.cover?.size === file?.cover?.size
              ? previous
              : file
          );
        }
        if (placeRes.status === "fulfilled") {
          setBookmark(placeRes.value);
        }
        setError(fileRes.status === "rejected" || placeRes.status === "rejected");
      });
    };
    refresh();
    window.addEventListener(READING_CHANGED, refresh);
    return () => {
      active = false;
      window.removeEventListener(READING_CHANGED, refresh);
    };
  }, [trackId]);
  useEffect(() => {
    if (!book?.cover) {
      setCover("");
      return;
    }
    const url = URL.createObjectURL(book.cover);
    setCover(url);
    return () => URL.revokeObjectURL(url);
  }, [book?.cover]);
  const sections = mainPdfSections(book?.sections || source.sections);
  const page = lessonPage || bookmark?.from;
  const current = page
    ? [...sections]
        .reverse()
        .find(
          (s) =>
            s.pageStart &&
            s.pageStart <= page &&
            (!s.pageEnd || page <= s.pageEnd)
        )
    : undefined;
  const revealCurrent = () =>
    requestAnimationFrame(() => {
      const nav = index.current,
        button = nav?.querySelector<HTMLElement>('[aria-current="location"]');
      if (button?.scrollIntoView) button.scrollIntoView({ block: "nearest" });
    });
  useEffect(() => {
    if (index.current?.closest("details")?.open) revealCurrent();
  }, [current?.id]);
  const title = readableFileTitle(source.name);
  const placeLabel = lessonPage ? "This lesson" : page ? "Reading" : "Not started";
  const placeText = lessonPage
    ? `PDF page ${lessonPage}`
    : page
    ? `PDF pages ${bookmark!.from}–${bookmark!.to}`
    : "Choose where to begin";
  const matching = sections.filter((s) =>
    s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  return (
    <aside className="pdf-book-rail" aria-label="Your PDF and book contents">
      <header className="pdf-book-identity">
        <div className="pdf-book-cover">
          {cover ? (
            <img src={cover} alt={`First page of ${title}`} />
          ) : (
            <FileText size={20} aria-hidden="true" />
          )}
        </div>
        <div>
          <h2 title={title}>{title}</h2>
          {book && <p>{book.pageCount} pages</p>}
        </div>
      </header>
      <div className="pdf-book-place">
        <span className="pdf-book-label">
          <MapPin size={12} aria-hidden="true" /> {placeLabel}
        </span>
        <strong>{placeText}</strong>
        {current && <span className="pdf-book-current">{current.title}</span>}
      </div>
      <button
        className="pdf-book-resume"
        onClick={() => (!bookmark && lessonPage ? onChoosePage(lessonPage) : onRead())}
      >
        {page ? "Resume reading" : "Start reading"}
        <ArrowRight size={14} aria-hidden="true" />
      </button>
      <details
        className="pdf-book-index"
        open={indexOpen}
        onToggle={(e) => {
          setIndexOpen(e.currentTarget.open);
          if (e.currentTarget.open) revealCurrent();
        }}
      >
        <summary>
          <BookOpen size={13} aria-hidden="true" /> Contents{" "}
          <span>{sections.length}</span>
        </summary>
        {sections.length > 12 && (
          <input
            className="pdf-book-search"
            type="search"
            aria-label="Find a chapter in this book"
            placeholder="Find a chapter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <nav ref={index} aria-label="Book chapter index">
          {matching.map((section) => (
            <button
              key={section.id}
              disabled={!section.pageStart}
              aria-current={section.id === current?.id ? "location" : undefined}
              onClick={() => section.pageStart && onChoosePage(section.pageStart)}
              title={section.pageStart ? `Start at PDF page ${section.pageStart}` : "Page not mapped"}
            >
              <span>{section.title}</span>
              <small>{section.pageStart ?? "—"}</small>
            </button>
          ))}
          {!matching.length && <p className="pdf-book-storage-note">No matching chapter.</p>}
        </nav>
      </details>
      {error && (
        <p className="pdf-book-storage-note">
          Open the reading companion to reconnect this PDF.
        </p>
      )}
    </aside>
  );
}
