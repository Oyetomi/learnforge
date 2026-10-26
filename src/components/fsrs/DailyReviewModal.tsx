import React, { useState, useRef, useEffect } from 'react';
import { X, Brain, Check, Eye, ArrowRight } from 'lucide-react';
import { SRSCard, FSRSRating } from '../../types';
import { MarkdownView } from '../chat/MarkdownView';

interface DailyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: SRSCard[];
  onRateCard: (cardId: string, rating: FSRSRating) => void;
}

const ratings: { value: FSRSRating; label: string; description: string }[] = [
  { value: 1, label: 'Again', description: 'Couldn’t recall' },
  { value: 2, label: 'Hard', description: 'With effort' },
  { value: 3, label: 'Good', description: 'Recalled it' },
  { value: 4, label: 'Easy', description: 'Effortless' },
];

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
    else if (currentIndex > 0) (questionRef.current || finishedRef.current)?.focus();
  }, [showAnswer, currentIndex]);
  if (!isOpen) return null;
  const currentCard = reviewCards[currentIndex];
  const handleRate = (rating: FSRSRating) => {
    if (!currentCard) return;
    onRateCard(currentCard.id, rating);
    setShowAnswer(false);
    setCurrentIndex((index) => index + 1);
  };
  return (
    <dialog
      ref={dialogRef}
      className="review-dialog"
      aria-labelledby="review-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <div>
            <Brain size={18} />
            <h2 id="review-title">Daily review</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close daily review">
            <X size={18} />
          </button>
        </header>
        <div className="review-body">
          {currentCard ? (
            <>
              <div className="review-meta">
                <span>{currentCard.topic}</span>
                <span aria-live="polite">
                  Card {currentIndex + 1} of {reviewCards.length}
                </span>
              </div>
              <div className="review-question" ref={questionRef} tabIndex={-1}>
                <MarkdownView content={currentCard.prompt} />
              </div>
              {showAnswer ? (
                <>
                  <div className="review-answer" ref={answerRef} tabIndex={-1} aria-label="Answer">
                    <h3>Answer</h3>
                    <pre>
                      {currentCard.target_code ||
                        'Recall the key idea, then rate how well you remembered it.'}
                    </pre>
                  </div>
                  <div className="review-rating">
                    <h3>How well did you remember?</h3>
                    <div
                      className="review-rating-options"
                      role="group"
                      aria-label="Rate your recall"
                    >
                      {ratings.map((rating) => (
                        <button key={rating.value} onClick={() => handleRate(rating.value)}>
                          <strong>{rating.label}</strong>
                          <span>{rating.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="review-reveal">
                  <p>Try to recall the answer before revealing it.</p>
                  <button className="review-reveal-button" onClick={() => setShowAnswer(true)}>
                    <Eye size={16} />
                    Reveal answer
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="review-finished">
              <span className="review-finished-icon">
                <Check size={24} />
              </span>
              <h3>{reviewCards.length ? 'Review complete' : 'No cards due'}</h3>
              <p>
                {reviewCards.length
                  ? `You reviewed ${reviewCards.length} ${reviewCards.length === 1 ? 'card' : 'cards'}. Your next review will be scheduled based on your recall.`
                  : 'You’re caught up. Come back when your next review is ready.'}
              </p>
              <button ref={finishedRef} className="review-reveal-button" onClick={onClose}>
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
