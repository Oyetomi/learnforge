import type { PDFDocumentProxy, TextContent } from "pdfjs-dist/types/src/display/api";
import type { LearningReference } from "../../types";
import { sectionsFromContents, withPageRanges, type PdfBook, type PdfSection } from "./pdfContents";
type ReadOptions = { signal?: AbortSignal; onProgress?: (page: number, total: number) => void };

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/**
 * A PDF.js loading task. A Blob is read on demand in 64 KiB ranges, so large
 * books are never copied into memory whole; bytes are passed directly.
 */
function openPdfTask(
  pdfjs: Awaited<ReturnType<typeof loadPdfjs>>,
  input: Uint8Array | Blob,
  hooks: { activity?: () => void; failed?: (error: unknown) => void; visual?: boolean } = {}
) {
  const range = input instanceof Uint8Array ? undefined : new class extends pdfjs.PDFDataRangeTransport {
    stopped = false;
    constructor(private file: Blob) { super(file.size, new Uint8Array(), false); }
    requestDataRange(begin: number, end: number) {
      hooks.activity?.();
      void this.file.slice(begin, end).arrayBuffer().then(buffer => {
        if (!this.stopped) { this.onDataRange(begin, new Uint8Array(buffer)); hooks.activity?.(); }
      }).catch(error => hooks.failed?.(error));
    }
    abort() { this.stopped = true; }
  }(input as Blob);
  const task = pdfjs.getDocument({
    ...(range ? { range, rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true } : { data: (input as Uint8Array).slice() }),
    cMapUrl: `${import.meta.env.BASE_URL}vendor/pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}vendor/pdfjs/standard_fonts/`,
    useWasm: false,
    useSystemFonts: Boolean(hooks.visual),
    disableFontFace: !hooks.visual,
  });
  const stopReads = () => range?.abort();
  return { task, stopReads, abort: () => { stopReads(); void task.destroy().catch(() => {}); } };
}

async function withPdf<T>(input: Uint8Array | Blob, options: ReadOptions & { visual?: boolean }, action: (pdf: PDFDocumentProxy, activity: () => void) => Promise<T>): Promise<T> {
  options.signal?.throwIfAborted();
  const pdfjs = await loadPdfjs();
  options.signal?.throwIfAborted();
  let timedOut = false, rangeFailure: unknown;
  let timer: ReturnType<typeof setTimeout>;
  let stop = () => {};
  // Inactivity recovery, not a time allowance based on the book's length.
  const activity = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; stop(); }, 120000); };
  const { task, abort, stopReads } = openPdfTask(pdfjs, input, { activity, visual: options.visual, failed: error => { rangeFailure = error; stop(); } });
  stop = abort;
  activity();
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    const pdf = await task.promise;
    activity();
    return await action(pdf, activity);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (rangeFailure) throw new Error("Part of this PDF could not be read. Check that the file is still available and try again.");
    if (timedOut) throw new Error("PDF reading stopped responding. Your selection is safe; retry or cancel the import.");
    if (error instanceof Error && error.name === "PasswordException") throw new Error("This PDF is password protected. Choose an unlocked copy.");
    throw error;
  } finally {
    clearTimeout(timer!);
    stopReads();
    options.signal?.removeEventListener("abort", stop);
    await task.destroy().catch(() => {});
  }
}

export interface PdfPageView {
  pageCount: number;
  /** Draw one page into a canvas at the given CSS width (sharp on high-density screens). */
  render(pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void>;
  cancel?(canvas: HTMLCanvasElement): void;
  close(): void;
}

/** Keep a stored PDF open for reading pages inside the app. */
export async function openPdfPageView(file: Blob): Promise<PdfPageView> {
  const pdfjs = await loadPdfjs();
  let abortDoc = () => {};
  const { task, abort } = openPdfTask(pdfjs, file, {
    visual: true,
    failed: () => abortDoc(),
  });
  abortDoc = abort;
  const pdf = await task.promise;
  const rendering = new Map<HTMLCanvasElement, { cancel(): void }>();
  const tokens = new Map<HTMLCanvasElement, number>();
  let nextToken = 0;
  return {
    pageCount: pdf.numPages,
    async render(pageNumber, canvas, cssWidth) {
      const token = ++nextToken;
      tokens.set(canvas, token);
      rendering.get(canvas)?.cancel();
      const page = await pdf.getPage(pageNumber);
      let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
      try {
        if (tokens.get(canvas) !== token) return;
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.aspectRatio = `${base.width} / ${base.height}`;
        renderTask = page.render({ canvas, viewport, background: "#ffffff" });
        rendering.set(canvas, renderTask);
        await renderTask.promise.catch((error: unknown) => {
          if ((error as { name?: string })?.name !== "RenderingCancelledException") throw error;
        });
      } finally {
        if (renderTask && rendering.get(canvas) === renderTask) rendering.delete(canvas);
        page.cleanup();
      }
    },
    cancel(canvas) {
      tokens.set(canvas, ++nextToken);
      rendering.get(canvas)?.cancel();
      rendering.delete(canvas);
    },
    close() {
      tokens.clear();
      rendering.forEach((renderTask) => renderTask.cancel());
      rendering.clear();
      abort();
    },
  };
}
function textFromItems(content: TextContent): string {
  const rows: { y: number; items: { text: string; x: number; width: number }[] }[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ text: item.str, x: item.transform[4], width: item.width });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    const items = row.items.sort((a, b) => a.x - b.x);
    return items.map((item, i) => (i && item.x - (items[i - 1].x + items[i - 1].width) > 12 ? "  " : " ") + item.text).join("").trim();
  }).join("\n");
}
async function pageText(pdf: PDFDocumentProxy, pageNumber: number) {
  const page = await pdf.getPage(pageNumber);
  try { return textFromItems(await page.getTextContent()); } finally { page.cleanup(); }
}

