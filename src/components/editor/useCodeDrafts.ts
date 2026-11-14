import { useEffect, useRef, useState } from "react";

const DRAFTS_KEY = "learnforge:code-drafts";
const SAVE_DELAY_MS = 350;

export type DraftStatus = "saved" | "saving" | "memory";

/** Stored drafts, keeping only string entries from a well-formed object. */
export function loadCodeDrafts(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored)
      ? Object.fromEntries(
          Object.entries(stored).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : {};
  } catch {
    return {};
  }
}

/**
 * Per-lesson code drafts: typing saves shortly after the last keystroke, and
 * pending edits are flushed when the window hides or closes. If storage is
 * unavailable the drafts stay in memory and `status` says so.
 */
export function useCodeDrafts() {
  const [status, setStatus] = useState<DraftStatus>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drafts = useRef<Record<string, string> | null>(null);
  if (drafts.current === null) drafts.current = loadCodeDrafts();

  const write = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.current));
  };

  /** Save now (also cancels a pending delayed save). */
  const persist = () => {
    try {
      write();
      setStatus("saved");
    } catch {
      setStatus("memory");
    }
  };

  useEffect(() => {
    const flush = () => {
      try {
        write();
      } catch {}
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  return {
    status,
    draftFor: (lessonId: string): string | undefined => drafts.current![lessonId],
    update(lessonId: string, code: string) {
      drafts.current![lessonId] = code;
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(persist, SAVE_DELAY_MS);
    },
    /** Remove drafts for deleted lessons and save immediately. */
    forget(lessonIds: Iterable<string>) {
      for (const id of lessonIds) delete drafts.current![id];
      persist();
    },
    persist,
  };
}
