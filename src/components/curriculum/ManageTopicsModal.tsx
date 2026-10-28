import React, { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { CourseTrack } from "../../services/ai/types";
import { LanguageLogo, languageName } from "../common/LanguageLogo";
interface Props {
  tracks: CourseTrack[];
  visibleIds: string[];
  removedIds: string[];
  onDelete: (ids: string[]) => void;
  onClose: () => void;
}
export function ManageTopicsModal({
  tracks,
  visibleIds,
  removedIds,
  onDelete,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    status = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState<string[] | null>(null),
    [deleted, setDeleted] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (pending) cancel.current?.focus();
    else if (deleted) status.current?.focus();
  }, [pending, deleted]);
  const visible = tracks.filter((t) => visibleIds.includes(t.id));
  const titles = (pending || [])
    .map((id) => tracks.find((t) => t.id === id)?.title)
    .filter(Boolean);
  const startDelete = (ids: string[]) => {
    setError("");
    setPending(ids);
  };
  const confirm = () => {
    if (!pending) return;
    try {
      onDelete(pending);
      setDeleted(
        pending.length === 1
          ? `Deleted “${titles[0] || "topic"}”.`
          : `Permanently deleted ${pending.length} topics.`
      );
      setPending(null);
    } catch {
      setError("The topics could not be completely deleted. Please try again.");
    }
  };
  return (
    <dialog
      ref={dialog}
      className="review-dialog manage-topics-dialog"
      role={pending ? "alertdialog" : "dialog"}
      aria-labelledby="manage-topics-title"
      aria-describedby={
        pending ? "delete-topic-description" : "manage-topics-description"
      }
      onCancel={(e) => {
        e.preventDefault();
        if (pending) setPending(null);
        else onClose();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <h2 id="manage-topics-title">
            {pending
              ? pending.length === 1
                ? "Delete this topic?"
                : `Delete ${pending.length} topics?`
              : "Manage topics"}
          </h2>
          <button
            className="icon-button"
            aria-label="Close manage topics"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="manage-topics-content">
          {pending ? (
            <>
              <p id="delete-topic-description">
                This permanently deletes the selected topics and their lessons,
                conversations, progress, drafts and review cards from this
                device. This cannot be undone.
              </p>
              <ul className="topic-deletion-list">
                {titles.map((title, i) => (
                  <li key={i}>{title}</li>
                ))}
              </ul>
              {error && (
                <p className="topic-delete-error" role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <p id="manage-topics-description">
                Delete topics you no longer want to keep. Deleting also removes
                their saved learning data.
              </p>
              {deleted && (
                <p
                  role="status"
                  ref={status}
                  tabIndex={-1}
                  className="topic-removal-note"
                >
                  {deleted}
                </p>
              )}
              <section aria-label="Your topics">
                <h3>
                  Your topics <span>{visible.length}</span>
                </h3>
                {visible.length ? (
                  <ul>
                    {visible.map((t) => (
                      <li key={t.id}>
                        <div>
                          <strong>{t.title}</strong>
                          <small>
                            {t.language && (
                              <LanguageLogo language={t.language} size={12} />
                            )}{" "}
                            {t.language ? languageName(t.language) : "Learning"}{" "}
                            · {t.milestones.length} lessons
                          </small>
                        </div>
                        <button
                          className="topic-delete-button"
                          aria-label={`Delete topic: ${t.title}`}
                          onClick={() => startDelete([t.id])}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="topic-list-empty">
                    No topics yet. Start with your interests using New topic.
                  </p>
                )}
              </section>
              {removedIds.length > 0 && (
                <div className="legacy-topic-cleanup">
                  <p>
                    {removedIds.length} previously removed{" "}
                    {removedIds.length === 1 ? "topic is" : "topics are"} still
                    stored by an older version.
                  </p>
                  <button
                    className="topic-delete-button"
                    onClick={() => startDelete(removedIds)}
                  >
                    Clear permanently
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="manage-topics-footer">
          {pending ? (
            <>
              <button
                className="header-secondary-button"
                ref={cancel}
                onClick={() => {
                  setPending(null);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                className="dialog-primary-button topic-delete-confirm"
                onClick={confirm}
              >
                Delete permanently
              </button>
            </>
          ) : (
            <button className="dialog-primary-button" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