/** Contents first: large books keep their bytes only in memory until approval. */
export async function readPdfBook(input: Uint8Array | Blob, name: string, options: ReadOptions = {}): Promise<PdfBook> {
  return withPdf(input, options, async (pdf, activity) => {
    const sections: PdfSection[] = [];
    let contentsTruncated = false;
    const walk = async (items: Awaited<ReturnType<typeof pdf.getOutline>> | null, level = 0): Promise<void> => {
      for (const item of items || []) {
        options.signal?.throwIfAborted(); activity();
        if (sections.length >= 2000 || level > 8) { contentsTruncated = true; break; }
        const title = item.title?.replace(/\s+/g, " ").trim().slice(0, 200);
        if (!title) continue;
        let pageStart: number | undefined;
        try {
          const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
          if (Array.isArray(destination)) {
            const index = typeof destination[0] === "number" ? destination[0] : await pdf.getPageIndex(destination[0]);
            if (index >= 0 && index < pdf.numPages) pageStart = index + 1;
          }
        } catch { /* Unresolved destinations remain explicit; never follow external links. */ }
        sections.push({ id: `pdf-section-${sections.length + 1}`, title, level, pageStart });
        await walk(item.items, level + 1);
      }
    };
    await walk(await pdf.getOutline().catch(() => null));
    const pages: string[] = Array(pdf.numPages).fill("");
    const readPages: number[] = [], shortenedPages: number[] = [];
    const previewCount = Math.min(pdf.numPages, sections.length ? 4 : 30);
    for (let i = 1; i <= previewCount; i++) {
      options.signal?.throwIfAborted();
      const text = await pageText(pdf, i);
      if (text.length > 16000) shortenedPages.push(i);
      pages[i - 1] = text.slice(0, 16000);
      readPages.push(i); activity();
      options.onProgress?.(i, previewCount);
    }
    const detected = sections.length ? withPageRanges(sections, pdf.numPages) : sectionsFromContents(pages, await pdf.getPageLabels().catch(() => null));
    if (!pages.some(p => p.trim()) && !detected.length) throw new Error("This looks like a scanned PDF. Selectable text is needed: use a text-searchable PDF or paste its table of contents. OCR is not available yet.");
    return { name, fingerprint: pdf.fingerprints?.[1] || pdf.fingerprints?.[0] || undefined, pageCount: pdf.numPages, pages, sections: detected, readPages, shortenedPages,
      ...(input instanceof Uint8Array ? { bytes: input } : { file: input }), previewOnly: previewCount < pdf.numPages, contentsTruncated,
      contentsFrom: sections.length ? "bookmarks" : detected.length ? "contents-page" : "none", truncated: shortenedPages.length > 0 };
  });
}

export interface PdfReadingRange {
  from: number;
  to: number;
  requestedTo: number;
  pages: { number: number; label?: string; text: string }[];
}

/** A local thumbnail of the actual first page, never an invented book cover. */
export async function renderPdfCover(input: Blob | Uint8Array): Promise<Blob | undefined> {
  if (typeof document === "undefined") return undefined;
  return withPdf(input, { visual: true }, async pdf => {
    const page = await pdf.getPage(1);
    try {
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(320 / original.width, 440 / original.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      return await new Promise<Blob | undefined>(resolve => canvas.toBlob(blob => resolve(blob || undefined), "image/jpeg", .88));
    } finally { page.cleanup(); }
  });
}

/** A study-sized excerpt, stopping on page boundaries rather than clipping unseen text. */
export async function readPdfStudyRange(input: Blob | Uint8Array, from: number, to: number, options: ReadOptions = {}): Promise<PdfReadingRange> {
  return withPdf(input, options, async (pdf, activity) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > pdf.numPages)
      throw new Error(`Choose PDF pages between 1 and ${pdf.numPages}, with the end after the start.`);
    const labels = await pdf.getPageLabels().catch(() => null);
    const pages: PdfReadingRange["pages"] = [];
    let characters = 0;
    for (let n = from; n <= to; n++) {
      options.signal?.throwIfAborted();
      const text = await pageText(pdf, n);
      // Every included page remains intact. Long selections become several reading stops.
      if (characters + text.length > 14000 && pages.length) break;
      if (text.length > 14000) throw new Error(`PDF page ${n} contains too much text for one check. Paste the passage you want to study into a focused lesson.`);
      pages.push({ number: n, label: labels?.[n - 1] || undefined, text });
      characters += text.length; activity(); options.onProgress?.(n, to);
    }
    if (!pages.some(p => p.text.trim())) throw new Error("These pages have no selectable text. Choose a text-searchable copy or paste the passage into a focused lesson. OCR is not available yet.");
    return { from, to: pages[pages.length - 1].number, requestedTo: to, pages };
  });
}

