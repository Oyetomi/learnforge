import React, { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowRight,
  Loader2,
  Compass,
  FileText,
  Upload,
} from "lucide-react";
import { generateCustomTrack } from "../../services/ai/curriculum";
import {
  generateCurriculumOutline,
  proposeLearningScope,
  type ScopeProposal,
} from "../../services/ai/curriculumOutline";
import type { LearningScope } from "../../services/learning/curriculumPlan";
import { extractTextFromFile } from "../../services/learning/fileExtractor";
import type { CourseTrack } from "../../services/ai/types";
import { PlanApproval } from "./PlanApproval";
import { CurriculumApproval } from "./CurriculumApproval";
import "./curriculum.css";

const draftKey = "learnforge:goal-draft";
const startingPoints = [
  "I’m not sure — help me find my starting point",
  "I’m starting from the beginning",
  "I know the basics and want to apply them",
  "I have experience and want to deepen it",
];
function savedDraft(): {
  interest?: string;
  destination?: string;
  startingPoint?: string;
} {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey) || "{}");
    return d && typeof d === "object"
      ? {
          interest:
            typeof d.interest === "string" ? d.interest.slice(0, 400) : "",
          destination:
            typeof d.destination === "string"
              ? d.destination.slice(0, 800)
              : "",
          startingPoint: startingPoints.includes(d.startingPoint)
            ? d.startingPoint
            : startingPoints[0],
        }
      : {};
  } catch {
    return {};
  }
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTrackCreated: (track: CourseTrack) => void;
}
export const NewTopicModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onTrackCreated,
}) => {
  const [interest, setInterest] = useState(() => savedDraft().interest || "");
  const [destination, setDestination] = useState(
    () => savedDraft().destination || ""
  );
  const [startingPoint, setStartingPoint] = useState(
    () =>
      savedDraft().startingPoint ||
      "I’m not sure — help me find my starting point"
  );
  const [referenceName, setReferenceName] = useState(""),
    [referenceContent, setReferenceContent] = useState("");
  const [proposal, setProposal] = useState<ScopeProposal | null>(null),
    [scope, setScope] = useState<LearningScope>("curriculum");
  const [task, setTask] = useState<"idle" | "scoping" | "creating">("idle");
  const [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const busy = task !== "idle" || isReadingFile;
  const [draftTrack, setDraftTrack] = useState<CourseTrack | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null),
    formRef = useRef<HTMLFormElement>(null),
    statusRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLInputElement>(null),
    headingRef = useRef<HTMLHeadingElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    requestRef = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLDivElement>(null),
    readSequence = useRef(0),
    readingFile = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ interest, destination, startingPoint })
      );
    } catch {}
  }, [interest, destination, startingPoint]);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    if (isOpen) {
      dialogRef.current?.showModal();
      inputRef.current?.focus();
    }
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
      readSequence.current += 1;
      readingFile.current = false;
      dialogRef.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);
  useEffect(() => {
    if (proposal) {
      headingRef.current?.focus();
      formRef.current?.scrollTo({ top: 0 });
    }
  }, [proposal]);
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => {
    if (draftTrack || !proposal) return;
    headingRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollTo({ top: 0 });
  }, [draftTrack]);
  useEffect(() => {
    if (task === "idle" && !isReadingFile) return;
    const frame = requestAnimationFrame(() => {
      const form = formRef.current,
        status = statusRef.current;
      if (!form || !status) return;
      form.scrollTo({
        top: Math.max(
          0,
          form.scrollTop +
            status.getBoundingClientRect().top -
            form.getBoundingClientRect().top -
            30
        ),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [task, isReadingFile]);
  const close = () => {
    requestRef.current?.abort();
    onClose();
  };
  const cancel = () => {
    requestRef.current?.abort();
    readSequence.current += 1;
    readingFile.current = false;
    setIsReadingFile(false);
    setNotice(
      "Preparation cancelled. Your goal is still here; continue when you’re ready."
    );
  };
  const run = async () => {
    const goal =
      interest.trim() ||
      (referenceContent.trim()
        ? `Teach me the key concepts in ${referenceName || "my reference"}`
        : "");
    if (task !== "idle" || requestRef.current || readingFile.current || !goal)
      return;
    const controller = new AbortController();
    requestRef.current = controller;
    setTask(proposal ? "creating" : "scoping");
    setError("");
    setNotice("");
    const updateStatus = (text: string) => {
      if (
        mounted.current &&
        requestRef.current === controller &&
        !controller.signal.aborted
      )
        setStatus(text);
    };
    setStatus(
      proposal
        ? "Preparing the scope and outcomes…"
        : "Understanding the scope of your goal…"
    );
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      proposal ? 240000 : 60000
    );
    try {
      if (!proposal) {
        const proposed = await proposeLearningScope(goal, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setScope(proposed.scope);
        setProposal(proposed);
      } else {
        const options = {
          topic: goal,
          interest: goal,
          signal: controller.signal,
          referenceMaterial: referenceContent.trim()
            ? {
                name: referenceName || "Reference notes",
                content: referenceContent,
              }
            : undefined,
        };
        const track =
          scope === "curriculum"
            ? await generateCurriculumOutline(
                {
                  ...options,
                  destination: destination.trim() || goal,
                  startingPoint,
                },
                updateStatus
              )
            : await generateCustomTrack(
                {
                  ...options,
                  topic: destination.trim() || goal,
                  unitContext: JSON.stringify({
                    scope: "focused",
                    originalGoal: goal,
                    desiredAbility: destination.trim() || goal,
                    startingPoint,
                    instruction:
                      "Prepare exactly one focused lesson, not a full path.",
                  }),
                },
                updateStatus
              );
        if (!mounted.current || controller.signal.aborted) return;
        setDraftTrack(track);
      }
    } catch (e) {
      if (mounted.current && (!controller.signal.aborted || timedOut))
        setError(
          timedOut
            ? "This is taking longer than expected. Your goal is saved; try again."
            : e instanceof Error
            ? e.message
            : "This could not be prepared. Try again."
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setTask("idle");
      if (requestRef.current === controller) requestRef.current = null;
    }
  };
  const processFile = async (file: File) => {
    if (task !== "idle" || readingFile.current) return;
    const sequence = ++readSequence.current;
    readingFile.current = true;
    setIsReadingFile(true);
    setError("");
    setNotice("");
    try {
      const content = await extractTextFromFile(file);
      if (!mounted.current || readSequence.current !== sequence) return;
      setReferenceName(file.name);
      setReferenceContent(content);
      setInterest((prev) =>
        prev.trim() ? prev : `Teach me the key concepts in ${file.name}`
      );
      setProposal(null);
      setNotice(`Added ${file.name}. Review your goal before continuing.`);
    } catch (e) {
      if (mounted.current && readSequence.current === sequence)
        setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      if (readSequence.current === sequence) {
        readingFile.current = false;
        if (mounted.current) setIsReadingFile(false);
      }
    }
  };
  const approve = (track: CourseTrack) => {
    onTrackCreated(track);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    onClose();
  };
  return (
    <dialog
      ref={dialogRef}
      className={`review-dialog new-topic-dialog ${
        draftTrack?.curriculum ? "curriculum-review-dialog" : ""
      }`}
      aria-labelledby="new-topic-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <div>
            <Compass size={18} />
            <h2 id="new-topic-title">
              {draftTrack
                ? "Review your learning plan"
                : "What would you like to learn?"}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close new topic"
          >
            <X size={18} />
          </button>
        </header>
        {draftTrack ? (
          draftTrack.curriculum ? (
            <CurriculumApproval
              track={draftTrack}
              onApprove={approve}
              onRevise={() => setDraftTrack(null)}
            />
          ) : (
            <PlanApproval
              track={draftTrack}
              onApprove={approve}
              onRevise={() => setDraftTrack(null)}
            />
          )
        ) : (
          <form
            ref={formRef}
            className="new-topic-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <div className="new-topic-intro">
              <h3 ref={headingRef} tabIndex={-1}>
                {proposal
                  ? "Shape the path around your goal"
                  : "Start with what you want to understand"}
              </h3>
              <p>
                {proposal
                  ? proposal.reason
                  : "A broad goal becomes a curriculum. A precise question becomes a focused lesson. You can adjust the scope before starting."}
              </p>
            </div>
            <label htmlFor="topic-input">Your learning goal</label>
            <input
              ref={inputRef}
              id="topic-input"
              value={interest}
              onChange={(e) => {
                setInterest(e.target.value);
                setProposal(null);
                setError("");
              }}
              disabled={busy}
              maxLength={400}
              required={!referenceContent.trim()}
              autoComplete="off"
              placeholder="What would you like to be able to do?"
            />
            {proposal && (
              <section className="curriculum-brief" aria-label="Learning scope">
                <div className="curriculum-scope-options">
                  {(["curriculum", "focused"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={scope === value}
                      disabled={busy}
                      onClick={() => setScope(value)}
                    >
                      {value === "curriculum"
                        ? "Full curriculum"
                        : "Focused lesson"}
                    </button>
                  ))}
                </div>
                <p>
                  {scope === "curriculum"
                    ? "A complete outline for an agreed goal, taught one unit at a time."
                    : "One small question or skill, with explanation, practice and feedback."}
                </p>
                <label htmlFor="goal-destination">
                  What do you want to be able to do? <span>(optional)</span>
                </label>
                <input
                  id="goal-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  maxLength={800}
                  disabled={busy}
                  placeholder="A practical outcome, or leave blank to use your goal"
                />
                <label htmlFor="goal-starting-point">
                  Where are you starting?
                </label>
                <select
                  id="goal-starting-point"
                  value={startingPoint}
                  onChange={(e) => setStartingPoint(e.target.value)}
                  disabled={busy}
                >
                  {startingPoints.map((point) => (
                    <option key={point}>{point}</option>
                  ))}
                </select>
                <small>
                  Placement is optional. The plan is reviewed before anything is
                  added.
                </small>
              </section>
            )}
            <details
              className="new-topic-reference"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy && e.dataTransfer.files[0])
                  void processFile(e.dataTransfer.files[0]);
              }}
            >
              <summary>
                <FileText size={14} /> Teach from my own material{" "}
                {referenceContent.trim() && <em>Attached</em>}
              </summary>
              <div className="new-topic-reference-body">
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  aria-label="Upload reference file or code"
                  accept=".md,.txt,.pdf,.go,.rs,.py,.ts,.tsx,.js,.jsx,.json,.csv,.html,.sql,.sh,.yaml,.yml,.toml,.c,.cpp,.h,.java"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="check-coach-button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={13} /> Choose file
                </button>
                {referenceName && <small>{referenceName}</small>}
                <textarea
                  rows={3}
                  aria-label="Reference notes"
                  value={referenceContent}
                  disabled={busy}
                  onChange={(e) => {
                    setReferenceContent(e.target.value);
                    if (!referenceName) setReferenceName("Pasted notes");
                  }}
                  placeholder="Paste notes or selectable source text…"
                />
                {referenceContent && (
                  <button
                    type="button"
                    className="check-coach-button"
                    disabled={busy}
                    onClick={() => {
                      setReferenceName("");
                      setReferenceContent("");
                    }}
                  >
                    Remove reference
                  </button>
                )}
              </div>
            </details>
            {busy && (
              <div
                ref={statusRef}
                className="topic-generation-status"
                role="status"
              >
                <Loader2 size={15} className="animate-spin" />
                <div>
                  <strong>
                    {isReadingFile
                      ? "Reading your material"
                      : task === "scoping"
                      ? "Finding the right scope"
                      : scope === "curriculum"
                      ? "Preparing the curriculum outline"
                      : "Preparing a focused lesson"}
                  </strong>
                  <p>
                    {isReadingFile
                      ? "Extracting the text before planning. Your material stays attached to this goal."
                      : status}
                  </p>
                  <small>You can cancel. Your goal stays saved.</small>
                </div>
              </div>
            )}
            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                className="topic-error"
                role="alert"
              >
                {error}
              </div>
            )}
            {notice && (
              <p className="curriculum-notice" role="status">
                {notice}
              </p>
            )}
            <footer className="new-topic-footer">
              <button
                className="dialog-secondary-button"
                type="button"
                onClick={busy ? cancel : close}
              >
                {busy ? "Cancel preparation" : "Cancel"}
              </button>
              <button
                className="dialog-primary-button"
                type="submit"
                disabled={
                  busy || (!interest.trim() && !referenceContent.trim())
                }
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <ArrowRight size={14} />
                )}
                {error
                  ? "Try again"
                  : proposal
                  ? scope === "curriculum"
                    ? "Prepare curriculum outline"
                    : "Prepare focused lesson"
                  : "Shape my learning goal"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </dialog>
  );
};
