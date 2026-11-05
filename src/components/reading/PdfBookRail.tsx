import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, FileText, MapPin } from "lucide-react";
import type { CurriculumSource } from "../../services/learning/pdfContents";
import { mainPdfSections } from "../../services/learning/pdfContents";
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
  const index = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true,
      revision = 0;
    const refresh = () => {
      const request = ++revision;
      void Promise.all([
        loadReadingDocument(trackId),
        loadReadingState(trackId),
      ])
        .then(([file, place]) => {
          if (active && request === revision) {
            setBook((previous) =>
              previous?.fingerprint === file?.fingerprint &&
              previous?.file.size === file?.file.size &&
              previous?.cover?.size === file?.cover?.size
                ? previous
                : file
            );
            setBookmark(place);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
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
      if (nav && button) nav.scrollTop = button.offsetTop - 12;
    });
  useEffect(() => {
    if (index.current?.closest("details")?.open) revealCurrent();
  }, [current?.id]);
  return (
    <aside className="pdf-book-rail" aria-label="Your PDF and book contents">
      <div className="pdf-book-identity">
        <div className="pdf-book-cover">
          {cover ? (
            <img src={cover} alt={`First page of ${source.name}`} />
          ) : (
            <FileText size={30} aria-hidden="true" />
          )}
        </div>
        <div>
          <span className="pdf-book-eyebrow">Your book</span>
          <h2>{source.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ")}</h2>
          {book && <p>{book.pageCount} PDF pages</p>}
        </div>
      </div>
      <div className="pdf-book-place">
        <MapPin size={14} />
        <div>
          <strong>
            {lessonPage
              ? `Lesson source · PDF ${lessonPage}`
              : page
              ? `PDF ${bookmark!.from}–${bookmark!.to}`
              : "Choose your reading place"}
          </strong>
          <p>
            {current?.title ||
              "Reading position is separate from learning progress."}
          </p>
        </div>
      </div>
      <button className="pdf-book-resume" onClick={onRead}>
        {page ? "Resume reading study" : "Study alongside"}
        <ArrowRight size={14} />
      </button>
      <details
        className="pdf-book-index"
        onToggle={(e) => {
          if (e.currentTarget.open) revealCurrent();
        }}
      >
        <summary>
          <BookOpen size={14} /> Book contents <span>{sections.length}</span>
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
          {sections
            .filter((s) =>
              s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
            )
            .map((section) => (
              <button
                key={section.id}
                disabled={!section.pageStart}
                aria-current={
                  section.id === current?.id ? "location" : undefined
                }
                onClick={() =>
                  section.pageStart && onChoosePage(section.pageStart)
                }
              >
                <span>{section.title}</span>
                <small>
                  {section.pageStart
                    ? `PDF ${section.pageStart}`
                    : "Page not mapped"}
                </small>
              </button>
            ))}
          {!sections.some((s) =>
            s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
          ) && <p className="pdf-book-storage-note">No matching chapter.</p>}
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
