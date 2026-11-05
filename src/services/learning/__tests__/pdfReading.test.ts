import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  deleteReadingData,
  discardUnapprovedReadingDocument,
  loadReadingDocument,
  loadReadingState,
  matchesReadingDocument,
  newReadingState,
  saveReadingDocument,
  saveReadingState,
  type ReadingStop,
} from "../readingStore";
import {
  acceptReadingAttempt,
  readingMilestone,
  readingPlan,
  readingReferences,
  readingRequest,
  nextReadingSection,
} from "../pdfReading";
import { questionReviewIdentity } from "../questionReview";
import { helpRequest } from "../sessionHelp";
import type { CheckAttempt, LearningCheck } from "../../../types";

class MemoryStorage {
  [key: string]: unknown;
  getItem(k: string) {
    return typeof this[k] === "string" ? (this[k] as string) : null;
  }
  setItem(k: string, v: string) {
    this[k] = String(v);
  }
  removeItem(k: string) {
    delete this[k];
  }
  key(i: number) {
    return Object.keys(this)[i] ?? null;
  }
  get length() {
    return Object.keys(this).length;
  }
}
const check: LearningCheck = {
  id: "reading:book:stop:question",
  milestoneId: "reading:book:stop",
  question: "What does a budget compare?",
  options: [
    { id: "available", label: "Income and costs" },
    { id: "prices", label: "Only shopping prices" },
  ],
  correctOptionIds: ["available"],
  explanation: "Income sets the money available for planned costs.",
  multiple: false,
  practice: "independent",
};
function fixture(): ReadingStop {
  return {
    id: check.milestoneId,
    range: {
      from: 43,
      to: 44,
      requestedTo: 44,
      pages: [
        {
          number: 43,
          label: "25",
          text: "A budget compares income and costs.",
        },
        {
          number: 44,
          label: "26",
          text: "Plan essential costs before flexible spending.",
        },
      ],
    },
    rounds: [{ check }],
    roundIndex: 0,
    questions: [],
  };
}
function attempt(stop: ReadingStop): CheckAttempt {
  return {
    checkId: check.id,
    milestoneId: stop.id,
    selectedIds: ["available"],
    dontKnow: false,
    correct: true,
    thinking: "I compare what I receive with what I need to spend.",
    confidence: "confident",
    submittedAt: 100,
    questionReview: {
      identity: questionReviewIdentity(check, readingReferences(stop)),
      model: "offline-test",
      reviewedAt: 99,
    },
  };
}
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", new MemoryStorage());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("durable reading documents and bookmarks", () => {
  it("can roll back a PDF after outline saving fails and save it again on retry", async () => {
    const book = {
      name: "Retry.pdf",
      pageCount: 1,
      file: new Blob(["source"]),
      pages: [],
      sections: [],
      contentsFrom: "none" as const,
      truncated: false,
    };
    await saveReadingDocument("retry-outline", book);
    await discardUnapprovedReadingDocument("retry-outline");
    expect(await loadReadingDocument("retry-outline")).toBeUndefined();
    await saveReadingDocument("retry-outline", book);
    expect(
      await (await loadReadingDocument("retry-outline"))!.file.text()
    ).toBe("source");
  });
  it("stores the original Blob separately, and resumes the exact unanswered question and printed numbering", async () => {
    const file = new Blob(["PDF bytes retained locally"], {
      type: "application/pdf",
    });
    await saveReadingDocument("book", {
      name: "Book.pdf",
      pageCount: 731,
      fingerprint: "same-edition",
      file,
      pages: [],
      sections: [],
      contentsFrom: "bookmarks",
      truncated: false,
    });
    const stop = fixture(),
      state = {
        ...newReadingState("book", 43),
        to: 44,
        activeStopId: stop.id,
        stops: [stop],
      };
    await saveReadingState(state);
    const restoredFile = await loadReadingDocument("book"),
      restored = await loadReadingState("book");
    expect(await restoredFile!.file.text()).toBe("PDF bytes retained locally");
    expect(restored).toEqual(state);
    expect(restored!.stops[0].range.pages[0]).toMatchObject({
      number: 43,
      label: "25",
    });
    expect(JSON.stringify(restored)).not.toContain("PDF bytes");
    expect(localStorage.length).toBe(0);
  });
  it("restores submitted work and feedback without regenerating or advancing it", async () => {
    const stop = fixture();
    stop.rounds[0].attempt = attempt(stop);
    stop.rounds[0].teaching = {
      id: "saved-teaching",
      session_id: stop.id,
      role: "assistant",
      content: "A worked explanation of your original answer.",
      created_at: 101,
    };
    stop.pendingQuestion = "Why compare both?";
    await saveReadingState({
      ...newReadingState("book", 43),
      stops: [stop],
      activeStopId: stop.id,
    });
    const restored = await loadReadingState("book");
    expect(restored!.stops[0]).toEqual(stop);
    expect(restored!.stops[0].roundIndex).toBe(0);
  });
  it("reports quota/storage failure without claiming the PDF was saved", async () => {
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await expect(saveReadingState(newReadingState("book"))).rejects.toThrow(
      "enough local storage"
    );
    expect(await loadReadingState("book")).toBeUndefined();
  });
  it("deletes only this topic’s original PDF, bookmark, drafts and support", async () => {
    for (const id of ["book", "other"]) {
      await saveReadingState(newReadingState(id));
      await saveReadingDocument(id, {
        name: "Book.pdf",
        pageCount: 1,
        file: new Blob([id]),
        pages: [],
        sections: [],
        contentsFrom: "none",
        truncated: false,
      });
      localStorage.setItem(
        `learnforge:check-draft:reading:${id}:stop:q`,
        "draft"
      );
    }
    await deleteReadingData("book");
    expect(await loadReadingState("book")).toBeUndefined();
    expect(await loadReadingDocument("book")).toBeUndefined();
    expect(await loadReadingDocument("other")).toBeDefined();
    expect(
      localStorage.getItem("learnforge:check-draft:reading:other:stop:q")
    ).toBe("draft");
    expect(
      localStorage.getItem("learnforge:check-draft:reading:book:stop:q")
    ).toBeNull();
    await expect(saveReadingState(newReadingState("book"))).rejects.toThrow(
      "deleted"
    );
    expect(await loadReadingState("book")).toBeUndefined();
  });
  it("preserves an unreadable bookmark rather than overwriting it on restore", async () => {
    const bad = {
      ...newReadingState("corrupt-book"),
      activeStopId: "bad",
      stops: [
        {
          ...fixture(),
          id: "bad",
          range: { ...fixture().range, pages: [{ number: 43, text: null }] },
        },
      ],
    };
    await saveReadingState(bad as never);
    await expect(loadReadingState("corrupt-book")).rejects.toThrow(
      "bookmark could not be restored"
    );
    await expect(loadReadingState("corrupt-book")).rejects.toThrow(
      "bookmark could not be restored"
    );
  });
  it("rejects a different edition, while allowing a renamed copy with matching PDF fingerprint", () => {
    const source = {
      name: "Original.pdf",
      fingerprint: "edition-1",
      pageCount: 731,
      sections: [],
    };
    expect(
      matchesReadingDocument(
        { name: "Renamed.pdf", fingerprint: "edition-1", pageCount: 731 },
        source
      )
    ).toBe(true);
    expect(
      matchesReadingDocument(
        { name: "Original.pdf", fingerprint: "edition-2", pageCount: 731 },
        source
      )
    ).toBe(false);
  });
});
describe("page-bound teaching and evidence", () => {
  it("uses real section boundaries for the next stop and recommends staying with an idea after difficulty", () => {
    const stop = fixture(),
      sections = [
        {
          id: "next",
          title: "An actual next section",
          level: 1,
          pageStart: 45,
          pageEnd: 49,
        },
      ];
    stop.rounds[0].attempt = attempt(stop);
    expect(nextReadingSection(stop, sections, 100)).toMatchObject({
      from: 45,
      to: 49,
      title: "An actual next section",
    });
    stop.rounds[0].attempt = { ...attempt(stop), correct: false };
    expect(nextReadingSection(stop, sections, 100)).toMatchObject({
      from: 45,
      to: 45,
    });
    expect(nextReadingSection(stop, sections, 100)?.advice).toContain(
      "revisit PDF 43–44"
    );
    expect(nextReadingSection(stop, sections, 44)).toBeNull();
  });
  it("keeps future curriculum material out of question, feedback, side questions and all help kinds", () => {
    const stop = fixture();
    stop.rounds[0].attempt = attempt(stop);
    for (const operation of ["question", "tutoring", "ask"] as const) {
      const messages = readingRequest(
        stop,
        operation,
        stop.rounds[0],
        "Explain this page"
      );
      expect(messages[0].content).toContain(
        "ONLY the provided covered-page text"
      );
      const payload = JSON.parse(messages[1].content);
      expect(payload.coveredPdfPages).toEqual({ from: 43, to: 44 });
      expect(
        payload.sourcePages.map((p: { number: number }) => p.number)
      ).toEqual([43, 44]);
      expect(messages[1].content).not.toContain("curriculum");
    }
    for (const kind of ["hint", "walkthrough", "visual"] as const) {
      const messages = helpRequest(
        kind,
        readingMilestone(stop),
        check,
        "Explain the current reading",
        false
      );
      expect(messages[0].content).toContain("READING COMPANION BOUNDARY");
      expect(messages[0].content).toContain("Do not reveal the answer");
      expect(messages[1].content).toContain("PDF page 43 (printed 25)");
    }
  });
  it("asks before explaining, hides keys from side questions, and never awards curriculum readiness", () => {
    const stop = fixture(),
      initial = { ...stop, rounds: [] };
    expect(readingRequest(initial, "question")[0].content).toContain(
      "never a lecture or the answer"
    );
    const ask = readingRequest(stop, "ask", stop.rounds[0], "Help");
    expect(ask[1].content).not.toContain("correctOptionIds");
    expect(ask[1].content).not.toContain(check.explanation);
    expect(ask[0].content).toContain("Do not change the curriculum");
  });
  it("requires a matching reviewed question, recomputes correctness, and retains supported/open-book status", () => {
    const stop = fixture();
    const a = attempt(stop);
    expect(() =>
      acceptReadingAttempt(stop, stop.rounds[0], {
        ...a,
        questionReview: undefined,
      })
    ).toThrow("reviewed question");
    expect(
      acceptReadingAttempt(
        stop,
        { ...stop.rounds[0], supported: true, bookOpen: true },
        a
      ).assisted
    ).toBe(true);
    expect(
      acceptReadingAttempt(stop, stop.rounds[0], {
        ...a,
        selectedIds: ["prices"],
        correct: true,
      }).correct
    ).toBe(false);
    expect(() =>
      acceptReadingAttempt(stop, { ...stop.rounds[0], attempt: a }, a)
    ).toThrow();
  });
  it("follows a miss with a smaller guided case, then fades cues after supported success", () => {
    const stop = fixture();
    stop.rounds[0].attempt = {
      ...attempt(stop),
      correct: false,
      selectedIds: ["prices"],
    };
    expect(readingPlan(stop).stage).toBe("guided");
    expect(readingRequest(stop, "question")[0].content).toContain("smaller");
    stop.rounds[0].attempt = { ...attempt(stop), assisted: true };
    expect(readingPlan(stop).stage).toBe("independent");
  });
});
