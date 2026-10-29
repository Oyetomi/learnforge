/**
 * Cross-Topic Concept Ledger
 *
 * Persists demonstrated abilities across sessions and topics locally so new
 * curricula, lessons, and tutoring turns compound on what the learner has
 * already proved (or explicitly imported from personal study notes), rather
 * than restarting every adjacent topic from zero.
 */

export type ConceptSource = "readiness" | "retention" | "imported";

export interface ConceptLedgerEntry {
  id: string;
  title: string;
  outcome: string;
  trackId: string;
  trackTitle: string;
  milestoneId?: string;
  language?: string | null;
  source: ConceptSource;
  demonstratedAt: number;
}

export const CONCEPT_LEDGER_KEY = "learnforge:concept-ledger";
const MAX_LEDGER_ENTRIES = 240;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "how",
  "what",
  "when",
  "where",
  "why",
  "which",
  "use",
  "using",
  "used",
  "learn",
  "learning",
  "understand",
  "understanding",
  "basic",
  "basics",
  "about",
  "can",
  "will",
  "able",
  "one",
  "two",
  "new",
  "first",
]);

function getStorage(): Storage | null {
  try {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    if (desc?.get && typeof window === "undefined") return null;
    const storage = globalThis.localStorage;
    if (
      storage &&
      typeof storage.getItem === "function" &&
      typeof storage.setItem === "function"
    ) {
      return storage;
    }
  } catch {}
  return null;
}

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function normalizeEntry(raw: unknown): ConceptLedgerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = cleanText(item.id, 120);
  const title = cleanText(item.title, 180);
  const outcome = cleanText(item.outcome, 420);
  const trackId = cleanText(item.trackId, 120);
  const trackTitle = cleanText(item.trackTitle, 180);
  const source: ConceptSource =
    item.source === "retention" || item.source === "imported"
      ? item.source
      : "readiness";
  if (!id || !title || !outcome || !trackId) return null;
  return {
    id,
    title,
    outcome,
    trackId,
    trackTitle: trackTitle || title,
    milestoneId: cleanText(item.milestoneId, 120) || undefined,
    language:
      typeof item.language === "string" && item.language.trim()
        ? item.language.trim().slice(0, 40)
        : null,
    source,
    demonstratedAt:
      typeof item.demonstratedAt === "number" &&
      Number.isFinite(item.demonstratedAt)
        ? item.demonstratedAt
        : 0,
  };
}

export function loadConceptLedger(): ConceptLedgerEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(CONCEPT_LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is ConceptLedgerEntry => entry !== null)
      .sort((a, b) => b.demonstratedAt - a.demonstratedAt)
      .slice(0, MAX_LEDGER_ENTRIES);
  } catch {
    return [];
  }
}

function saveConceptLedger(entries: ConceptLedgerEntry[]): ConceptLedgerEntry[] {
  const bounded = [...entries]
    .sort((a, b) => b.demonstratedAt - a.demonstratedAt)
    .slice(0, MAX_LEDGER_ENTRIES);
  const storage = getStorage();
  if (storage) {
    try {
      if (bounded.length === 0) {
        if (typeof storage.removeItem === "function") {
          storage.removeItem(CONCEPT_LEDGER_KEY);
        } else {
          storage.setItem(CONCEPT_LEDGER_KEY, "[]");
        }
      } else {
        storage.setItem(CONCEPT_LEDGER_KEY, JSON.stringify(bounded));
      }
    } catch {}
  }
  return bounded;
}

function dedupeSignature(entry: {
  milestoneId?: string;
  title: string;
  outcome: string;
  trackId: string;
}): string {
  if (entry.milestoneId) return `m:${entry.milestoneId}`;
  return `t:${entry.trackId}:${entry.title.toLowerCase()}:${entry.outcome
    .toLowerCase()
    .slice(0, 120)}`;
}

export function recordDemonstratedConcept(
  input: Omit<ConceptLedgerEntry, "id" | "demonstratedAt"> & {
    id?: string;
    demonstratedAt?: number;
  }
): ConceptLedgerEntry[] {
  const title = cleanText(input.title, 180);
  const outcome = cleanText(input.outcome || input.title, 420);
  const trackId = cleanText(input.trackId, 120);
  if (!title || !outcome || !trackId) return loadConceptLedger();

  const now = input.demonstratedAt ?? Date.now();
  const candidate: ConceptLedgerEntry = {
    id:
      cleanText(input.id, 120) ||
      (input.milestoneId
        ? `concept:${input.milestoneId}`
        : `concept:${now.toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 7)}`),
    title,
    outcome,
    trackId,
    trackTitle: cleanText(input.trackTitle, 180) || title,
    milestoneId: cleanText(input.milestoneId, 120) || undefined,
    language: input.language ?? null,
    source: input.source,
    demonstratedAt: now,
  };

  const existing = loadConceptLedger();
  const sig = dedupeSignature(candidate);
  const next = existing.filter((item) => dedupeSignature(item) !== sig);
  next.unshift(candidate);
  return saveConceptLedger(next);
}

