import type { ChatMessage, CheckAttempt, LearningCheck } from "../../types";
import type { PdfBook, CurriculumSource, PdfSection } from "./pdfContents";
import type { PdfReadingRange } from "./pdfReader";
import { validateLearningCheck } from "./checks";

export interface ReadingDocument {
  trackId: string;
  name: string;
  pageCount: number;
  fingerprint?: string;
  file: Blob;
  cover?: Blob;
  sections?: PdfSection[];
}
export interface ReadingRound {
  check: LearningCheck;
  attempt?: CheckAttempt;
  teaching?: ChatMessage;
  supported?: boolean;
  bookOpen?: boolean;
}
export interface ReadingStop {
  id: string;
  range: PdfReadingRange;
  rounds: ReadingRound[];
  roundIndex: number;
  questions: { question: string; answer: string }[];
  pendingQuestion?: string;
}
export interface ReadingState {
  version: 1;
  trackId: string;
  from: number;
  to: number;
  stops: ReadingStop[];
  activeStopId?: string;
  updatedAt: number;
}
const DATABASE = "learnforge-reading";
const deletedTracks = new Set<string>();
export const READING_CHANGED = "learnforge:reading-changed";
function changed(trackId: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(READING_CHANGED, { detail: trackId }));
}
function storageError(error: unknown) {
  const quota =
    error instanceof DOMException && error.name === "QuotaExceededError";
  return new Error(
    quota
      ? "There isn’t enough local storage to save this PDF. Free some device space and retry. Your current work is still on screen."
      : "Local PDF storage is unavailable. Your current work is still on screen; retry saving before leaving."
  );
}
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(storageError(null));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("documents", { keyPath: "trackId" });
      request.result.createObjectStore("reading", { keyPath: "trackId" });
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () =>
      reject(
        new Error("Close other LearnForge windows and retry saving the PDF.")
      );
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => IDBRequest<T>
): Promise<T> {
  const db = await openStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let request: IDBRequest<T>;
      try {
        request = action(tx);
      } catch (error) {
        tx.abort();
        reject(storageError(error));
        return;
      }
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(storageError(tx.error || request.error));
    });
  } finally {
    db.close();
  }
}

