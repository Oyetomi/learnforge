import React, { useState } from 'react';
import { X, Brain, Check, RefreshCw, Eye, Sparkles } from 'lucide-react';
import { SRSCard, FSRSRating } from '../../types';

interface DailyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: SRSCard[];
  onRateCard: (cardId: string, rating: FSRSRating) => void;
}

export const DailyReviewModal: React.FC<DailyReviewModalProps> = ({
  isOpen,
  onClose,
  cards,
  onRateCard,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  if (!isOpen) return null;

  const currentCard = cards[currentIndex];
  const isFinished = !currentCard || currentIndex >= cards.length;

  const handleRate = (rating: FSRSRating) => {
    if (!currentCard) return;
    onRateCard(currentCard.id, rating);
    setShowAnswer(false);
    setCurrentIndex((prev) => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#161b22] border border-forge-border rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-forge-border bg-forge-surface/80">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-forge-heading">
              Daily FSRS Spaced Repetition Queue
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-forge-muted hover:text-forge-heading rounded-md hover:bg-forge-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isFinished ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Check size={24} />
              </div>
              <h4 className="text-base font-semibold text-forge-heading">
                All Reviews Complete for Today!
              </h4>
              <p className="text-xs text-forge-muted max-w-sm mx-auto">
                Your memory retention curve has been updated with FSRS-4.5. Consistent short daily recall strengthens synaptic permanence.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 rounded-lg bg-forge-accent hover:bg-forge-accentHover text-white text-xs font-semibold transition-colors"
              >
                Back to Learning
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress counter */}
              <div className="flex items-center justify-between text-xs text-forge-muted">
                <span className="font-mono text-forge-accent text-[11px] font-semibold">
                  TOPIC: {currentCard.topic}
                </span>
                <span>
                  Card {currentIndex + 1} of {cards.length}
                </span>
              </div>

              {/* Prompt Card */}
              <div className="p-4 rounded-lg bg-[#0d1117] border border-forge-border text-sm text-forge-heading leading-relaxed">
                <p className="font-medium whitespace-pre-wrap">{currentCard.prompt}</p>
              </div>

              {/* Target Code / Solution */}
              {showAnswer ? (
                <div className="p-4 rounded-lg bg-[#0a0e14] border border-indigo-900/40 text-xs font-mono space-y-2">
                  <span className="text-indigo-400 text-[11px] font-semibold uppercase tracking-wider block">
                    Target Mental Model / Code:
                  </span>
                  <pre className="text-forge-text whitespace-pre-wrap overflow-x-auto p-2 bg-[#12161f] rounded">
                    {currentCard.target_code || 'Review complete. Assess your recall honesty.'}
                  </pre>
                </div>
              ) : (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="w-full py-3 rounded-lg border border-dashed border-forge-border hover:border-forge-accent/60 bg-forge-surface/30 hover:bg-forge-surface/60 text-xs font-medium text-forge-text flex items-center justify-center gap-2 transition-all"
                >
                  <Eye size={14} />
                  <span>Reveal Target Solution / Mental Model</span>
                </button>
              )}

              {/* FSRS Rating Buttons */}
              {showAnswer && (
                <div className="pt-3 border-t border-forge-border space-y-2">
                  <p className="text-[11px] text-forge-muted text-center">
                    Rate your recall accuracy (FSRS 4.5):
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => handleRate(1)}
                      className="p-2 rounded-lg bg-red-950/30 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-center transition-colors"
                    >
                      <span className="block text-xs font-bold">Again</span>
                      <span className="text-[10px] text-red-400/80">&lt; 10 min</span>
                    </button>
                    <button
                      onClick={() => handleRate(2)}
                      className="p-2 rounded-lg bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 text-center transition-colors"
                    >
                      <span className="block text-xs font-bold">Hard</span>
                      <span className="text-[10px] text-amber-400/80">~ 1 day</span>
                    </button>
                    <button
                      onClick={() => handleRate(3)}
                      className="p-2 rounded-lg bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-800/40 text-emerald-300 text-center transition-colors"
                    >
                      <span className="block text-xs font-bold">Good</span>
                      <span className="text-[10px] text-emerald-400/80">~ 3 days</span>
                    </button>
                    <button
                      onClick={() => handleRate(4)}
                      className="p-2 rounded-lg bg-blue-950/30 hover:bg-blue-900/50 border border-blue-800/40 text-blue-300 text-center transition-colors"
                    >
                      <span className="block text-xs font-bold">Easy</span>
                      <span className="text-[10px] text-blue-400/80">~ 7 days</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
