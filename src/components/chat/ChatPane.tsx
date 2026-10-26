import React, { useRef, useEffect } from 'react';
import { ChatMessage } from '../../types';
import { MarkdownView } from './MarkdownView';
import { Composer } from './Composer';
import { Bot, User, Sparkles, BookOpen, Layers } from 'lucide-react';

interface ChatPaneProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent?: string;
  activeMilestoneTitle?: string;
  onSendMessage: (message: string) => void;
  onStopStreaming: () => void;
  onApplyCodeToEditor?: (code: string) => void;
  onQuickAction?: (action: 'hint' | 'explain' | 'review') => void;
  currentTopic: string;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  messages,
  isStreaming,
  streamingContent,
  activeMilestoneTitle,
  onSendMessage,
  onStopStreaming,
  onApplyCodeToEditor,
  onQuickAction,
  currentTopic,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-col h-full bg-forge-bg border-r border-forge-border min-h-0 overflow-hidden">
      {/* Pane Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-forge-border bg-forge-surface/40">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-1 rounded bg-forge-accent/15 text-forge-accent">
            <Sparkles size={15} />
          </div>
          <div className="overflow-hidden">
            <h2 className="text-xs font-semibold text-forge-heading uppercase tracking-wider truncate">
              Socratic Dialogue
            </h2>
            <p className="text-[11px] text-forge-muted truncate">
              Topic: <span className="text-forge-text font-medium">{currentTopic}</span>
            </p>
          </div>
        </div>

        {activeMilestoneTitle && (
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-forge-surface border border-forge-border text-[11px] text-forge-muted truncate max-w-[200px]">
            <Layers size={11} className="text-forge-accent shrink-0" />
            <span className="truncate">{activeMilestoneTitle}</span>
          </div>
        )}
      </div>

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-forge-muted">
            <div className="p-3 rounded-full bg-forge-surface border border-forge-border mb-3 text-forge-accent">
              <BookOpen size={24} />
            </div>
            <h3 className="text-sm font-semibold text-forge-heading mb-1">Welcome to LearnForge</h3>
            <p className="text-xs max-w-sm leading-relaxed mb-4">
              We pair Socratic inquiry with live code execution. Start by exploring a topic or asking a question.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              <button
                onClick={() => onSendMessage("I'm ready. Start with the core mental model and give me my first milestone.")}
                className="px-3 py-1.5 rounded-lg bg-forge-surface hover:bg-forge-surfaceHover border border-forge-border text-xs text-forge-text transition-colors"
              >
                🚀 Start Topic Lesson
              </button>
              <button
                onClick={() => onSendMessage("Assess my mental model: ask me 2 diagnostic questions about this topic.")}
                className="px-3 py-1.5 rounded-lg bg-forge-surface hover:bg-forge-surfaceHover border border-forge-border text-xs text-forge-text transition-colors"
              >
                🎯 Assess Mental Model
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 text-sm ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role !== 'user' && (
              <div className="w-6 h-6 rounded-md bg-forge-accent/20 border border-forge-accent/30 text-forge-accent flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-forge-surface border border-forge-border text-forge-heading'
                  : 'bg-forge-surface/30 border border-forge-border/60 text-forge-text'
              }`}
            >
              <MarkdownView content={msg.content} onApplyCode={onApplyCodeToEditor} />
            </div>

            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-md bg-forge-border text-forge-muted flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} />
              </div>
            )}
          </div>
        ))}

        {/* Real-time Streaming Response */}
        {isStreaming && streamingContent && (
          <div className="flex gap-3 text-sm justify-start">
            <div className="w-6 h-6 rounded-md bg-forge-accent/20 border border-forge-accent/30 text-forge-accent flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
              <Bot size={14} />
            </div>
            <div className="max-w-[85%] rounded-xl px-4 py-3 bg-forge-surface/30 border border-forge-accent/40 text-forge-text">
              <MarkdownView content={streamingContent} onApplyCode={onApplyCodeToEditor} />
              <div className="inline-block w-2 h-4 ml-1 bg-forge-accent animate-pulse align-middle" />
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex items-center gap-2 text-xs text-forge-muted pl-9 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-forge-accent" />
            <span>Formulating Socratic response...</span>
          </div>
        )}
      </div>

      {/* Composer Input Area */}
      <Composer
        onSendMessage={onSendMessage}
        isStreaming={isStreaming}
        onStopStreaming={onStopStreaming}
        activeMilestoneTitle={activeMilestoneTitle}
        onQuickAction={onQuickAction}
      />
    </div>
  );
};
