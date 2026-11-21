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
    const nextSibling = sections.slice(index + 1).find(n => n.level <= s.level);
    if (!nextSibling) return { ...s, pageEnd: pageCount };
    if (nextSibling.pageStart === undefined) {
      const existingEnd = s.pageEnd && s.pageEnd >= start && s.pageEnd <= pageCount ? s.pageEnd : undefined;
      return { ...s, pageEnd: existingEnd };
    }
    if (nextSibling.pageStart >= start) {
      return { ...s, pageEnd: Math.max(start, nextSibling.pageStart - 1) };
    }
    const later = sections.slice(index + 1).find(n => n.level <= s.level && n.pageStart && n.pageStart >= start);
    return { ...s, pageEnd: later?.pageStart ? Math.max(start, later.pageStart - 1) : pageCount };
  });
}
const SKIP_MARKER = "[... skipped intermediate pages ...]";

const CHAPTER_DIGEST_PATTERNS: { pattern: RegExp; weight: number; maxHits: number }[] = [
  { pattern: /\bputting it all together\b/gi, weight: 6, maxHits: 1 },
  { pattern: /\bgoal\s*:/gi, weight: 5, maxHits: 2 },
  { pattern: /\blisting\b/gi, weight: 5, maxHits: 3 },
  { pattern: /\bproject\b/gi, weight: 4, maxHits: 2 },
  { pattern: /\biteration\b/gi, weight: 4, maxHits: 2 },
  { pattern: /\bexample\s*:/gi, weight: 4, maxHits: 2 },
  { pattern: /\bexercise(?:s)?\b/gi, weight: 4, maxHits: 2 },
  { pattern: /\bsummary\b/gi, weight: 4, maxHits: 1 },
  { pattern: /\b(?:main\.go|go\.mod|go\.work)\b/gi, weight: 5, maxHits: 3 },
  { pattern: /\b(?:func|package|type)\s+[a-zA-Z_]/g, weight: 3, maxHits: 4 },
  { pattern: /\b(?:struct|interface)\b/g, weight: 3, maxHits: 3 },
  { pattern: /\b(?:cli|workspace|module|handler|endpoint)\b/gi, weight: 2, maxHits: 3 },
  { pattern: /\b(?:test|benchmark|fuzz)\b/gi, weight: 2, maxHits: 3 },
  { pattern: /\b(?:def|class|fn|impl|async|cargo\.toml|main\.(?:py|rs|ts|js))\b/gi, weight: 2, maxHits: 3 },
];

function renderDigestPages(selected: { number: number; text: string }[]): string {
  if (!selected.length) return "";
  const ordered = [...selected].sort((a, b) => a.number - b.number);
  const parts: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && ordered[i].number > ordered[i - 1].number + 1) {
      parts.push(SKIP_MARKER);
    }
    parts.push(`PDF page ${ordered[i].number}\n${ordered[i].text}`);
  }
  return parts.join("\n\n");
}

function scoreDigestPage(text: string): number {
  let score = 0;
  for (const { pattern, weight, maxHits } of CHAPTER_DIGEST_PATTERNS) {
    const matches = text.match(pattern);
    if (matches?.length) {
      score += Math.min(matches.length, maxHits) * weight;
    }
  }
  return score;
}

function fitMandatoryPages(
  mandatory: { number: number; text: string }[],
  budget: number
): { number: number; text: string }[] {
  if (renderDigestPages(mandatory).length <= budget) return mandatory;
  const overhead = renderDigestPages(mandatory.map((p) => ({ number: p.number, text: "" }))).length;
  const available = budget - overhead;
  if (available <= 0) {
    const first = mandatory[0];
    const header = `PDF page ${first.number}\n`;
    const room = Math.max(0, budget - header.length);
    return room > 0 ? [{ number: first.number, text: first.text.slice(0, room) }] : [];
  }
  const caps = new Map<number, number>();
  let remaining = available;
  let unresolved = mandatory.map((p, idx) => ({ idx, len: p.text.length }));
  while (unresolved.length > 0) {
    const share = Math.floor(remaining / unresolved.length);
    const fits = unresolved.filter((u) => u.len <= share);
    if (!fits.length) {
      for (const u of unresolved) caps.set(u.idx, share);
      break;
    }
    for (const u of fits) {
      caps.set(u.idx, u.len);
      remaining -= u.len;
    }
    unresolved = unresolved.filter((u) => u.len > share);
  }
  return mandatory.map((p, idx) => {
    const cap = caps.get(idx) ?? 0;
    return cap < p.text.length ? { number: p.number, text: p.text.slice(0, cap).trimEnd() } : p;
  });
}

/**
 * Builds a bounded chapter digest that preserves opening pages, ending/summary,
 * project/code/listing pages, and evenly spaced coverage across chapter thirds.
 */
