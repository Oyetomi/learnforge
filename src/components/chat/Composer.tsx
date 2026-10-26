import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Lightbulb, ScanLine, BookOpen, Square } from 'lucide-react';

interface ComposerProps {
  onSendMessage: (message: string) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  activeMilestoneTitle?: string;
  onQuickAction?: (action: 'hint' | 'explain' | 'review') => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  onQuickAction,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
  }, [input]);
  const submit = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };
  return (
    <div className="composer">
      <div className="quick-actions" aria-label="Ask your coach">
        <button onClick={() => onQuickAction?.('hint')} disabled={isStreaming}>
          <Lightbulb size={13} />
          Get a hint
        </button>
        <button onClick={() => onQuickAction?.('explain')} disabled={isStreaming}>
          <BookOpen size={13} />
          Explain this
        </button>
        <button onClick={() => onQuickAction?.('review')} disabled={isStreaming}>
          <ScanLine size={13} />
          Review code
        </button>
      </div>
      <div className="composer-input">
        <textarea
          aria-label="Message your AI coach"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask a question or share your thinking…"
          rows={2}
        />
        {isStreaming ? (
          <button
            className="send-button stop-button"
            onClick={onStopStreaming}
            aria-label="Stop response"
          >
            <Square size={15} fill="currentColor" />
          </button>
        ) : (
          <button
            className="send-button"
            onClick={submit}
            disabled={!input.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
      <div className="composer-footnote">
        <span>Your editor code is included for context</span>
        <span>
          ↵ Send <span className="newline-hint">· ⇧↵ New line</span>
        </span>
      </div>
    </div>
  );
};
