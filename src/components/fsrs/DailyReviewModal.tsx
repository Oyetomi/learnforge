import React, { useState, useRef, useEffect } from "react";
import { X, Brain, Check, Eye, ArrowRight } from "lucide-react";
import { SRSCard, FSRSRating } from "../../types";
import {
  calculateRetrievability,
  previewCardReviews,
} from "../../services/fsrs";
import { MarkdownView } from "../chat/MarkdownView";

interface DailyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: SRSCard[];
  onRateCard: (cardId: string, rating: FSRSRating) => void;
}

const ratings: {
  value: FSRSRating;
  label: string;
  description: string;
  tone: "again" | "hard" | "good" | "easy";
}[] = [
  {
    value: 1,
    label: "Again",
    description: "Couldn’t recall",
    tone: "again",
  },
  {
    value: 2,
    label: "Hard",
    description: "Recalled with effort",
    tone: "hard",
  },
  {
    value: 3,
    label: "Good",
    description: "Solid recall",
    tone: "good",
  },
  {
    value: 4,
    label: "Easy",
    description: "Effortless",
    tone: "easy",
  },
];

function formatIntervalDays(days: number): string {
  if (days <= 1) return "1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(/\.0$/, "")}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")}y`;
}

export const DailyReviewModal: React.FC<DailyReviewModalProps> = ({
  isOpen,
  onClose,
  cards,
  onRateCard,
}) => {
  const [reviewCards] = useState(() => [...cards]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef<HTMLButtonElement>(null);

  const currentCard = reviewCards[currentIndex];

  const handleRate = (rating: FSRSRating) => {
    if (!currentCard) return;
    onRateCard(currentCard.id, rating);
    setShowAnswer(false);
    setCurrentIndex((index) => index + 1);
  };

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (isOpen) dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (showAnswer) answerRef.current?.focus();
    else if (currentIndex > 0)
      (questionRef.current || finishedRef.current)?.focus();
  }, [showAnswer, currentIndex]);

  useEffect(() => {
    if (!isOpen || !currentCard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!showAnswer && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShowAnswer(true);
      } else if (showAnswer && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        handleRate(Number(e.key) as FSRSRating);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, currentCard, showAnswer]);

  if (!isOpen) return null;

  const previews = currentCard ? previewCardReviews(currentCard) : null;
  const retrievability = currentCard
    ? Math.round(calculateRetrievability(currentCard) * 100)
    : 0;

  return (
    <dialog
      ref={dialogRef}
      className="review-dialog review-studio-dialog"
      aria-labelledby="review-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <div className="review-header-title">
            <span className="review-brain-badge">
              <Brain size={16} />
            </span>
            <div>
              <h2 id="review-title">Spaced Repetition Review</h2>
              {reviewCards.length > 0 && currentCard && (
                <small className="review-header-sub">
                  FSRS-4.5 Memory Scheduler · Card {currentIndex + 1} of{" "}
                  {reviewCards.length}
                </small>
              )}
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close daily review"
          >
            <X size={18} />
          </button>
        </header>

        {reviewCards.length > 0 && currentCard && (
          <div
            className="review-progress-strip"
            aria-label={`Review progress: ${currentIndex + 1} of ${
              reviewCards.length
            }`}
          >
            {reviewCards.map((c, idx) => (
              <span
                key={c.id}
                className={
                  idx < currentIndex
                    ? "is-done"
                    : idx === currentIndex
                    ? "is-current"
                    : ""
                }
              />
            ))}
          </div>
        )}

        <div className="review-body">
          {currentCard ? (
            <div className="review-stage">
              <div className="review-meta-row">
                <span className="review-topic-pill">{currentCard.topic}</span>
                <span className="review-state-pill">
                  {currentCard.reps === 0 ? (
                    <>New card</>
                  ) : (
                    <>
                      {retrievability}% recall probability ·{" "}
                      {Math.max(1, Math.round(currentCard.stability))}d
                      stability
                    </>
                  )}
                </span>
              </div>

              <div className="review-flashcard">
                <div
                  className="review-question-panel"
                  ref={questionRef}
                  tabIndex={-1}
                >
                  <span className="review-card-kicker">Prompt</span>
                  <div className="review-question">
                    <MarkdownView content={currentCard.prompt} />
                  </div>
                </div>

                {showAnswer ? (
                  <div
                    className="review-answer-panel"
                    ref={answerRef}
                    tabIndex={-1}
                    aria-label="Answer"
                  >
                    <span className="review-card-kicker is-answer">
                      Key Invariant & Answer
                    </span>
                    <div className="review-answer-content">
                      {currentCard.answer ? (
                        <MarkdownView content={currentCard.answer} />
                      ) : currentCard.target_code ? (
                        <MarkdownView
                          content={
                            currentCard.target_code.includes("```")
                              ? currentCard.target_code
                              : `\`\`\`\n${currentCard.target_code}\n\`\`\``
                          }
                        />
                      ) : (
                        <p>
                          Compare your mental answer against the core concept
                          and rate how effortlessly you recalled it.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="review-reveal-bar">
                    <p>
                      Formulate your answer in your head first, then reveal to
                      verify.
                    </p>
                    <button
                      className="review-reveal-button"
                      onClick={() => setShowAnswer(true)}
                    >
                      <Eye size={15} />
                      <span>Reveal answer</span>
                      <kbd className="key-hint">Space</kbd>
                    </button>
                  </div>
                )}
              </div>

              {showAnswer && (
                <div className="review-rating-section">
                  <div className="review-rating-header">
                    <h3>How well did you recall it?</h3>
                    <small>Press 1–4 on your keyboard</small>
                  </div>
                  <div
                    className="review-rating-options"
                    role="group"
                    aria-label="Rate your recall"
                  >
                    {ratings.map((rating) => {
                      const nextDays =
                        previews?.[rating.value]?.nextIntervalDays ?? 1;
                      return (
                        <button
                          key={rating.value}
                          type="button"
                          className={`review-rate-card is-${rating.tone}`}
                          onClick={() => handleRate(rating.value)}
                        >
                          <div className="review-rate-top">
                            <kbd>{rating.value}</kbd>
                            <em className="review-rate-interval">
                              {formatIntervalDays(nextDays)}
                            </em>
                          </div>
                          <strong>{rating.label}</strong>
                          <span>{rating.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="review-finished">
              <span className="review-finished-icon">
                <Check size={24} />
              </span>
              <h3>{reviewCards.length ? "Review complete" : "No cards due"}</h3>
              <p>
                {reviewCards.length
                  ? `You reviewed ${reviewCards.length} ${
                      reviewCards.length === 1 ? "card" : "cards"
                    }. FSRS-4.5 has scheduled each concept at its optimal retention interval.`
                  : "You’re caught up. Come back when your next review is ready."}
              </p>
              <button
                ref={finishedRef}
                className="review-reveal-button"
                onClick={onClose}
              >
                Back to learning
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
};
