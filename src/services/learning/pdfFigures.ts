import type { LearningReference } from "../../types";

export interface BookFigureRef {
  id: string;
  page: number;
  kind: "figure" | "listing" | "page";
  label: string;
  caption: string;
  sourceName: string;
}

const PDF_PAGE_MARKER_RE = /^PDF page (\d+)$/;
const FIGURE_CAPTION_RE =
  /^(Figure|Fig\.?|Diagram|Listing)\s+(\d+(?:\.\d+|[A-Z]\.\d+)*)\s*(?:[:.\-–—]\s*|\s+)(.{3,160})$/i;
const MAX_BOOK_FIGURES = 24;

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function normalizeDisplayPrefix(rawPrefix: string): {
  kind: "figure" | "listing";
  displayPrefix: string;
  normalizedPrefix: string;
} {
  const lower = rawPrefix.toLowerCase();
  if (lower === "listing") {
    return {
      kind: "listing",
      displayPrefix: "Listing",
      normalizedPrefix: "listing",
    };
  }
  if (lower === "diagram") {
    return {
      kind: "figure",
      displayPrefix: "Diagram",
      normalizedPrefix: "diagram",
    };
  }
  return {
    kind: "figure",
    displayPrefix: "Figure",
    normalizedPrefix: "figure",
  };
}

export function extractBookFigures(
  references: LearningReference[] | undefined
): BookFigureRef[] {
  if (!references?.length) return [];

  const seen = new Set<string>();
  const collected: { item: BookFigureRef; order: number }[] = [];
  let order = 0;

  for (const ref of references) {
    if (!ref || typeof ref.content !== "string") continue;
    const hasPageStart = isPositiveInt(ref.pdfPageStart);
    const lines = ref.content.split(/\r?\n/);
    const hasPageMarker = lines.some((line) =>
      PDF_PAGE_MARKER_RE.test(line.trim())
    );
    if (!hasPageStart && !hasPageMarker) continue;

    let currentPage: number | undefined = hasPageStart
      ? ref.pdfPageStart
      : undefined;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const pageMatch = PDF_PAGE_MARKER_RE.exec(line);
      if (pageMatch) {
        const parsedPage = Number.parseInt(pageMatch[1], 10);
        if (Number.isInteger(parsedPage) && parsedPage >= 1) {
          currentPage = parsedPage;
        }
        continue;
      }

      if (currentPage === undefined) continue;

      const captionMatch = FIGURE_CAPTION_RE.exec(line);
      if (!captionMatch) continue;

      const rawPrefix = captionMatch[1];
      const rawNumber = captionMatch[2];
      const caption = captionMatch[3].replace(/\s+/g, " ").trim();
      if (caption.length < 3) continue;

      const { kind, displayPrefix, normalizedPrefix } =
        normalizeDisplayPrefix(rawPrefix);
      const label = `${displayPrefix} ${rawNumber}`;
      const normalizedLabel = `${normalizedPrefix} ${rawNumber.toLowerCase()}`;
      const dedupeKey = `${kind}:${normalizedLabel}:${currentPage}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const id = `${kind}:${normalizedLabel.replace(/\s+/g, "-")}:p${currentPage}`;
      collected.push({
        item: {
          id,
          page: currentPage,
          kind,
          label,
          caption,
          sourceName: ref.name,
        },
        order: order++,
      });
    }
  }

  if (collected.length <= MAX_BOOK_FIGURES) {
    return collected
      .sort(
        (a, b) =>
          a.item.page - b.item.page ||
          (a.item.kind === b.item.kind
            ? 0
            : a.item.kind === "figure"
            ? -1
            : 1) ||
          a.order - b.order
      )
      .map((entry) => entry.item);
  }

  const figures = collected
    .filter((entry) => entry.item.kind === "figure")
    .sort((a, b) => a.item.page - b.item.page || a.order - b.order);
  const listings = collected
    .filter((entry) => entry.item.kind === "listing")
    .sort((a, b) => a.item.page - b.item.page || a.order - b.order);

  const selected = [...figures, ...listings].slice(0, MAX_BOOK_FIGURES);
  selected.sort(
    (a, b) =>
      a.item.page - b.item.page ||
      (a.item.kind === b.item.kind
        ? 0
        : a.item.kind === "figure"
        ? -1
        : 1) ||
      a.order - b.order
  );

  return selected.map((entry) => entry.item);
}

export function pdfPageRanges(
  references: LearningReference[] | undefined
): { sourceName: string; start: number; end: number }[] {
  if (!references?.length) return [];

  const seen = new Set<string>();
  const ranges: { sourceName: string; start: number; end: number }[] = [];

  for (const ref of references) {
    if (!ref) continue;
    if (!isPositiveInt(ref.pdfPageStart) || !isPositiveInt(ref.pdfPageEnd)) {
      continue;
    }
    if (ref.pdfPageEnd < ref.pdfPageStart) continue;

    const key = `${ref.name}:${ref.pdfPageStart}:${ref.pdfPageEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    ranges.push({
      sourceName: ref.name,
      start: ref.pdfPageStart,
      end: ref.pdfPageEnd,
    });
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  return ranges;
}