export function matchesReadingDocument(
  book: Pick<PdfBook, "fingerprint" | "pageCount" | "name">,
  source: CurriculumSource
) {
  if (source.fingerprint)
    return (
      source.fingerprint === book.fingerprint &&
      (!source.pageCount || source.pageCount === book.pageCount)
    );
  return (
    book.name === source.name &&
    (!source.pageCount || source.pageCount === book.pageCount) &&
    source.sections.every((s) => !s.pageEnd || s.pageEnd <= book.pageCount)
  );
}
export async function saveReadingDocument(
  trackId: string,
  book: PdfBook
): Promise<void> {
  const file =
    book.file ||
    (book.bytes
      ? new Blob([book.bytes.slice().buffer as ArrayBuffer], {
          type: "application/pdf",
        })
      : undefined);
  if (!file)
    throw new Error(
      "Choose the original PDF again before saving it for reading."
    );
  const record: ReadingDocument = {
    trackId,
    name: book.name,
    pageCount: book.pageCount,
    fingerprint: book.fingerprint,
    file,
    sections: book.sections,
  };
  // Cover rendering must never prevent saving a valid source document.
  try {
    record.cover = await (await import("./pdfReader")).renderPdfCover(file);
  } catch {
    /* Show the document placeholder. */
  }
  await transaction(["documents"], "readwrite", (tx) => {
    if (deletedTracks.has(trackId))
      throw new Error("This topic has been deleted.");
    return tx.objectStore("documents").put(record);
  });
  changed(trackId);
}
export async function loadReadingDocument(
  trackId: string
): Promise<ReadingDocument | undefined> {
  const result = await transaction<ReadingDocument | undefined>(
    ["documents"],
    "readonly",
    (tx) => tx.objectStore("documents").get(trackId)
  );
  if (
    result &&
    (!(result.file instanceof Blob) ||
      result.trackId !== trackId ||
      (result.cover !== undefined && !(result.cover instanceof Blob)) ||
      (result.sections !== undefined &&
        (!Array.isArray(result.sections) ||
          result.sections.some(
            (s) =>
              !s ||
              typeof s.id !== "string" ||
              typeof s.title !== "string" ||
              !Number.isInteger(s.level)
          ))) ||
      !Number.isInteger(result.pageCount) ||
      result.pageCount < 1)
  )
    throw new Error(
      "The saved PDF could not be opened. Reconnect the original file; your reading stops are kept separately."
    );
  return result;
}
/** Roll back an original saved for a new outline if creating that outline fails. */
export async function discardUnapprovedReadingDocument(
  trackId: string
): Promise<void> {
  await transaction(["documents"], "readwrite", (tx) =>
    tx.objectStore("documents").delete(trackId)
  );
  changed(trackId);
}
export function newReadingState(trackId: string, page = 1): ReadingState {
  return {
    version: 1,
    trackId,
    from: page,
    to: page,
    stops: [],
    updatedAt: Date.now(),
  };
}
export async function loadReadingState(
  trackId: string
): Promise<ReadingState | undefined> {
  const state = await transaction<ReadingState | undefined>(
    ["reading"],
    "readonly",
    (tx) => tx.objectStore("reading").get(trackId)
  );
  if (
    state &&
    (state.version !== 1 ||
      state.trackId !== trackId ||
      !Array.isArray(state.stops) ||
      !Number.isInteger(state.from) ||
      !Number.isInteger(state.to) ||
      state.from < 1 ||
      state.to < state.from ||
      new Set(state.stops.map((s) => s?.id)).size !== state.stops.length ||
      (state.activeStopId !== undefined &&
        !state.stops.some((s) => s?.id === state.activeStopId)) ||
      state.stops.some(
        (s) =>
          !s?.id ||
          !Array.isArray(s.range?.pages) ||
          !Number.isInteger(s.range.from) ||
          !Number.isInteger(s.range.to) ||
          s.range.from < 1 ||
          s.range.to < s.range.from ||
          s.range.pages.length !== s.range.to - s.range.from + 1 ||
          s.range.pages.some(
            (p, i) =>
              !p ||
              p.number !== s.range.from + i ||
              typeof p.text !== "string" ||
              (p.label !== undefined && typeof p.label !== "string")
          ) ||
          !Array.isArray(s.rounds) ||
          !Array.isArray(s.questions) ||
          s.questions.some(
            (q) =>
              !q ||
              typeof q.question !== "string" ||
              typeof q.answer !== "string"
          ) ||
          (s.pendingQuestion !== undefined &&
            typeof s.pendingQuestion !== "string") ||
          !Number.isInteger(s.roundIndex) ||
          s.roundIndex < 0 ||
          s.roundIndex >= Math.max(1, s.rounds.length) ||
          s.rounds.some(
            (r) =>
              !r ||
              !validateLearningCheck(r.check) ||
              typeof r.check.id !== "string" ||
              r.check.milestoneId !== s.id ||
              (r.teaching &&
                (typeof r.teaching.content !== "string" ||
                  typeof r.teaching.id !== "string")) ||
              (r.attempt &&
                (r.attempt.checkId !== r.check.id ||
                  r.attempt.milestoneId !== r.check.milestoneId ||
                  !Array.isArray(r.attempt.selectedIds) ||
                  typeof r.attempt.thinking !== "string" ||
                  typeof r.attempt.dontKnow !== "boolean" ||
                  !Number.isFinite(r.attempt.submittedAt)))
          )
      ))
  )
    throw new Error(
      "The reading bookmark could not be restored. Your saved data has been preserved."
    );
  return state;
}
export async function saveReadingState(state: ReadingState): Promise<void> {
  if (deletedTracks.has(state.trackId))
    throw new Error("This topic has been deleted.");
  await transaction(["reading"], "readwrite", (tx) => {
    if (deletedTracks.has(state.trackId))
      throw new Error("This topic has been deleted.");
    return tx.objectStore("reading").put(state);
  });
  changed(state.trackId);
}
export async function deleteReadingData(trackId: string): Promise<void> {
  deletedTracks.add(trackId);
  try {
    await transaction(["documents", "reading"], "readwrite", (tx) => {
      tx.objectStore("documents").delete(trackId);
      return tx.objectStore("reading").delete(trackId);
    });
  } catch (error) {
    deletedTracks.delete(trackId);
    throw error;
  }
  // Question drafts/support/help are small UI records; their ownership is in the key.
  const marker = `reading:${trackId}:`;
  for (const key of Object.keys(localStorage))
    if (key.includes(marker)) localStorage.removeItem(key);
}
