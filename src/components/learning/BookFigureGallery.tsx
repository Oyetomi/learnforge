import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import type { LearningReference } from "../../types";
import {
  extractBookFigures,
  pdfPageRanges,
  type BookFigureRef,
} from "../../services/learning/pdfFigures";
import { loadReadingDocument } from "../../services/learning/readingStore";
import {
  openPdfPageView,
  type PdfPageView,
} from "../../services/learning/pdfReader";

export interface BookFigureGalleryProps {
  trackId?: string;
  references?: LearningReference[];
  onOpenFigure?: () => void;
}

const FIT_MAX_WIDTH = 680;
const WIDE_MIN_WIDTH = 920;
const WIDE_MAX_WIDTH = 1200;

export function BookFigureGallery({
  trackId,
  references,
  onOpenFigure,
}: BookFigureGalleryProps) {
  const figures = useMemo(() => extractBookFigures(references), [references]);
  const ranges = useMemo(() => pdfPageRanges(references), [references]);

  const orderedChips = useMemo(() => {
    const figureItems = figures.filter((item) => item.kind === "figure");
    const listingItems = figures.filter((item) => item.kind === "listing");
    return [...figureItems, ...listingItems];
  }, [figures]);

  const pageSpan = useMemo(() => {
    if (!ranges.length) return null;
    let start = ranges[0].start;
    let end = ranges[0].end;
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].start < start) start = ranges[i].start;
      if (ranges[i].end > end) end = ranges[i].end;
    }
    return { start, end, firstStart: ranges[0].start };
  }, [ranges]);

  const [activePage, setActivePage] = useState<number | null>(null);
  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"fit" | "wide">("fit");
  const [view, setView] = useState<PdfPageView | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [renderError, setRenderError] = useState("");
  const [renderingPage, setRenderingPage] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<PdfPageView | null>(null);
  const loadingTrackRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);
  const mountedRef = useRef(true);

  const closePdfHandle = () => {
    loadRequestRef.current += 1;
    loadingTrackRef.current = null;
    if (viewRef.current) {
      viewRef.current.close();
      viewRef.current = null;
    }
    setView(null);
    setLoadingPdf(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
      loadingTrackRef.current = null;
      if (viewRef.current) {
        viewRef.current.close();
        viewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    closePdfHandle();
    setActivePage(null);
    setSelectedFigureId(null);
    setLoadError("");
    setRenderError("");
    setRenderingPage(false);
  }, [trackId]);

  const ensurePdfLoaded = (currentTrackId: string) => {
    if (viewRef.current || loadingTrackRef.current === currentTrackId) return;
    const requestId = ++loadRequestRef.current;
    loadingTrackRef.current = currentTrackId;
    setLoadingPdf(true);
    setLoadError("");
    setRenderError("");

    void (async () => {
      try {
        const doc = await loadReadingDocument(currentTrackId);
        if (!mountedRef.current || loadRequestRef.current !== requestId) return;
        if (!doc || !doc.file) {
          loadingTrackRef.current = null;
          setLoadingPdf(false);
          setLoadError(
            "The original PDF is not stored on this device. Reconnect the book file in Reading mode to view pages inline."
          );
          return;
        }
        const opened = await openPdfPageView(doc.file);
        if (!mountedRef.current || loadRequestRef.current !== requestId) {
          opened.close();
          return;
        }
        loadingTrackRef.current = null;
        viewRef.current = opened;
        setView(opened);
        setLoadingPdf(false);
        setActivePage((prev) =>
          prev === null
            ? null
            : Math.max(1, Math.min(prev, opened.pageCount))
        );
      } catch (err) {
        if (!mountedRef.current || loadRequestRef.current !== requestId) return;
        loadingTrackRef.current = null;
        setLoadingPdf(false);
        setLoadError(
          err instanceof Error && err.message
            ? err.message
            : "The original PDF could not be opened on this device. The extracted text is still available below."
        );
      }
    })();
  };

  const isViewerOpen = activePage !== null;

  useEffect(() => {
    const element = canvasWrapRef.current;
    if (!isViewerOpen || !element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = Math.round(element.clientWidth);
        setContainerWidth((current) =>
          Math.abs(current - next) > 8 ? next : current
        );
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isViewerOpen]);

  const clampedPage =
    activePage !== null && view
      ? Math.max(1, Math.min(activePage, view.pageCount))
      : activePage;

  const targetRenderWidth = useMemo(() => {
    const baseWidth = containerWidth > 0 ? containerWidth : 640;
    if (zoom === "wide") {
      return Math.round(
        Math.min(
          WIDE_MAX_WIDTH,
          Math.max(WIDE_MIN_WIDTH, baseWidth * 1.45)
        )
      );
    }
    return Math.round(Math.max(240, Math.min(baseWidth, FIT_MAX_WIDTH)));
  }, [containerWidth, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!view || clampedPage === null || !canvas) return;
    let active = true;
    setRenderError("");
    setRenderingPage(true);

    view
      .render(clampedPage, canvas, targetRenderWidth)
      .then(() => {
        if (active) setRenderingPage(false);
      })
      .catch(() => {
        if (active) {
          setRenderingPage(false);
          setRenderError(
            "This page could not be rendered. Its extracted text is still available below."
          );
        }
      });

    return () => {
      active = false;
      view.cancel?.(canvas);
    };
  }, [view, clampedPage, targetRenderWidth]);

  if (!trackId || (orderedChips.length === 0 && !pageSpan)) {
    return null;
  }

  const handleOpenFigure = (figure: BookFigureRef) => {
    onOpenFigure?.();
    setSelectedFigureId(figure.id);
    setActivePage(
      view ? Math.max(1, Math.min(figure.page, view.pageCount)) : figure.page
    );
    ensurePdfLoaded(trackId);
  };

  const handleOpenChapterPages = () => {
    if (!pageSpan) return;
    onOpenFigure?.();
    setSelectedFigureId(null);
    const startPage = pageSpan.firstStart;
    setActivePage(
      view ? Math.max(1, Math.min(startPage, view.pageCount)) : startPage
    );
    ensurePdfLoaded(trackId);
  };

  const handleStepPage = (delta: number) => {
    if (!view || clampedPage === null) return;
    const nextPage = Math.max(1, Math.min(view.pageCount, clampedPage + delta));
    if (nextPage === clampedPage) return;
    setSelectedFigureId(null);
    setActivePage(nextPage);
  };

  const handleClose = () => {
    setActivePage(null);
    setSelectedFigureId(null);
    setLoadError("");
    setRenderError("");
    setRenderingPage(false);
    closePdfHandle();
  };

  const activeFigure: BookFigureRef | null =
    clampedPage === null
      ? null
      : orderedChips.find(
          (item) => item.id === selectedFigureId && item.page === clampedPage
        ) ??
        orderedChips.find((item) => item.page === clampedPage) ??
        null;

  const matchingRange =
    clampedPage !== null
      ? ranges.find((r) => clampedPage >= r.start && clampedPage <= r.end) ??
        ranges[0]
      : null;

  const pageRangeButtonLabel = pageSpan
    ? pageSpan.start === pageSpan.end
      ? `View book page (p. ${pageSpan.start})`
      : `View book page (pp. ${pageSpan.start}–${pageSpan.end})`
    : "";

  return (
    <div className="book-figure-gallery">
      <div className="book-figure-header">
        {orderedChips.length > 0 && (
          <span className="book-figure-label">Book figures &amp; listings</span>
        )}
        {pageSpan && (
          <button
            type="button"
            className="book-figure-browse"
            onClick={handleOpenChapterPages}
            aria-expanded={isViewerOpen}
          >
            <BookOpen size={12} aria-hidden="true" />
            <span>{pageRangeButtonLabel}</span>
          </button>
        )}
      </div>

      {orderedChips.length > 0 && (
        <div
          className="book-figure-chips"
          role="group"
          aria-label="Book figures and listings"
        >
          {orderedChips.map((fig) => {
            const isSelected =
              isViewerOpen &&
              clampedPage === fig.page &&
              (selectedFigureId === fig.id ||
                (selectedFigureId === null && activeFigure?.id === fig.id));
            return (
              <button
                key={fig.id}
                type="button"
                className={`book-figure-chip${
                  fig.kind === "listing" ? " is-listing" : ""
                }${isSelected ? " is-active" : ""}`}
                title={`${fig.label}: ${fig.caption}`}
                aria-pressed={isSelected}
                onClick={() => handleOpenFigure(fig)}
              >
                <span className="book-figure-chip-label">{fig.label}</span>
                <span className="book-figure-chip-page">· p. {fig.page}</span>
              </button>
            );
          })}
        </div>
      )}

      {isViewerOpen && clampedPage !== null && (
        <div className="book-figure-viewer" aria-live="polite">
          <div className="book-figure-controls">
            <div className="book-figure-nav">
              <button
                type="button"
                onClick={() => handleStepPage(-1)}
                disabled={!view || clampedPage <= 1}
              >
                <ChevronLeft size={13} aria-hidden="true" />
                <span>Previous page</span>
              </button>
              <span className="book-figure-page-indicator">
                {view
                  ? `Page ${clampedPage} of ${view.pageCount}`
                  : `Page ${clampedPage}`}
              </span>
              <button
                type="button"
                onClick={() => handleStepPage(1)}
                disabled={!view || clampedPage >= view.pageCount}
              >
                <span>Next page</span>
                <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>

            <div className="book-figure-actions">
              <div
                className="book-figure-zoom"
                role="group"
                aria-label="Page zoom"
              >
                <button
                  type="button"
                  className={zoom === "fit" ? "is-active" : undefined}
                  aria-pressed={zoom === "fit"}
                  onClick={() => setZoom("fit")}
                >
                  Fit
                </button>
                <button
                  type="button"
                  className={zoom === "wide" ? "is-active" : undefined}
                  aria-pressed={zoom === "wide"}
                  onClick={() => setZoom("wide")}
                >
                  Wide
                </button>
              </div>
              <button
                type="button"
                className="book-figure-close"
                onClick={handleClose}
              >
                <X size={13} aria-hidden="true" />
                <span>Close page</span>
              </button>
            </div>
          </div>

          <div className="book-figure-caption">
            {activeFigure ? (
              <>
                <strong>{activeFigure.label}</strong>
                <span>{activeFigure.caption}</span>
              </>
            ) : matchingRange ? (
              <span>{matchingRange.sourceName}</span>
            ) : (
              <span>PDF page {clampedPage}</span>
            )}
          </div>

          <div
            className={`book-figure-canvas-wrap${
              zoom === "wide" ? " is-wide" : ""
            }`}
            ref={canvasWrapRef}
          >
            {loadError ? (
              <p className="book-figure-message is-error" role="alert">
                {loadError}
              </p>
            ) : loadingPdf || !view ? (
              <p className="book-figure-message" role="status">
                <Loader2
                  size={13}
                  className="animate-spin"
                  aria-hidden="true"
                />
                <span>Opening book page...</span>
              </p>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`PDF page ${clampedPage}`}
                  style={
                    zoom === "wide"
                      ? { width: `${targetRenderWidth}px` }
                      : undefined
                  }
                />
                {renderingPage && (
                  <p className="book-figure-message" role="status">
                    <Loader2
                      size={12}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    <span>Rendering page {clampedPage}...</span>
                  </p>
                )}
                {renderError && (
                  <p className="book-figure-message is-error" role="alert">
                    {renderError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
