import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { openPdfPageView, type PdfPageView } from "../../services/learning/pdfReader";
import "./pdf-viewer.css";

const MAX_WIDTH = 760;

/** One page: drawn when it scrolls near the viewport, redrawn when the width changes. */
function ViewerPage({ view, page, width, label }: { view: PdfPageView; page: number; width: number; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = canvas.current;
    if (!element || typeof IntersectionObserver === "undefined") return setVisible(true);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!visible || !width || !el) return;
    let active = true;
    setFailed(false);
    view.render(page, el, width).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      view.cancel?.(el);
    };
  }, [visible, width, view, page]);
  return (
    <figure className="pdf-viewer-page">
      <canvas ref={canvas} role="img" aria-label={`PDF page ${page}`} />
      {failed && <p className="pdf-viewer-note" role="alert">This page couldn’t be drawn. Its text is still available below.</p>}
      <figcaption>
        PDF page {page}
        {label && label !== String(page) ? ` · printed ${label}` : ""}
      </figcaption>
    </figure>
  );
}

/**
 * The saved PDF's pages for the current reading stop, inside the app. The
 * file is read in ranges, so opening a long book doesn't load it whole.
 */
export function PdfPageViewer({
  file,
  pages,
}: {
  file: Blob;
  pages: { number: number; label?: string }[];
}) {
  const [view, setView] = useState<PdfPageView | null>(null);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let alive = true;
    let opened: PdfPageView | null = null;
    setView(null);
    setError("");
    openPdfPageView(file)
      .then((next) => {
        if (!alive) return next.close();
        opened = next;
        setView(next);
      })
      .catch(() => alive && setError("These pages couldn’t be opened here. You can still read them in your own PDF viewer."));
    return () => {
      alive = false;
      opened?.close();
    };
  }, [file]);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      // Re-render only on real size changes, after the layout settles.
      frame = requestAnimationFrame(() => {
        const next = Math.round(Math.min(element.clientWidth, MAX_WIDTH));
        setWidth((current) => (Math.abs(current - next) > 8 ? next : current));
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
  }, []);

  return (
    <div className="pdf-viewer" ref={box}>
      {error ? (
        <p className="pdf-viewer-note" role="alert">{error}</p>
      ) : !view ? (
        <p className="pdf-viewer-note" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Opening pages…
        </p>
      ) : (
        pages.map((page) => (
          <ViewerPage key={page.number} view={view} page={page.number} width={width} label={page.label} />
        ))
      )}
    </div>
  );
}
