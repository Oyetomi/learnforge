import type { PDFDocumentProxy, TextContent } from "pdfjs-dist/types/src/display/api";
import { sectionsFromContents, withPageRanges, type PdfBook, type PdfSection } from "./pdfContents";
type ReadOptions = { signal?: AbortSignal; onProgress?: (page: number, total: number) => void };

async function withPdf<T>(input: Uint8Array | Blob, options: ReadOptions, action: (pdf: PDFDocumentProxy, activity: () => void) => Promise<T>): Promise<T> {
  options.signal?.throwIfAborted();
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  options.signal?.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let timedOut = false, rangeFailure: unknown;
  let timer: ReturnType<typeof setTimeout>;
  let stop = () => {};
  // Inactivity recovery, not a time allowance based on the book's length.
  const activity = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; stop(); }, 120000); };
  const range = input instanceof Uint8Array ? undefined : new class extends pdfjs.PDFDataRangeTransport {
    stopped = false;
    constructor(private file: Blob) { super(file.size, new Uint8Array(), false); }
    requestDataRange(begin: number, end: number) {
      activity();
      void this.file.slice(begin, end).arrayBuffer().then(buffer => {
        if (!this.stopped) { this.onDataRange(begin, new Uint8Array(buffer)); activity(); }
      }).catch(error => { rangeFailure = error; stop(); });
    }
    abort() { this.stopped = true; }
  }(input as Blob);
  const task = pdfjs.getDocument({ ...(range ? { range, rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true } : { data: (input as Uint8Array).slice() }), cMapUrl: `${import.meta.env.BASE_URL}vendor/pdfjs/cmaps/`, cMapPacked: true, standardFontDataUrl: `${import.meta.env.BASE_URL}vendor/pdfjs/standard_fonts/`, useWasm: false, useSystemFonts: true, disableFontFace: true });
  stop = () => { range?.abort(); void task.destroy().catch(() => {}); };
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
    range?.abort();
    options.signal?.removeEventListener("abort", stop);
    await task.destroy().catch(() => {});
  }
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
    return { name, pageCount: pdf.numPages, pages, sections: detected, readPages, shortenedPages,
      ...(input instanceof Uint8Array ? { bytes: input } : { file: input }), previewOnly: previewCount < pdf.numPages, contentsTruncated,
      contentsFrom: sections.length ? "bookmarks" : detected.length ? "contents-page" : "none", truncated: shortenedPages.length > 0 };
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
      for (let page = section.pageStart!; page <= section.pageEnd! && characters < 18000 && visited < 40; page++, visited++) {
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