export function buildChapterDigest(
  pages: { number: number; text: string }[],
  budget = 24000
): { text: string; truncated: boolean } {
  const nonEmpty = pages
    .filter((p) => p.text.trim().length > 0)
    .sort((a, b) => a.number - b.number);
  if (!nonEmpty.length) return { text: "", truncated: false };

  const full = nonEmpty.map((p) => `PDF page ${p.number}\n${p.text}`).join("\n\n");
  if (full.length <= budget) return { text: full, truncated: false };
  if (budget <= 0) return { text: "", truncated: true };

  const mandatoryIndices = new Set<number>([0]);
  if (nonEmpty.length > 1) mandatoryIndices.add(1);
  if (nonEmpty.length > 2) mandatoryIndices.add(nonEmpty.length - 1);

  const mandatoryPages = [...mandatoryIndices]
    .sort((a, b) => a - b)
    .map((idx) => nonEmpty[idx]);
  const selected = fitMandatoryPages(mandatoryPages, budget);

  const remaining = nonEmpty.filter((_, idx) => !mandatoryIndices.has(idx));
  if (remaining.length > 0 && renderDigestPages(selected).length < budget) {
    const scored = remaining.map((page, idx) => ({
      page,
      idx,
      projectScore: scoreDigestPage(page.text),
      score: 0,
    }));
    for (const item of scored) item.score = item.projectScore;

    // Add evenly spaced coverage bonuses across early, middle, and late thirds.
    const count = scored.length;
    const primaryAnchors = new Set<number>([
      Math.floor(count / 6),
      Math.floor((count * 3) / 6),
      Math.floor((count * 5) / 6),
    ]);
    for (const anchor of primaryAnchors) {
      if (anchor >= 0 && anchor < count) scored[anchor].score += 3;
    }
    if (count >= 6) {
      const secondaryAnchors = new Set<number>([
        Math.floor((count * 2) / 6),
        Math.floor((count * 4) / 6),
      ]);
      for (const anchor of secondaryAnchors) {
        if (anchor >= 0 && anchor < count && !primaryAnchors.has(anchor)) {
          scored[anchor].score += 1.5;
        }
      }
    }

    // Boost the strongest project/implementation page in each third so all thirds stay represented.
    const thirdBounds: [number, number][] = [
      [0, Math.ceil(count / 3)],
      [Math.ceil(count / 3), Math.ceil((2 * count) / 3)],
      [Math.ceil((2 * count) / 3), count],
    ];
    for (const [start, end] of thirdBounds) {
      if (start >= end) continue;
      let best: (typeof scored)[number] | null = null;
      for (let i = start; i < end; i++) {
        const item = scored[i];
        if (item.projectScore > 0 && (!best || item.projectScore > best.projectScore)) {
          best = item;
        }
      }
      if (best) best.score += 2;
    }

    scored.sort((a, b) => b.score - a.score || a.page.number - b.page.number);

    for (const { page } of scored) {
      const withWhole = [...selected, page];
      if (renderDigestPages(withWhole).length <= budget) {
        selected.push(page);
        continue;
      }
      const overheadWithEmpty = renderDigestPages([...selected, { number: page.number, text: "" }]).length;
      const available = budget - overheadWithEmpty;
      if (available >= 80) {
        const trimmed = page.text.slice(0, available).trimEnd();
        if (trimmed) {
          selected.push({ number: page.number, text: trimmed });
        }
      }
      break;
    }
  }

  return { text: renderDigestPages(selected), truncated: true };
}

export function selectedPdfSource(book: PdfBook, ids: string[]): { source: CurriculumSource; references: LearningReference[] } {
  const sections = book.sections.filter(section => ids.includes(section.id));
  if (!sections.length) throw new Error("Choose at least one chapter for your curriculum.");
  if (sections.length > 48) throw new Error("Choose up to 48 sections for one curriculum. You can create another path for the remaining chapters.");
  const references = sections.map(s => {
    const sectionPages = s.pageStart && s.pageEnd
      ? book.pages
          .slice(s.pageStart - 1, s.pageEnd)
          .map((text, i) => ({ number: s.pageStart! + i, text }))
          .filter(page => page.text.trim())
      : [];
    const hasText = sectionPages.length > 0;
    const digest = hasText ? buildChapterDigest(sectionPages, 24000) : { text: "", truncated: false };
    const ref = createLearningReference(`${book.name} · ${s.title}`, hasText ? digest.text :
      `Contents heading only: ${s.title}. Chapter text was not readable or its PDF page range is unresolved. Do not attribute explanations or answers to this chapter.`)!;
    return { ...ref, id: `${ref.id}:${s.id}`, sectionId: s.id,
      truncated: digest.truncated || ref.truncated || (s.pageStart && s.pageEnd ?
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
