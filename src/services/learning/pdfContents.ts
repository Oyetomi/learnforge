import type { LearningReference } from "../../types";
import { createLearningReference } from "./grounding";

export interface PdfSection {
  id: string;
  title: string;
  level: number;
  pageStart?: number;
  pageEnd?: number;
  printedPage?: string;
}
export interface PdfBook {
  fingerprint?: string;
  name: string;
  pageCount: number;
  pages: string[];
  sections: PdfSection[];
  contentsFrom: "bookmarks" | "contents-page" | "pasted" | "none";
  truncated: boolean;
  bytes?: Uint8Array;
  file?: Blob;
  readPages?: number[];
  shortenedPages?: number[];
  previewOnly?: boolean;
  contentsTruncated?: boolean;
}
export interface CurriculumSource {
  name: string;
  sections: PdfSection[];
  pageCount?: number;
  fingerprint?: string;
}
/** "practical-statistics_2e.pdf" → "Practical Statistics 2e" for learner-facing text. */
export function readableFileTitle(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return fileName;
  // Only recase names typed entirely in lower case; keep deliberate capitals ("SQL in 10 minutes").
  return base === base.toLowerCase() ? base.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : base;
}
const normal = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Only explicit contents listings, never guessed headings from the body. */
export function sectionsFromContents(pages: string[], labels?: string[] | null): PdfSection[] {
  const found: PdfSection[] = [];
  let inContents = false, blankPages = 0;
  for (let p = 0; p < Math.min(pages.length, 30); p++) {
    const lines = pages[p].split("\n");
    const heading = lines.some(line => /^(?:table\s+of\s+)?contents\s*$/i.test(line.trim()));
    if (heading) inContents = true;
    if (!inContents) continue;
    let added = 0;
    for (const line of lines) {
      const match = line.trim().match(/^(.{3,200}?)(?:\s*\.{2,}\s*|\s{2,})(\d{1,4}|[ivxlcdm]{1,8})\s*$/i);
      if (!match || /^(?:table\s+of\s+)?contents$/i.test(match[1].trim())) continue;
      const title = match[1].trim(), printedPage = match[2];
      if (found.some(s => s.title === title && s.printedPage === printedPage)) continue;
      // A printed page number is not automatically a physical PDF page number.
      let index = labels?.findIndex(label => label === printedPage) ?? -1;
      if (index < 0) index = pages.findIndex((text, i) => i > p && text.split("\n").slice(0, 15).some(line => normal(line) === normal(title)));
      const numbered = title.match(/^\d+(\.\d+)*\b/)?.[0] || "";
      found.push({ id: `pdf-section-${found.length + 1}`, title, printedPage,
        level: (numbered.match(/\./g) || []).length,
        ...(index >= 0 ? { pageStart: index + 1 } : {}) });
      added++;
      if (found.length === 200) return withPageRanges(found, pages.length);
    }
    blankPages = added ? 0 : blankPages + 1;
    if (blankPages >= 2 || (!added && !heading && found.length)) break;
  }
  return withPageRanges(found, pages.length);
}
export function withPageRanges(sections: PdfSection[], pageCount: number): PdfSection[] {
  return sections.map((s, index) => {
    const start = s.pageStart;
    if (!start || start < 1 || start > pageCount) return { ...s, pageStart: undefined, pageEnd: undefined };
    const next = sections.slice(index + 1).find(n => n.level <= s.level && n.pageStart && n.pageStart > start);
    return { ...s, pageEnd: next?.pageStart ? next.pageStart - 1 : pageCount };
  });
}
export function selectedPdfSource(book: PdfBook, ids: string[]): { source: CurriculumSource; references: LearningReference[] } {
  const sections = book.sections.filter(section => ids.includes(section.id));
  if (!sections.length) throw new Error("Choose at least one chapter for your curriculum.");
  if (sections.length > 48) throw new Error("Choose up to 48 sections for one curriculum. You can create another path for the remaining chapters.");
  const references = sections.map(s => {
    const text = s.pageStart && s.pageEnd ? book.pages.slice(s.pageStart - 1, s.pageEnd)
      .map((page, i) => page.trim() ? `PDF page ${s.pageStart! + i}\n${page}` : "").filter(Boolean).join("\n\n") : "";
    const hasText = s.pageStart && s.pageEnd && book.pages.slice(s.pageStart - 1, s.pageEnd).some(p => p.trim());
    const ref = createLearningReference(`${book.name} · ${s.title}`, hasText ? text :
      `Contents heading only: ${s.title}. Chapter text was not readable or its PDF page range is unresolved. Do not attribute explanations or answers to this chapter.`)!;
    return { ...ref, id: `${ref.id}:${s.id}`, sectionId: s.id,
      truncated: ref.truncated || (s.pageStart && s.pageEnd ?
        (book.shortenedPages || []).some(p => p >= s.pageStart! && p <= s.pageEnd!) ||
        (!!book.readPages && Array.from({length:s.pageEnd - s.pageStart + 1}, (_,i)=>s.pageStart!+i).some(p=>!book.readPages!.includes(p))) : book.truncated),
      ...(s.pageStart ? { pdfPageStart: s.pageStart, pdfPageEnd: s.pageEnd } : {}),
      ...(hasText ? {} : { outlineOnly: true }) };
  });
  return { source: { name: book.name, sections, pageCount: book.pageCount, fingerprint: book.fingerprint }, references };
}

