import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListTree, Loader2, Plus, Square } from 'lucide-react';
import type { ChatMessage } from '../../types';
import { DerivationLadder, extractDerivationLadders } from './DerivationLadder';

interface DerivationPaneProps {
  messages: ChatMessage[];
  streamingContent?: string;
  isStreaming: boolean;
  onGenerate: () => void;
  onStop: () => void;
}

export const DerivationPane: React.FC<DerivationPaneProps> = ({
  messages,
  streamingContent,
  isStreaming,
  onGenerate,
  onStop,
}) => {
  const ladders = useMemo(() => {
    const saved = messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) =>
        extractDerivationLadders(message.content).map((ladder, index) => ({
          id: `${message.id}-${index}`,
          ladder,
        }))
      );
    if (isStreaming && streamingContent)
      saved.push(
        ...extractDerivationLadders(streamingContent).map((ladder, index) => ({
          id: `streaming-${index}`,
          ladder,
        }))
      );
    return saved;
  }, [messages, isStreaming, streamingContent]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const latestId = ladders[ladders.length - 1]?.id;
  useEffect(() => {
    if (latestId) {
      setSelectedId(latestId);
    }
  }, [latestId]);
  const index = Math.max(
    0,
    selectedId ? ladders.findIndex((item) => item.id === selectedId) : ladders.length - 1
  );
  const selected = ladders[index];

  return (
    <div
      id="derivation-content"
      role="tabpanel"
      aria-labelledby="derivation-tab"
      className="derivation-content"
    >
      <div className="derivation-view-heading">
        <h1>Derivation Ladder</h1>
        <p>Saved step-by-step explanations from this track.</p>
      </div>
      {selected ? (
        <>
          <div className="derivation-history">
            <span>
              Explanation {index + 1} of {ladders.length}
            </span>
            {ladders.length > 1 && (
              <div>
                <button
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => setSelectedId(ladders[index - 1].id)}
                  aria-label="Previous derivation"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="icon-button"
                  disabled={index === ladders.length - 1}
                  onClick={() => setSelectedId(ladders[index + 1].id)}
                  aria-label="Next derivation"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          <DerivationLadder {...selected.ladder} />
          {!isStreaming && (
            <button
              className="derivation-generate-button"
              onClick={() => {
                onGenerate();
              }}
            >
              <Plus size={14} />
              Generate for this challenge
            </button>
          )}
        </>
      ) : (
        !isStreaming && (
          <div className="derivation-empty">
            <span className="derivation-empty-icon">
              <ListTree size={25} />
            </span>
            <h2>No saved derivations yet</h2>
            <p>
              Generate a ladder for the current challenge. The state changes and explanations will
              appear here.
            </p>
            <button
              className="dialog-primary-button"
              onClick={() => {
                onGenerate();
              }}
            >
              <Plus size={15} />
              Generate derivation
            </button>
          </div>
        )
      )}
      {isStreaming && (
        <div className="derivation-generation" role="status">
          <Loader2 size={16} className="animate-spin" />
          <span>Waiting for your coach’s derivation…</span>
          <button onClick={onStop}>
            <Square size={12} />
            Stop
          </button>
        </div>
      )}
    </div>
  );
};
