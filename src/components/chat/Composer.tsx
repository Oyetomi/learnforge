import React, { useState, useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Sparkles, HelpCircle, Code, Lightbulb, Square } from 'lucide-react';

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
  activeMilestoneTitle,
  onQuickAction,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isStreaming) {
      onStopStreaming();
      return;
    }
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-forge-border bg-forge-surface/60 backdrop-blur-sm p-3">
      {/* Quick Action Chips (Never-Locked prompts) */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 text-xs text-forge-muted">
        <span className="flex items-center gap-1 text-[11px] font-medium text-forge-accent/80 shrink-0 mr-1">
          <Sparkles size={12} />
          Never-Locked:
        </span>
        <button
          onClick={() => onQuickAction?.('hint')}
          disabled={isStreaming}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-forge-surface border border-forge-border hover:border-forge-accent/40 hover:text-forge-heading transition-colors shrink-0 disabled:opacity-50"
        >
          <Lightbulb size={11} className="text-yellow-400" />
          Give me a hint
        </button>
        <button
          onClick={() => onQuickAction?.('explain')}
          disabled={isStreaming}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-forge-surface border border-forge-border hover:border-forge-accent/40 hover:text-forge-heading transition-colors shrink-0 disabled:opacity-50"
        >
          <HelpCircle size={11} className="text-forge-accent" />
          Explain concept
        </button>
        <button
          onClick={() => onQuickAction?.('review')}
          disabled={isStreaming}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-forge-surface border border-forge-border hover:border-forge-accent/40 hover:text-forge-heading transition-colors shrink-0 disabled:opacity-50"
        >
          <Code size={11} className="text-emerald-400" />
          Review my editor code
        </button>
      </div>

      {/* Input container */}
      <div className="relative flex items-end rounded-lg border border-forge-border bg-[#0d1117] focus-within:border-forge-accent/70 transition-all shadow-inner">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            activeMilestoneTitle
              ? `Ask clarifying questions on "${activeMilestoneTitle}" or propose your logic...`
              : 'Ask a question, request a concept dive, or share your thinking...'
          }
          rows={1}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-forge-heading placeholder:text-forge-muted/60 focus:outline-none"
        />

        <div className="flex items-center p-2 gap-1.5 shrink-0">
          {isStreaming ? (
            <button
              onClick={onStopStreaming}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-forge-danger/20 hover:bg-forge-danger/30 text-forge-danger text-xs font-medium transition-colors"
              title="Stop Generation"
            >
              <Square size={12} className="fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim()}
              className="flex items-center justify-center p-1.5 rounded-md bg-forge-accent hover:bg-forge-accentHover text-white disabled:opacity-30 disabled:hover:bg-forge-accent transition-colors"
              title="Send (Enter)"
            >
              <CornerDownLeft size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-1.5 px-1 text-[11px] text-forge-muted/70">
        <span>You can ask tangents or side-questions at any time without answering active checks.</span>
        <span className="hidden sm:inline">Shift+Enter for newline</span>
      </div>
    </div>
  );
};