const FRONT_OR_BACK_MATTER = /^(?:cover|back\s*cover|copyright|table of contents|contents|preface|foreword|index|colophon|acknowledg(?:e)?ments|about the authors?)$/i;
/** "Part II: Uncertainty", "Book 1", "Unit 3", "Volume I", "IV. Decisions" */
const GROUPING_HEADING = /^(?:part|book|unit|volume|module)\b|^[IVXLC]+[.:]\s/i;

/** Indexes of the sections nested under sections[index] (outline order). */
export function pdfSectionDescendants(sections: PdfSection[], index: number): PdfSection[] {
  const out: PdfSection[] = [];
  for (let i = index + 1; i < sections.length && sections[i].level > sections[index].level; i++) out.push(sections[i]);
  return out;
}

/** The sections that contain sections[index], nearest first. */
export function pdfSectionAncestors(sections: PdfSection[], index: number): PdfSection[] {
  const out: PdfSection[] = [];
  let level = sections[index].level;
  for (let i = index - 1; i >= 0 && level > 0; i--) {
    if (sections[i].level < level) { out.push(sections[i]); level = sections[i].level; }
  }
  return out;
}

/**
 * Selecting a section replaces any selected parts of it and any selected
 * section containing it, so the same pages are never taught twice.
 */
export function togglePdfSection(sections: PdfSection[], selected: string[], id: string): string[] {
  const index = sections.findIndex(s => s.id === id);
  if (index < 0) return selected;
  if (selected.includes(id)) return selected.filter(x => x !== id);
  const overlapping = new Set([...pdfSectionDescendants(sections, index), ...pdfSectionAncestors(sections, index)].map(s => s.id));
  return [...selected.filter(x => !overlapping.has(x)), id];
}

export function mainPdfSections(sections: PdfSection[]): PdfSection[] {
  if (!sections.length) return [];
  const level = Math.min(...sections.map(s => s.level));
  const roots = sections.filter(s => s.level === level && !FRONT_OR_BACK_MATTER.test(s.title.trim()));
  const hasChildren = (root: PdfSection) => pdfSectionDescendants(sections, sections.indexOf(root)).some(s => s.level === level + 1);
  // A single book wrapper, or a book divided into "Part …" groupings, should
  // expose the chapters inside by default rather than the wrappers themselves.
  const wrappers = roots.length > 0 && roots.every(hasChildren) && (roots.length === 1 || roots.every(r => GROUPING_HEADING.test(r.title.trim())));
  const candidates = wrappers ? sections.filter(s => s.level === level + 1) : roots;
  return candidates.filter(s => !FRONT_OR_BACK_MATTER.test(s.title.trim()));
}
