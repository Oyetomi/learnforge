/**
 * Splits lesson markdown into short, progressive steps so a lesson can be
 * revealed one idea at a time instead of as a single wall of text.
 *
 * Rules:
 * - Fenced code blocks are never split.
 * - Code blocks, lists and quotes stay attached to the paragraph introducing them.
 * - Headings always start a new step.
 * - A step closes after `maxParas` prose paragraphs.
 */

const ATTACHED = /^(```|~~~|[-*+]\s|\d+[.)]\s|>|\|)/;
const HEADING = /^#{1,6}\s/;

function toBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    if (current.length) blocks.push(current.join("\n").trim());
    current = [];
  };
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks.filter(Boolean);
}

export function splitLessonIntoSteps(
  markdown: string | undefined,
  maxParas = 2
): string[] {
  if (!markdown?.trim()) return [];
  const steps: string[] = [];
  let current: string[] = [];
  let prose = 0;
  const flush = () => {
    if (current.length) steps.push(current.join("\n\n"));
    current = [];
    prose = 0;
  };
  for (const block of toBlocks(markdown)) {
    if (HEADING.test(block)) {
      flush();
      current.push(block);
      continue;
    }
    if (ATTACHED.test(block)) {
      current.push(block);
      continue;
    }
    if (prose >= maxParas) flush();
    current.push(block);
    prose++;
  }
  flush();
  return steps;
}

/** Persisted progress shared between the session and the roadmap. */
export const LESSON_STEP_EVENT = "learnforge:lesson-step";
const stepKey = (milestoneId: string) =>
  `learnforge:lesson-step:${milestoneId}`;
const progressKey = (milestoneId: string) =>
  `learnforge:lesson-progress:${milestoneId}`;

const safeSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

/** Index of the furthest revealed step (0-based). */
export function readLessonStep(milestoneId: string | undefined): number {
  if (!milestoneId || typeof localStorage === "undefined") return 0;
  const value = Number(localStorage.getItem(stepKey(milestoneId)));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveLessonStep(milestoneId: string, index: number) {
  if (typeof localStorage !== "undefined")
    safeSet(stepKey(milestoneId), String(index));
}

export interface LessonProgress {
  seen: number;
  total: number;
}

export function readLessonProgress(
  milestoneId: string | undefined
): LessonProgress | null {
  if (!milestoneId || typeof localStorage === "undefined") return null;
  const [seen, total] = (localStorage.getItem(progressKey(milestoneId)) || "")
    .split("/")
    .map(Number);
  return total > 0 ? { seen: Math.min(seen || 0, total), total } : null;
}

/** Record how many steps have been seen and notify the roadmap. */
export function writeLessonProgress(
  milestoneId: string,
  seen: number,
  total: number
) {
  if (typeof localStorage !== "undefined")
    safeSet(progressKey(milestoneId), `${seen}/${total}`);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LESSON_STEP_EVENT, {
        detail: { milestoneId, seen, total },
      })
    );
  }
}

/** Slide-sized information units. Preserve every fenced block and list as authored. */
export function splitLessonIntoSlides(markdown: string | undefined): string[] {
  if (!markdown?.trim()) return [];
  const slides: string[] = [];
  let heading = "";
  for (const block of toBlocks(markdown)) {
    if (HEADING.test(block) && !block.includes("\n\n")) {
      // A heading belongs with the next information unit, never a slide on its own.
      const lines = block.split("\n");
      if (lines.length === 1) {
        heading = heading ? `${heading}\n${block}` : block;
        continue;
      }
    }
    slides.push(heading ? `${heading}\n\n${block}` : block);
    heading = "";
  }
  if (heading) slides.push(heading);
  return slides;
}
