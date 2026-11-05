import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import type { CourseTrack } from "../../services/ai/types";
import type { CheckAttempt, LearningCheck } from "../../types";
import {
  loadReadingDocument,
  loadReadingState,
  matchesReadingDocument,
  newReadingState,
  saveReadingDocument,
  saveReadingState,
  type ReadingDocument,
  type ReadingRound,
  type ReadingState,
  type ReadingStop,
} from "../../services/learning/readingStore";
import {
  readPdfBook,
  readPdfStudyRange,
} from "../../services/learning/pdfReader";
import {
  acceptReadingAttempt,
  explainReading,
  generateReadingQuestion,
  readingMilestone,
  readingPlan,
  readingReferences,
  nextReadingSection,
} from "../../services/learning/pdfReading";
import { ReviewedQuestionCard } from "../learning/ReviewedQuestionCard";
import { AnswerTutoring } from "../learning/AnswerTutoring";
import { LearningHelpPanel } from "../chat/LearningHelpPanel";
import { MarkdownView } from "../chat/MarkdownView";
import { Composer } from "../chat/Composer";
import { recordVisualSupport } from "../../services/learning/preferences";
import type { HelpKind } from "../../services/learning/sessionHelp";
import "../chat/learning-help.css";
import "./reading.css";

export function PdfReadingCompanion({
  track,
  onReturn,
  pageRequest,
}: {
  track: CourseTrack;
  onReturn: () => void;
  pageRequest?: { page: number; at: number };
}) {
  const source = track.curriculum!.sourceDocument!;
  const [state, setState] = useState<ReadingState | null>(null);
  const latest = useRef<ReadingState | null>(null);
  const [document, setDocument] = useState<ReadingDocument>();
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(""),
    [editing, setEditing] = useState(true),
    [help, setHelp] = useState<HelpKind | null>(null);
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    writes = useRef(Promise.resolve());
  const activity = useRef<HTMLElement>(null),
    fromInput = useRef<HTMLInputElement>(null);
  const [from, setFrom] = useState("1"),
    [to, setTo] = useState("1");
  const [history, setHistory] = useState(false);
  const [closedBook, setClosedBook] = useState(false);
  useEffect(() => {
    if (loaded && pageRequest) {
      controller.current?.abort();
      setFrom(String(pageRequest.page));
      setTo(String(pageRequest.page));
      setEditing(true);
      setHelp(null);
    }
  }, [loaded, pageRequest?.at]);
  useEffect(() => {
    mounted.current = true;
    void Promise.allSettled([
      loadReadingState(track.id),
      loadReadingDocument(track.id),
    ]).then(([bookmark, file]) => {
      if (!mounted.current) return;
      if (bookmark.status === "rejected") {
        setError(bookmark.reason.message);
        setLoaded(true);
        return;
      }
      const next =
        bookmark.value ||
        newReadingState(
          track.id,
          source.sections.find((s) => s.pageStart)?.pageStart || 1
        );
      latest.current = next;
      setState(next);
      setFrom(String(next.from));
      setTo(String(next.to));
      setEditing(!next.activeStopId);
      if (file.status === "fulfilled") {
        if (!file.value || matchesReadingDocument(file.value, source))
          setDocument(file.value);
        else
          setError(
            "The stored PDF differs from this curriculum. Reconnect the original file."
          );
      } else setError(file.reason.message);
      setLoaded(true);
    });
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [track.id]);
  const stop = state?.stops.find((s) => s.id === state.activeStopId),
    round = stop?.rounds[stop.roundIndex];
  useEffect(() => {
    if (round) setClosedBook(round.bookOpen === false);
  }, [round?.check.id]);
  const closeHelp = () => {
    setHelp(null);
    requestAnimationFrame(() =>
      activity.current?.focus({ preventScroll: true })
    );
  };
  useEffect(() => {
    activity.current?.focus({ preventScroll: true });
    activity.current?.scrollIntoView({ block: "start" });
  }, [stop?.id, stop?.roundIndex]);
  async function commit(next: ReadingState) {
    const updated = { ...next, updatedAt: Date.now() };
    latest.current = updated;
    setState(updated);
    // Serialize whole-record writes, so a slow earlier save cannot overwrite a newer answer.
    const write = writes.current
      .catch(() => {})
      .then(() => saveReadingState(updated));
    writes.current = write;
    try {
      await write;
      if (mounted.current) setSaveError("");
    } catch (e) {
      if (mounted.current)
        setSaveError(
          e instanceof Error
            ? e.message
            : "Your bookmark could not be saved. Retry before leaving."
        );
      throw e;
    }
  }
  async function updateStop(next: ReadingStop) {
    const current = latest.current!;
    await commit({
      ...current,
      stops: current.stops.map((s) => (s.id === next.id ? next : s)),
    });
  }
  async function perform(
    label: string,
    action: (signal: AbortSignal) => Promise<void>,
    timeoutMs = 90000
  ) {
    if (controller.current || !state) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(label);
    setError("");
    let expired = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          expired = true;
          request.abort();
        }, timeoutMs)
      : undefined;
    try {
      await action(request.signal);
    } catch (e) {
      if (mounted.current && (!request.signal.aborted || expired))
        setError(
          expired
            ? "This step took too long. Your saved place and answer are unchanged. Try again when you’re ready."
            : e instanceof Error
            ? e.message
            : "This step could not be completed. Try again."
        );
    } finally {
      clearTimeout(timer);
      controller.current = null;
      if (mounted.current) setBusy("");
    }
  }
  async function selectStop(next: ReadingStop) {
    setHelp(null);
    setEditing(false);
    setHistory(false);
    setFrom(String(next.range.from));
    setTo(String(next.range.to));
    try {
      await commit({
        ...latest.current!,
        from: next.range.from,
        to: next.range.to,
        activeStopId: next.id,
      });
    } catch {}
  }
  async function ensureStop(signal: AbortSignal): Promise<ReadingStop> {
    const start = Number(from),
      end = Number(to);
    if (!document)
      throw new Error("Reconnect the original PDF to read a new page range.");
    if (!from.trim() || !to.trim())
      throw new Error("Enter a start and end PDF page.");
    const range = await readPdfStudyRange(document.file, start, end, {
      signal,
    });
    signal.throwIfAborted();
    const current = latest.current!;
    const previous = current.stops.find(
      (s) => s.range.from === range.from && s.range.to === range.to
    );
    const next: ReadingStop = previous || {
      id: `reading:${track.id}:${crypto.randomUUID()}`,
      range,
      rounds: [],
      roundIndex: 0,
      questions: [],
    };
    await commit({
      ...current,
      from: range.from,
      to: range.to,
      stops: previous ? current.stops : [...current.stops, next],
      activeStopId: next.id,
    });
    setFrom(String(range.from));
    setTo(String(range.to));
    setEditing(false);
    setHelp(null);
    return next;
  }
  const prepareQuestion = (target?: ReadingStop) =>
    perform("Preparing your reading check…", async (signal) => {
      const selected = target || (await ensureStop(signal));
      const pending = selected.rounds.findIndex((r) => !r.attempt);
      if (pending >= 0) {
        await updateStop({ ...selected, roundIndex: pending });
        return;
      }
      const check = await generateReadingQuestion(selected, signal);
      signal.throwIfAborted();
      await updateStop({
        ...selected,
        rounds: [
          ...selected.rounds,
          { check, supported: !closedBook, bookOpen: !closedBook },
        ],
        roundIndex: selected.rounds.length,
      });
      setHelp(null);
    });
  async function tutor(
    selected: ReadingStop,
    submitted: ReadingRound,
    signal: AbortSignal
  ) {
    const content = await explainReading(selected, signal, submitted);
    signal.throwIfAborted();
    await updateStop({
      ...selected,
      rounds: selected.rounds.map((r) =>
        r.check.id === submitted.check.id
          ? {
              ...submitted,
              teaching: {
                id: `${submitted.check.id}:teaching`,
                session_id: selected.id,
                role: "assistant",
                content,
                created_at: Date.now(),
              },
            }
          : r
      ),
    });
  }
  const submit = (_: LearningCheck, attempt: CheckAttempt) => {
    if (stop && round)
      void perform("Explaining your answer…", async (signal) => {
        const submitted = {
          ...round,
          attempt: acceptReadingAttempt(stop, round, attempt),
        };
        const next = {
          ...stop,
          rounds: stop.rounds.map((r) =>
            r.check.id === round.check.id ? submitted : r
          ),
        };
        await updateStop(next);
        await tutor(next, submitted, signal);
      });
  };
  function support() {
    const currentStop = latest.current?.stops.find(
        (s) => s.id === latest.current?.activeStopId
      ),
      currentRound = currentStop?.rounds[currentStop.roundIndex];
    if (
      !currentStop ||
      !currentRound ||
      currentRound.attempt ||
      currentRound.supported
    )
      return;
    recordVisualSupport(currentRound.check.id, "reading-help");
    void updateStop({
      ...currentStop,
      rounds: currentStop.rounds.map((r) =>
        r.check.id === currentRound.check.id ? { ...r, supported: true } : r
      ),
    }).catch(() => {});
  }
  const ask = (question: string) => {
    if (stop)
      void perform("Answering your question…", async (signal) => {
        const pending = { ...stop, pendingQuestion: question };
        await updateStop(pending);
        const answer = await explainReading(pending, signal, round, question);
        signal.throwIfAborted();
        const current = latest.current!.stops.find((s) => s.id === stop.id)!;
        await updateStop({
          ...current,
          pendingQuestion: undefined,
          questions: [...current.questions, { question, answer }],
          rounds: current.rounds.map((r) =>
            r.check.id === round?.check.id && !r.attempt
              ? { ...r, supported: true }
              : r
          ),
        });
      });
  };
  async function reconnect(file: File) {
    await perform(
      "Saving your PDF locally…",
      async (signal) => {
        const book = await readPdfBook(file, file.name, { signal });
        if (!matchesReadingDocument(book, source))
          throw new Error(
            "This doesn’t match the PDF used for this curriculum. Choose the original file so page numbers stay accurate."
          );
        await saveReadingDocument(track.id, book);
        signal.throwIfAborted();
        setDocument({
          trackId: track.id,
          name: book.name,
          file,
          pageCount: book.pageCount,
          fingerprint: book.fingerprint,
          sections: book.sections,
        });
      },
      0
    );
  }
  const blankPages =
    stop?.range.pages.filter((p) => !p.text.trim()).map((p) => p.number) || [];
  const busyButton = !!busy;
  const nextSection =
    stop && document
      ? nextReadingSection(
          stop,
          document.sections || source.sections,
          document.pageCount
        )
      : null;
  return (
    <section className="pdf-reading" aria-labelledby="reading-title">
      <header className="reading-heading">
        <div>
          <span className="reading-eyebrow">
            <BookOpen size={15} /> Reading companion
          </span>
          <h1 id="reading-title">Your book, at your pace</h1>
          <p>{source.name}</p>
        </div>
        <button className="dialog-secondary-button" onClick={onReturn}>
          <ArrowLeft size={14} /> Curriculum
        </button>
      </header>
      {!loaded ? (
        <p role="status">
          <Loader2 size={16} className="animate-spin" /> Restoring your place…
        </p>
      ) : (
        <>
          {saveError && (
            <div className="reading-notice" role="alert">
              <p>{saveError}</p>
              <button
                onClick={() => {
                  if (latest.current)
                    void commit(latest.current).catch(() => {});
                }}
              >
                Retry saving
              </button>
            </div>
          )}
          {error && (
            <div className="reading-notice" role="alert">
              <p>{error}</p>
              <button
                aria-label="Dismiss reading error"
                onClick={() => setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {state && (
            <>
              {!document && (
                <section className="reading-reconnect">
                  <FileText size={21} />
                  <div>
                    <h2>Reconnect your PDF</h2>
                    <p>
                      Choose the original file once. It stays on this device so
                      you can resume here later.
                      {stop
                        ? " Your saved questions and answers are still available below."
                        : ""}
                    </p>
                    <label className="dialog-secondary-button">
                      Choose original PDF
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={busyButton}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void reconnect(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </section>
              )}
              <div className="reading-bookmark">
                <div>
                  <MapPin size={16} />
                  <span>
                    {stop
                      ? `PDF pages ${stop.range.from}–${stop.range.to}`
                      : "Where are you reading?"}
                  </span>
                  {stop?.range.pages[0].label &&
                    stop.range.pages[0].label !== String(stop.range.from) && (
                      <small>
                        Printed {stop.range.pages[0].label}–
                        {stop.range.pages.at(-1)?.label || "?"}
                      </small>
                    )}
                </div>
                <div>
                  <button
                    disabled={busyButton}
                    onClick={() => {
                      setEditing((v) => !v);
                      setHelp(null);
                      setTimeout(() => fromInput.current?.focus(), 0);
                    }}
                  >
                    {editing ? "Close page picker" : "Change pages"}
                  </button>
                  {state.stops.length > 0 && (
                    <button
                      disabled={busyButton}
                      aria-expanded={history}
                      onClick={() => setHistory((v) => !v)}
                    >
                      Reading stops <small>{state.stops.length}</small>
                    </button>
                  )}
                </div>
              </div>
              {history && (
                <nav
                  className="reading-history"
                  aria-label="Saved reading stops"
                >
                  {state.stops.map((s) => (
                    <button
                      key={s.id}
                      aria-current={s.id === stop?.id ? "page" : undefined}
                      disabled={busyButton}
                      onClick={() => void selectStop(s)}
                    >
                      PDF {s.range.from}–{s.range.to}
                      <small>
                        {s.rounds.filter((r) => r.attempt).length} answers saved
                      </small>
                    </button>
                  ))}
                </nav>
              )}
              {editing && (
                <form
                  className="reading-range"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform(
                      "Opening these pages…",
                      async (signal) => {
                        await ensureStop(signal);
                      },
                      0
                    );
                  }}
                >
                  <div>
                    <h2>Read a section, then pause here</h2>
                    <p>
                      Use the page number in your PDF viewer, not the printed
                      page label. Start with one idea or a few pages.
                    </p>
                  </div>
                  <div className="reading-range-fields">
                    <label>
                      From PDF page
                      <input
                        ref={fromInput}
                        type="number"
                        disabled={busyButton}
                        min={1}
                        max={document?.pageCount}
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Through page
                      <input
                        type="number"
                        disabled={busyButton}
                        min={1}
                        max={document?.pageCount}
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      className="dialog-primary-button"
                      disabled={busyButton || !document}
                    >
                      Save my place <ArrowRight size={14} />
                    </button>
                  </div>
                  {document && (
                    <small>
                      {document.pageCount} PDF pages · Updated manually; your
                      external reader isn’t monitored.
                    </small>
                  )}
                </form>
              )}
              {busy && (
                <div className="reading-processing" role="status">
                  <Loader2 size={16} className="animate-spin" />
                  <span>{busy}</span>
                  <button onClick={() => controller.current?.abort()}>
                    Cancel
                  </button>
                </div>
              )}
              {stop && !editing && (
                <>
                  {stop.range.to < stop.range.requestedTo && (
                    <p className="reading-range-note">
                      This selection starts with pages {stop.range.from}–
                      {stop.range.to} to keep the check focused. Your next stop
                      can begin at page {stop.range.to + 1}.
                    </p>
                  )}
                  {blankPages.length > 0 && (
                    <p className="reading-range-note">
                      No selectable text on PDF {blankPages.join(", ")}. Checks
                      use only the readable pages; images aren’t interpreted.
                    </p>
                  )}
                  <div className={`reading-body${help ? " has-help" : ""}`}>
                    <article
                      ref={activity}
                      tabIndex={-1}
                      className="reading-activity"
                      aria-label="Current reading activity"
                    >
                      {!round ? (
                        <div className="reading-ready">
                          <span className="reading-eyebrow">
                            When you’re ready
                          </span>
                          <h2>What stayed with you?</h2>
                          <p>
                            Read these pages in your PDF, then try one short
                            check. Get a hint or an explanation whenever you
                            need it.
                          </p>
                          <label className="reading-book-closed">
                            <input
                              type="checkbox"
                              checked={closedBook}
                              onChange={(e) => setClosedBook(e.target.checked)}
                            />{" "}
                            I’ll answer with the book closed
                          </label>
                          <div>
                            <button
                              className="dialog-primary-button"
                              disabled={busyButton}
                              onClick={() => void prepareQuestion(stop)}
                            >
                              Check what I read <ArrowRight size={15} />
                            </button>
                            <button
                              className="dialog-secondary-button"
                              disabled={busyButton}
                              onClick={() => setHelp("walkthrough")}
                            >
                              I’m stuck here
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="reading-round-nav">
                            <span>
                              Check {stop.roundIndex + 1}
                              {round.attempt
                                ? " · Answer saved"
                                : " · Your turn"}
                            </span>
                            <div>
                              <button
                                disabled={busyButton || stop.roundIndex === 0}
                                onClick={() =>
                                  void updateStop({
                                    ...stop,
                                    roundIndex: stop.roundIndex - 1,
                                  }).catch(() => {})
                                }
                              >
                                Previous check
                              </button>
                              {stop.roundIndex < stop.rounds.length - 1 && (
                                <button
                                  disabled={busyButton}
                                  onClick={() =>
                                    void updateStop({
                                      ...stop,
                                      roundIndex: stop.roundIndex + 1,
                                    }).catch(() => {})
                                  }
                                >
                                  Next saved check
                                </button>
                              )}
                            </div>
                          </div>
                          {round.attempt && (
                            <label className="reading-book-closed">
                              <input
                                type="checkbox"
                                checked={closedBook}
                                disabled={busyButton}
                                onChange={(e) =>
                                  setClosedBook(e.target.checked)
                                }
                              />{" "}
                              Answer the next check with the book closed
                            </label>
                          )}
                          {!round.attempt && (
                            <div className="reading-book-status">
                              <span>
                                {round.supported
                                  ? "Supported practice · book or help available"
                                  : "Book closed · independent attempt"}
                              </span>
                              {!round.supported && (
                                <button disabled={busyButton} onClick={support}>
                                  I’m referring to the PDF
                                </button>
                              )}
                            </div>
                          )}
                          <ReviewedQuestionCard
                            key={round.check.id}
                            check={round.check}
                            references={readingReferences(stop)}
                            language={track.language || undefined}
                            attempt={round.attempt}
                            isBusy={busyButton}
                            assistedSoFar={round.supported}
                            onSubmit={submit}
                            onAskCoach={() => setHelp("hint")}
                            onNewQuestion={() =>
                              void perform(
                                "Preparing a different check…",
                                async (signal) => {
                                  const base = {
                                    ...stop,
                                    rounds: stop.rounds.filter(
                                      (r) => !!r.attempt
                                    ),
                                  };
                                  const check = await generateReadingQuestion(
                                    base,
                                    signal
                                  );
                                  signal.throwIfAborted();
                                  await updateStop({
                                    ...base,
                                    rounds: [
                                      ...base.rounds,
                                      {
                                        check,
                                        supported: !closedBook,
                                        bookOpen: !closedBook,
                                      },
                                    ],
                                    roundIndex: base.rounds.length,
                                  });
                                }
                              )
                            }
                            onDispute={() => {
                              const revised = {
                                ...round,
                                teaching: undefined,
                                attempt: {
                                  ...round.attempt!,
                                  correct: false,
                                  grading: {
                                    status: "uncertain" as const,
                                    feedback:
                                      "You requested a review of this feedback.",
                                    criteria:
                                      round.attempt?.grading?.criteria || [],
                                    reviewRequested: true,
                                  },
                                },
                              };
                              void perform(
                                "Reviewing your feedback…",
                                async (signal) => {
                                  const next = {
                                    ...stop,
                                    rounds: stop.rounds.map((r) =>
                                      r.check.id === round.check.id
                                        ? revised
                                        : r
                                    ),
                                  };
                                  await updateStop(next);
                                  await tutor(next, revised, signal);
                                }
                              );
                            }}
                            showCoachLink={false}
                            showActions={false}
                            feedbackTeaching={
                              round.attempt && (
                                <AnswerTutoring
                                  check={round.check}
                                  teaching={round.teaching}
                                  loading={!!busy && !round.teaching}
                                  failed={!busy && !round.teaching}
                                  busy={busyButton}
                                  initialTogether
                                  language={track.language || undefined}
                                  onRetry={() =>
                                    void perform(
                                      "Explaining your answer…",
                                      (signal) => tutor(stop, round, signal)
                                    )
                                  }
                                  onContinue={() => void prepareQuestion(stop)}
                                  continueLabel={
                                    readingPlan(stop).stage === "guided"
                                      ? "Try a smaller example"
                                      : readingPlan(stop).stage ===
                                        "independent"
                                      ? "Try without the cue"
                                      : "Try another application"
                                  }
                                  nextStepReason={
                                    readingPlan(stop).stage === "review"
                                      ? "You can continue reading, or try another application. These checks don’t mark a curriculum unit complete."
                                      : readingPlan(stop).reason
                                  }
                                />
                              )
                            }
                          />
                        </>
                      )}
                      <div className="reading-support-actions">
                        {(["hint", "walkthrough", "visual"] as HelpKind[]).map(
                          (k) => (
                            <button
                              key={k}
                              disabled={busyButton}
                              aria-pressed={help === k}
                              onClick={() => setHelp(k)}
                            >
                              {k === "hint"
                                ? "Give me a hint"
                                : k === "visual"
                                ? "Show me a figure"
                                : "Show the steps"}
                            </button>
                          )
                        )}
                        <button
                          disabled={busyButton || !document}
                          onClick={() => {
                            const page = nextSection?.from || stop.range.to;
                            setFrom(String(page));
                            setTo(String(nextSection?.to || page));
                            setEditing(true);
                            setHelp(null);
                          }}
                        >
                          Continue reading <ArrowRight size={14} />
                        </button>
                      </div>
                      {round?.attempt && (
                        <p className="reading-pacing-note">
                          {nextSection?.advice ||
                            "You’ve reached the last PDF page. Revisit a reading stop or try another application whenever you like."}
                          {nextSection?.title && (
                            <>
                              {" "}
                              Next in the book:{" "}
                              <strong>{nextSection.title}</strong>.
                            </>
                          )}
                        </p>
                      )}
                      {stop.questions.map((q, i) => (
                        <details
                          className="reading-side-answer"
                          key={i}
                          open={i === stop.questions.length - 1}
                        >
                          <summary>{q.question}</summary>
                          <MarkdownView
                            content={q.answer}
                            languageHint={track.language || undefined}
                          />
                        </details>
                      ))}
                      {stop.pendingQuestion && (
                        <div className="reading-pending-question">
                          <strong>Your question</strong>
                          <p>{stop.pendingQuestion}</p>
                          {!busy && (
                            <button onClick={() => ask(stop.pendingQuestion!)}>
                              Retry explanation
                            </button>
                          )}
                        </div>
                      )}
                      <Composer
                        key={stop.id}
                        compact
                        draftKey={`${stop.id}:ask`}
                        isStreaming={busyButton}
                        onStopStreaming={() => controller.current?.abort()}
                        onSendMessage={ask}
                      />
                      <details
                        className="reading-covered-text"
                        onToggle={(e) => {
                          if (e.currentTarget.open) support();
                        }}
                      >
                        <summary>
                          See covered text · referring back counts as support
                        </summary>
                        {stop.range.pages.map((p) => (
                          <section key={p.number}>
                            <h3>
                              PDF {p.number}
                              {p.label ? ` · Printed ${p.label}` : ""}
                            </h3>
                            <pre>
                              {p.text || "No selectable text on this page."}
                            </pre>
                          </section>
                        ))}
                      </details>
                      <p className="reading-footnote">
                        Your reading place is saved separately from curriculum
                        progress. Only these pages are shared with your tutor.
                      </p>
                    </article>
                    {help && (
                      <LearningHelpPanel
                        key={`${stop.id}:${help}:${
                          round?.check.id || "reading"
                        }`}
                        open
                        kind={help}
                        contextKey={`${stop.id}:${
                          round?.check.id || "reading"
                        }:${round?.attempt ? "answered" : "pending"}`}
                        context={`Help with PDF pages ${stop.range.from}–${
                          stop.range.to
                        }. ${
                          round?.check.question ||
                          "Explain one idea in the covered reading in plain language."
                        }`}
                        milestone={readingMilestone(stop)}
                        check={round?.check || null}
                        answered={!!round?.attempt}
                        narrow={false}
                        onClose={closeHelp}
                        onKind={setHelp}
                        onSupport={support}
                        language={track.language || undefined}
                      />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
