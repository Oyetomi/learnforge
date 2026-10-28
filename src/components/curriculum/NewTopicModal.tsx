import React, { useEffect, useRef, useState } from "react";
import { X, ArrowRight, Loader2, Compass, FileText, Upload } from "lucide-react";
import { generateCustomTrack } from "../../services/ai/curriculum";
import {
  suggestTopics,
  type TopicSuggestion,
} from "../../services/ai/interests";
import { extractTextFromFile } from "../../services/learning/fileExtractor";
import type { CourseTrack } from "../../services/ai/types";
import { PlanApproval } from "./PlanApproval";

interface NewTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrackCreated: (track: CourseTrack) => void;
}
export const NewTopicModal: React.FC<NewTopicModalProps> = ({
  isOpen,
  onClose,
  onTrackCreated,
}) => {
  const [interest, setInterest] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [referenceContent, setReferenceContent] = useState("");
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [task, setTask] = useState<"idle" | "suggesting" | "creating">("idle");
  const [status, setStatus] = useState("");
  const [selectedGoal, setSelectedGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draftTrack, setDraftTrack] = useState<CourseTrack | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null),
    formRef = useRef<HTMLFormElement>(null),
    statusRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLInputElement>(null),
    requestRef = useRef<AbortController | null>(null),
    mounted = useRef(false);
  useEffect(() => {
    if (task === "idle") return;
    const frame = requestAnimationFrame(() => {
      const form = formRef.current;
      const status = statusRef.current;
      if (!form || !status) return;
      const top = form.scrollTop + status.getBoundingClientRect().top - form.getBoundingClientRect().top
        - Math.max(16, (form.clientHeight - status.clientHeight) / 2);
      form.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
    // Scroll once when a request starts, not on each streamed status update.
  }, [task]);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (isOpen) {
      dialog?.showModal();
      inputRef.current?.focus();
    }
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);
  const close = () => {
    requestRef.current?.abort();
    onClose();
  };
  const run = async (goal?: string) => {
    const effectiveInterest =
      interest.trim() ||
      (referenceContent.trim()
        ? `Teach me the key concepts in ${referenceName || "the attached material"}`
        : "");
    if (task !== "idle" || (!goal && !effectiveInterest)) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setTask(goal ? "creating" : "suggesting");
    setSelectedGoal(goal || "");
    setError(null);
    setStatus(
      goal
        ? "Preparing your first learning steps…"
        : "Finding directions from your interests…"
    );
    let timedOut = false;
    // Full learning plans from reasoning models (e.g. ChatGPT / Codex) can take
    // 1–3 minutes; suggestions are short and keep the tighter limit.
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, goal ? 240_000 : 60_000);
    const startedAt = Date.now();
    const elapsedTicker = goal
      ? setInterval(() => {
          if (!mounted.current || controller.signal.aborted) return;
          const secs = Math.round((Date.now() - startedAt) / 1000);
          if (secs >= 20)
            setStatus(
              `Still building your plan · ${secs}s (larger models can take 1–3 minutes)`
            );
        }, 5_000)
      : null;
    const refPayload = referenceContent.trim()
      ? {
          name: referenceName || "Reference notes",
          content: referenceContent,
        }
      : undefined;
    try {
      if (goal) {
        const track = await generateCustomTrack(
          {
            topic: goal,
            interest: effectiveInterest,
            signal: controller.signal,
            referenceMaterial: refPayload,
          },
          (text) => {
            if (mounted.current && !controller.signal.aborted) setStatus(text);
          }
        );
        if (!mounted.current || controller.signal.aborted) return;
        setDraftTrack(track);
      } else {
        const topics = await suggestTopics(
          effectiveInterest,
          controller.signal,
          refPayload
        );
        if (!mounted.current || controller.signal.aborted) return;
        setSuggestions(topics);
      }
    } catch (reason) {
      if (mounted.current && (!controller.signal.aborted || timedOut))
        setError(
          timedOut
            ? "This is taking longer than expected. Your interest is still here; try again."
            : reason instanceof Error
            ? reason.message
            : "This could not be prepared. Please try again."
        );
    } finally {
      clearTimeout(timeout);
      if (elapsedTicker) clearInterval(elapsedTicker);
      if (mounted.current) setTask("idle");
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processFile = async (file: File) => {
    setError(null);
    try {
      const extracted = await extractTextFromFile(file);
      setReferenceName(file.name);
      setReferenceContent(extracted);
      setInterest((prev) =>
        prev.trim() ? prev : `Teach me the key concepts in ${file.name}`
      );
      setSuggestions([]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read that file. Try a text, Markdown, code, or selectable PDF file."
      );
    }
  };
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  };
  return (
    <dialog
      ref={dialogRef}
      className="review-dialog new-topic-dialog"
      aria-labelledby="new-topic-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <div>
            <Compass size={18} />
            <h2 id="new-topic-title">
              {draftTrack ? "Review your learning plan" : "Explore an interest"}
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
          <PlanApproval
            key={draftTrack.id}
            track={draftTrack}
            onRevise={() => setDraftTrack(null)}
            onApprove={(track) => {
              onTrackCreated(track);
              onClose();
            }}
          />
        ) : (
          <form
            ref={formRef}
            className="new-topic-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(selectedGoal && error ? selectedGoal : undefined);
            }}
          >
            <div className="new-topic-intro">
              <h3>What are you curious about?</h3>
              <p>
                Tell LearnForge what interests you. We’ll suggest a few concrete
                topics, then shape the learning path from your answers.
              </p>
            </div>
            <label htmlFor="topic-input">Your interests</label>
            <input
              ref={inputRef}
              id="topic-input"
              value={interest}
              onChange={(event) => {
                setInterest(event.target.value);
                setSuggestions([]);
                setSelectedGoal("");
                setError(null);
              }}
              disabled={task !== "idle"}
              maxLength={400}
              required={!referenceContent.trim()}
              autoComplete="off"
              placeholder="An idea, a question, or something you want to understand…"
            />
            <div
              className={`new-topic-reference ${
                referenceContent.trim() ? "has-file" : ""
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && task === "idle") void processFile(file);
              }}
            >
              <div className="new-topic-reference-header">
                <FileText size={14} />
                <span>
                  Teach from a local file, notes, or code snippet
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.pdf,.go,.rs,.py,.ts,.tsx,.js,.jsx,.json,.csv,.html,.sql,.sh,.yaml,.yml,.toml,.c,.cpp,.h,.java"
                  onChange={handleFileUpload}
                  disabled={task !== "idle"}
                  aria-label="Upload reference file or code"
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="check-coach-button"
                  disabled={task !== "idle"}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={12} /> Choose file
                </button>
              </div>
              {referenceName && referenceContent.trim() && (
                <div className="reference-attached-pill">
                  <span>
                    Attached: <strong>{referenceName}</strong> (
                    {Math.max(1, Math.round(referenceContent.length / 1000))}k
                    chars)
                  </span>
                  <div>
                    <button
                      type="button"
                      className="dialog-primary-button reference-direct-build"
                      disabled={task !== "idle"}
                      onClick={() =>
                        void run(
                          interest.trim() ||
                            `Learn the core concepts in ${referenceName}`
                        )
                      }
                    >
                      Build course from file
                      <ArrowRight size={13} />
                    </button>
                    <button
                      type="button"
                      className="check-coach-button"
                      disabled={task !== "idle"}
                      onClick={() => {
                        setReferenceName("");
                        setReferenceContent("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
              <div className="new-topic-reference-body">
                <textarea
                  rows={2}
                  value={referenceContent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReferenceContent(val);
                    if (val.trim() && !referenceName) {
                      setReferenceName("Pasted notes");
                    }
                  }}
                  disabled={task !== "idle"}
                  placeholder="Drop a file (.md, .txt, .pdf, .go, .rs, .py, .ts) above, or paste lecture notes / source code here…"
                />
              </div>
            </div>
          {suggestions.length > 0 && (
            <section
              className="interest-results"
              aria-label="Topics suggested for your interests"
            >
              <h4>A few directions you could take</h4>
              {suggestions.map((topic) => (
                <button
                  type="button"
                  className="interest-topic"
                  key={topic.title}
                  onClick={() => void run(topic.goal)}
                  disabled={task !== "idle"}
                >
                  <span>
                    <strong>{topic.title}</strong>
                    <small>{topic.why}</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
              <button
                className="interest-own-topic"
                type="button"
                disabled={task !== "idle"}
                onClick={() => void run(interest)}
              >
                Use my original interest instead
                <ArrowRight size={13} />
              </button>
            </section>
          )}
          {task !== "idle" && (
            <div ref={statusRef} className="topic-generation-status" role="status">
              <Loader2 size={15} className="animate-spin" />
              <div>
                <strong>
                  {task === "suggesting"
                    ? "Finding your next topic"
                    : "Preparing your learning path"}
                </strong>
                <p>{status}</p>
                <small>You can cancel at any time.</small>
              </div>
            </div>
          )}
          {error && (
            <div className="topic-error" role="alert">
              {error}
            </div>
          )}
          <footer className="new-topic-footer">
            <button
              className="dialog-secondary-button"
              type="button"
              onClick={close}
            >
              {task === "idle" ? "Cancel" : "Cancel request"}
            </button>
            <button
              className="dialog-primary-button"
              type="submit"
              disabled={
                task !== "idle" ||
                (!interest.trim() && !referenceContent.trim())
              }
            >
              {task !== "idle" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}{" "}
              {error
                ? "Try again"
                : suggestions.length
                ? "Suggest other directions"
                : "Suggest topics"}
            </button>
          </footer>
        </form>
        )}
      </div>
    </dialog>
  );
};