export function tokenizeConceptQuery(text: string): string[] {
  const matches = text
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}+#._-]{1,39}/gu);
  if (!matches) return [];
  return [...new Set(matches.filter((token) => !STOP_WORDS.has(token)))];
}

export function relevantPriorConcepts(
  query: string,
  options?: {
    excludeTrackId?: string;
    limit?: number;
    entries?: ConceptLedgerEntry[];
  }
): ConceptLedgerEntry[] {
  const limit = Math.max(1, Math.min(20, options?.limit ?? 8));
  const pool = (options?.entries ?? loadConceptLedger()).filter(
    (entry) => !options?.excludeTrackId || entry.trackId !== options.excludeTrackId
  );
  if (!pool.length) return [];

  const queryTokens = tokenizeConceptQuery(query);
  if (!queryTokens.length) return pool.slice(0, limit);

  const scored = pool
    .map((entry) => {
      const hayTokens = new Set(
        tokenizeConceptQuery(
          `${entry.title} ${entry.outcome} ${entry.trackTitle} ${
            entry.language || ""
          }`
        )
      );
      let score = 0;
      for (const q of queryTokens) {
        if (hayTokens.has(q)) {
          score += 3;
        } else {
          for (const h of hayTokens) {
            if (
              (q.length >= 4 && h.startsWith(q)) ||
              (h.length >= 4 && q.startsWith(h))
            ) {
              score += 1.5;
              break;
            }
          }
        }
      }
      if (entry.source !== "imported" && score > 0) score += 0.5;
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.demonstratedAt - a.entry.demonstratedAt
    );

  return scored.slice(0, limit).map((item) => item.entry);
}

export function formatPriorConceptsForPrompt(
  entries: ConceptLedgerEntry[]
): Array<{
  concept: string;
  outcome: string;
  fromTopic: string;
  evidenceLevel: "verified-in-practice" | "learner-imported-note";
}> {
  return entries.map((entry) => ({
    concept: entry.title,
    outcome: entry.outcome,
    fromTopic: entry.trackTitle,
    evidenceLevel:
      entry.source === "imported"
        ? "learner-imported-note"
        : "verified-in-practice",
  }));
}

/**
 * Extracts concise concept entries from Markdown study notes (headings or bulleted
 * takeaways) so learners can seed prior familiarity from existing personal notes.
 */
export function importNotesIntoLedger(
  sourceName: string,
  markdown: string
): number {
  const cleanSource = cleanText(sourceName || "Imported notes", 100) || "Imported notes";
  const lines = markdown.split(/\r?\n/);
  const extracted: Array<{ title: string; outcome: string }> = [];

  let activeHeading = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("```")) continue;

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      activeHeading = cleanText(
        headingMatch[1].replace(/[*_`~]/g, ""),
        140
      );
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      const body = bulletMatch[1].replace(/[*_`~]/g, "").trim();
      const colonIdx = body.indexOf(":");
      if (colonIdx > 1 && colonIdx < 80) {
        const title = cleanText(body.slice(0, colonIdx), 140);
        const outcome = cleanText(body.slice(colonIdx + 1), 320);
        if (title && outcome.length >= 6) {
          extracted.push({ title, outcome });
          continue;
        }
      }
      if (body.length >= 12) {
        extracted.push({
          title: activeHeading || cleanText(body, 72),
          outcome: cleanText(body, 320),
        });
      }
    } else if (activeHeading && line.length >= 16 && !line.startsWith(">")) {
      extracted.push({
        title: activeHeading,
        outcome: cleanText(line.replace(/[*_`~]/g, ""), 320),
      });
      activeHeading = "";
    }
    if (extracted.length >= 30) break;
  }

  if (!extracted.length) return 0;

  const existing = loadConceptLedger();
  const seen = new Set(existing.map(dedupeSignature));
  let added = 0;
  const now = Date.now();
  const trackId = `imported:${cleanSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40) || "notes"}`;

  for (const item of extracted) {
    const candidate: ConceptLedgerEntry = {
      id: `import:${now.toString(36)}-${added}`,
      title: item.title,
      outcome: item.outcome,
      trackId,
      trackTitle: cleanSource,
      source: "imported",
      demonstratedAt: now - added,
    };
    const sig = dedupeSignature(candidate);
    if (seen.has(sig)) continue;
    seen.add(sig);
    existing.unshift(candidate);
    added += 1;
  }

  if (added > 0) saveConceptLedger(existing);
  return added;
}

export function removeTrackConcepts(trackId: string): void {
  const storage = getStorage();
  if (!storage || !trackId) return;
  try {
    if (!storage.getItem(CONCEPT_LEDGER_KEY)) return;
  } catch {
    return;
  }
  const current = loadConceptLedger();
  const filtered = current.filter((entry) => entry.trackId !== trackId);
  if (filtered.length !== current.length) {
    saveConceptLedger(filtered);
  }
}

export function clearConceptLedger(): void {
  saveConceptLedger([]);
}
