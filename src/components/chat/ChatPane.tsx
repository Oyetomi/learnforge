import React, { useRef, useEffect } from 'react';
import { ChatMessage, Milestone } from '../../types';
import { MarkdownView } from './MarkdownView';
import { Composer } from './Composer';
import { Sparkles, ArrowUpRight, BookOpen, Check, Play, MessageSquare } from 'lucide-react';
import { handleTabNavigation } from '../layout/keyboard';
import { cleanMilestoneTitle } from '../milestones/MilestoneSidebar';

interface ChatPaneProps {
  activeTab: 'challenge' | 'coach';
  onChangeTab: (tab: 'challenge' | 'coach') => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent?: string;
  activeMilestone: Milestone | null;
  milestoneIndex: number;
  milestoneCount: number;
  onSendMessage: (message: string) => void;
  onStopStreaming: () => void;
  onApplyCodeToEditor?: (code: string) => void;
  onQuickAction?: (action: 'hint' | 'explain' | 'review') => void;
  onOpenEditor: () => void;
  onNextMilestone?: () => void;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  activeTab: tab,
  onChangeTab: setTab,
  messages,
  isStreaming,
  streamingContent,
  activeMilestone,
  milestoneIndex,
  milestoneCount,
  onSendMessage,
  onStopStreaming,
  onApplyCodeToEditor,
  onQuickAction,
  onOpenEditor,
  onNextMilestone,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => {
    setTab('challenge');
  }, [activeMilestone?.id]);
  useEffect(() => {
    if (nearBottom.current && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingContent, tab]);
  const send = (message: string) => {
    setTab('coach');
    nearBottom.current = true;
    onSendMessage(message);
  };
  const quickAction = (action: 'hint' | 'explain' | 'review') => {
    setTab('coach');
    nearBottom.current = true;
    onQuickAction?.(action);
  };
  const complete = activeMilestone?.status === 'completed';
  return (
    <section className="lesson-pane workspace-panel" aria-label="Challenge and AI coach">
      <div
        className="panel-tabs"
        role="tablist"
        aria-label="Learning content"
        onKeyDown={handleTabNavigation}
      >
        <button
          role="tab"
          id="challenge-tab"
          aria-selected={tab === 'challenge'}
          tabIndex={tab === 'challenge' ? 0 : -1}
          aria-controls="challenge-content"
          onClick={() => setTab('challenge')}
        >
          <BookOpen size={15} />
          Challenge
        </button>
        <button
          role="tab"
          id="coach-tab"
          aria-selected={tab === 'coach'}
          tabIndex={tab === 'coach' ? 0 : -1}
          aria-controls="coach-content"
          onClick={() => setTab('coach')}
        >
          <Sparkles size={15} />
          AI coach{isStreaming && <span className="active-dot" />}
        </button>
      </div>
      {tab === 'challenge' ? (
        <div
          key={activeMilestone?.id}
          role="tabpanel"
          id="challenge-content"
          aria-labelledby="challenge-tab"
          className="challenge-content"
        >
          <div className="challenge-eyebrow">
            <span>
              MILESTONE {String(milestoneIndex + 1).padStart(2, '0')}{' '}
              <span className="milestone-total">/ {String(milestoneCount).padStart(2, '0')}</span>
            </span>
            <span className={`status-pill ${complete ? 'complete' : ''}`}>
              {complete ? <Check size={12} /> : <span className="tiny-dot" />}
              {complete ? 'Completed' : 'In progress'}
            </span>
          </div>
          <h1>
            {activeMilestone
              ? cleanMilestoneTitle(activeMilestone.title)
              : 'Choose a learning track'}
          </h1>
          <div className="challenge-prompt">
            <MarkdownView
              content={activeMilestone?.prompt || 'Select a learning track to get started.'}
            />
          </div>
          <details className="challenge-help">
            <summary>How to work on this challenge</summary>
            <p>
              Read the starter code, make your changes, then select <strong>Run code</strong>. Check
              the output and tests to see what to try next. Your edits are saved on this device.
            </p>
          </details>
          {complete && (
            <div className="completion-callout">
              <Check size={18} />
              <div>
                <strong>Milestone complete.</strong>
                <p>
                  {onNextMilestone
                    ? 'Your next challenge is ready.'
                    : 'You’ve completed this track. Revisit any challenge to practice.'}
                </p>
                {onNextMilestone && (
                  <button onClick={onNextMilestone}>
                    Next milestone <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
          <button className="open-editor-button" onClick={onOpenEditor}>
            <Play size={14} />
            Open code workspace
            <ArrowUpRight size={15} />
          </button>
          <div className="challenge-coach-link">
            <span>Have a question?</span>
            <button onClick={() => setTab('coach')}>
              Ask your coach <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="coach-content"
          aria-labelledby="coach-tab"
          className="chat-content"
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
        >
          {!messages.length && (
            <div className="chat-empty">
              <MessageSquare size={25} />
              <h3>Let’s work through it.</h3>
              <p>Ask about the challenge, a concept, or the code in your editor.</p>
            </div>
          )}
          {messages
            .filter((m) => m.role !== 'system')
            .map((msg) => (
              <article
                key={msg.id}
                className={`chat-message ${msg.role === 'user' ? 'from-user' : 'from-coach'}`}
              >
                <div className="message-sender">
                  {msg.role === 'user' ? (
                    <>
                      <span className="message-avatar">Y</span>You
                    </>
                  ) : (
                    <>
                      <span className="message-avatar coach">
                        <Sparkles size={12} />
                      </span>
                      LearnForge coach
                    </>
                  )}
                </div>
                <MarkdownView content={msg.content} onApplyCode={onApplyCodeToEditor} />
              </article>
            ))}
          {isStreaming && (
            <article className="chat-message from-coach" aria-live="polite" aria-busy="true">
              <div className="message-sender">
                <span className="message-avatar coach">
                  <Sparkles size={12} />
                </span>
                LearnForge coach
              </div>
              {streamingContent ? (
                <MarkdownView content={streamingContent} onApplyCode={onApplyCodeToEditor} />
              ) : (
                <span className="thinking-indicator">
                  Thinking it through<span>•••</span>
                </span>
              )}
            </article>
          )}
        </div>
      )}
      {tab === 'coach' && (
        <Composer
          onSendMessage={send}
          isStreaming={isStreaming}
          onStopStreaming={onStopStreaming}
          onQuickAction={quickAction}
        />
      )}
    </section>
  );
};