/** Read bounded excerpts from the selected chapters, including late-book pages. */
export async function readSelectedPdfChapters(book: PdfBook, ids: string[], options: ReadOptions = {}): Promise<PdfBook> {
  const sections = book.sections.filter(s => ids.includes(s.id) && s.pageStart && s.pageEnd);
  const input = book.file || book.bytes;
  if (!input || !sections.length) return book;
  return withPdf(input, options, async (pdf, activity) => {
    const pages = [...book.pages], read = new Set(book.readPages || []), shortened = new Set(book.shortenedPages || []);
    for (const section of sections) {
      let characters = 0, visited = 0;
      for (let page = section.pageStart!; page <= section.pageEnd! && characters < 160000 && visited < 120; page++, visited++) {
        options.signal?.throwIfAborted();
        if (!read.has(page)) {
          const text = await pageText(pdf, page);
          if (text.length > 16000) shortened.add(page);
          pages[page - 1] = text.slice(0, 16000);
          read.add(page);
        }
        characters += pages[page - 1].length; activity();
        options.onProgress?.(page, pdf.numPages);
      }
    }
    return { ...book, pages, readPages: [...read], shortenedPages: [...shortened], truncated: shortened.size > 0 };
  });
}

/** On-demand full-chapter extraction for selected PDF sections. */
export async function readPdfSectionPages(
  input: Blob | Uint8Array,
  sections: PdfSection[],
  bookName: string,
  options: ReadOptions = {}
): Promise<LearningReference[]> {
  options.signal?.throwIfAborted();
  const candidates = sections.filter(
    (s) =>
      typeof s.pageStart === "number" &&
      typeof s.pageEnd === "number" &&
      Number.isInteger(s.pageStart) &&
      Number.isInteger(s.pageEnd) &&
      s.pageStart >= 1 &&
      s.pageEnd >= s.pageStart
  );
  if (!candidates.length) return [];
  return withPdf(input, options, async (pdf, activity) => {
    const references: LearningReference[] = [];
    const pageCache = new Map<number, string>();
    const cleanBookName = bookName.replace(/[\r\n]+/g, " ").trim();
    for (const section of candidates) {
      const pageStart = section.pageStart!;
      const pageEnd = section.pageEnd!;
      if (pageStart < 1 || pageEnd < pageStart || pageEnd > pdf.numPages) continue;
      const parts: string[] = [];
      let characters = 0;
      let visited = 0;
      let truncated = false;
      for (let n = pageStart; n <= pageEnd; n++) {
        if (visited >= 120 || characters >= 180000) {
          truncated = true;
          break;
        }
        options.signal?.throwIfAborted();
        let raw = pageCache.get(n);
        if (raw === undefined) {
          raw = await pageText(pdf, n);
          pageCache.set(n, raw);
        }
        visited++;
        if (raw.length > 16000) truncated = true;
        const clipped = raw.slice(0, 16000);
        if (clipped.trim()) {
          const prefix = parts.length ? "\n\n" : "";
          const header = `PDF page ${n}\n`;
          const remaining = 180000 - characters - prefix.length - header.length;
          if (remaining <= 0) {
            truncated = true;
            activity();
            options.onProgress?.(n, pdf.numPages);
            break;
          }
          if (clipped.length > remaining) {
            const fit = clipped.slice(0, remaining);
            if (fit.trim()) {
              parts.push(`${header}${fit}`);
              characters += prefix.length + header.length + fit.length;
            }
            truncated = true;
            activity();
            options.onProgress?.(n, pdf.numPages);
            break;
          }
          parts.push(`${header}${clipped}`);
          characters += prefix.length + header.length + clipped.length;
        }
        activity();
        options.onProgress?.(n, pdf.numPages);
      }
      if (!parts.length) continue;
      const cleanTitle = section.title.replace(/[\r\n]+/g, " ").trim();
      references.push({
        id: `pdf-full:${section.id}`,
        sectionId: section.id,
        name: `${cleanBookName} · ${cleanTitle}`,
        content: parts.join("\n\n"),
        truncated,
        pdfPageStart: pageStart,
        pdfPageEnd: pageEnd,
      });
    }
    return references;
  });
}
