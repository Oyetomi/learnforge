import React, { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  Lightbulb,
  BookOpen,
  Square,
  ListTree,
} from "lucide-react";
import { VoiceDictationButton } from "../learning/VoiceDictationButton";

interface ComposerProps {
  onSendMessage: (message: string) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  activeMilestoneTitle?: string;
  codeIncluded?: boolean;
  compact?: boolean;
  sideQuestion?: boolean;
  draftKey?: string;
  onQuickAction?: (
    action: "hint" | "explain" | "review" | "derivation"
  ) => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  onQuickAction,
  codeIncluded = false,
  compact = false,
  sideQuestion = false,
  draftKey,
}) => {
  const [input, setInput] = useState(() => {
    try {
      return draftKey ? localStorage.getItem(draftKey) || "" : "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    if (draftKey) {
      try {
        localStorage.setItem(draftKey, input);
      } catch {}
    }
  }, [input, draftKey]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      120
    )}px`;
  }, [input]);
  const submit = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput("");
  };
  return (
    <div className="composer">
      {!compact && (
        <div className="quick-actions" aria-label="Ask your coach">
          <button
            onClick={() => onQuickAction?.("hint")}
            disabled={isStreaming}
          >
            <Lightbulb size={13} />
            Get a hint
          </button>
          <button
            onClick={() => onQuickAction?.("explain")}
            disabled={isStreaming}
          >
            <BookOpen size={13} />
            Explain this
          </button>
          <button
            onClick={() => onQuickAction?.("derivation")}
            disabled={isStreaming}
          >
            <ListTree size={13} />
            Derivation Ladder
          </button>
        </div>
      )}
      <div className="composer-input">
        <textarea
          aria-label="Message your AI coach"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            sideQuestion
              ? "Ask a quick side question…"
              : compact
              ? "Ask about this step…"
              : "Ask about this step, or tell me what’s confusing…"
          }
          rows={compact ? 1 : 2}
        />
        {!isStreaming && (
          <VoiceDictationButton
            compact
            label="Dictate message to coach"
            onTranscript={(chunk) =>
              setInput((prev) =>
                prev ? `${prev.trimEnd()} ${chunk}` : chunk
              )
            }
          />
        )}
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
        <span>
          {isStreaming
            ? "Your draft stays saved while the tutor responds"
            : sideQuestion || /^\/btw\b/i.test(input)
            ? "Side questions stay separate from your current step"
            : codeIncluded
            ? "Code workspace included for context"
            : "Your question draft is saved on this device"}
        </span>
        <span>
          {isStreaming ? "Stop to send" : "↵ Send"}{" "}
          <span className="newline-hint">· ⇧↵ New line</span>
        </span>
      </div>
    </div>
  );
};
