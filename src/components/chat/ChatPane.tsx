import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage, Milestone } from '../../types';
import { MarkdownView } from './MarkdownView';
import { Composer } from './Composer';
import { Sparkles, ArrowRight, Check, ChevronDown, ChevronUp, GitCommit } from 'lucide-react';
import { cleanMilestoneTitle } from '../milestones/MilestoneSidebar';
import {
  DerivationLadder,
  MATH_SIMPLIFY_LADDER,
  GO_CHANNEL_LADDER,
  GO_WAITGROUP_LADDER,
} from './DerivationLadder';

interface ChatPaneProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent?: string;
  activeMilestone: Milestone | null;
  milestoneIndex: number;
  milestoneCount: number;
  onSendMessage: (message: string) => void;
  onStopStreaming: () => void;
  onApplyCodeToEditor?: (code: string) => void;
  onQuickAction?: (action: 'hint' | 'explain' | 'review' | 'derivation') => void;
  onOpenEditor?: () => void;
  onNextMilestone?: () => void;
  // Kept for backward compatibility with mobile tab bar
  activeTab?: 'challenge' | 'coach';
  onChangeTab?: (tab: 'challenge' | 'coach') => void;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
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
  const [isPromptExpanded, setIsPromptExpanded] = useState(true);
  const [showDerivation, setShowDerivation] = useState(false);
  const [ladderPreset, setLadderPreset] = useState<'milestone' | 'math'>('milestone');

  // Auto-scroll on new messages or streaming tokens
  useEffect(() => {
    if (nearBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const send = (message: string) => {
    nearBottom.current = true;
    onSendMessage(message);
  };

  const quickAction = (action: 'hint' | 'explain' | 'review' | 'derivation') => {
    nearBottom.current = true;
    onQuickAction?.(action);
  };

  const complete = activeMilestone?.status === 'completed';

  return (
    <section className="lesson-pane workspace-panel flex flex-col h-full bg-[#141414] select-text" aria-label="Socratic Coach & Challenge">
      {/* Scrollable Conversation & Lesson Document */}
      <div
        className="chat-content flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {/* Pinned Milestone Brief Card (Unified with Socratic Stream) */}
        {activeMilestone && (
          <div className="milestone-brief-card bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs text-[#8d8d8d]">
              <div className="flex items-center gap-2">
                <span className="font-mono uppercase tracking-wider font-semibold text-[#a0a0a0]">
                  Milestone {String(milestoneIndex + 1).padStart(2, '0')} / {String(milestoneCount).padStart(2, '0')}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  complete
                    ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50'
                    : 'bg-[#262626] text-[#c0c0c0] border border-[#383838]'
                }`}>
                  {complete ? <Check size={11} className="text-emerald-400" /> : <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  {complete ? 'Completed' : 'Active challenge'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                className="text-[#8d8d8d] hover:text-[#e6e6e6] p-1 rounded transition-colors"
                aria-label={isPromptExpanded ? 'Collapse challenge brief' : 'Expand challenge brief'}
              >
                {isPromptExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            <h2 className="font-serif text-xl sm:text-2xl font-normal text-[#f0f0f0] tracking-tight m-0">
              {cleanMilestoneTitle(activeMilestone.title)}
            </h2>

            {isPromptExpanded && (
              <div className="challenge-prompt text-sm text-[#cccccc] leading-relaxed pt-1 border-t border-[#2a2a2a]">
                <MarkdownView content={activeMilestone.prompt} />
              </div>
            )}

            {/* Visual Derivation Ladder Toggle & View */}
            <div className="pt-2 border-t border-[#2a2a2a] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowDerivation(!showDerivation)}
                  className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-mono transition-colors"
                >
                  <span className="font-semibold">{showDerivation ? '▼ Hide Step Derivation' : '▶ 🪜 View Step-by-Step Derivation'}</span>
                </button>
                {showDerivation && (
                  <div className="flex items-center gap-1 bg-[#242424] p-0.5 rounded text-[11px] font-mono border border-[#333333]">
                    <button
                      type="button"
                      onClick={() => setLadderPreset('milestone')}
                      className={`px-2 py-0.5 rounded transition-colors ${ladderPreset === 'milestone' ? 'bg-[#383838] text-white font-medium' : 'text-[#888] hover:text-[#ccc]'}`}
                    >
                      Milestone State
                    </button>
                    <button
                      type="button"
                      onClick={() => setLadderPreset('math')}
                      className={`px-2 py-0.5 rounded transition-colors ${ladderPreset === 'math' ? 'bg-[#383838] text-white font-medium' : 'text-[#888] hover:text-[#ccc]'}`}
                    >
                      Math 6÷2(1+2)
                    </button>
                  </div>
                )}
              </div>

              {showDerivation && (
                <div className="pt-1 animate-fadeIn">
                  <DerivationLadder
                    {...(ladderPreset === 'math'
                      ? MATH_SIMPLIFY_LADDER
                      : milestoneIndex === 1
                      ? GO_WAITGROUP_LADDER
                      : GO_CHANNEL_LADDER)}
                  />
                </div>
              )}
            </div>

            {/* If completed, show Next Milestone action directly */}
            {complete && onNextMilestone && (
              <div className="pt-2 flex items-center justify-between bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <Check size={15} className="text-emerald-400 shrink-0" />
                  <span>All tests passed for this milestone!</span>
                </div>
                <button
                  type="button"
                  onClick={onNextMilestone}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
                >
                  Next Milestone <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Conversation Stream */}
        {messages
          .filter((m) => m.role !== 'system')
          .map((msg) => (
            <article
              key={msg.id}
              className={`chat-message ${
                msg.role === 'user' ? 'from-user my-2 w-full border-l-[3px] border-[#434343] bg-[#1a1a1a] py-2 pl-3.5 pr-4 rounded-r-lg' : 'from-coach py-2'
              }`}
            >
              <div className="message-sender flex items-center gap-2 text-xs text-[#8d8d8d] mb-1.5 font-mono">
                {msg.role === 'user' ? (
                  <>
                    <span className="font-semibold text-[#b0b0b0]">YOU</span>
                  </>
                ) : (
                  <>
                    <span className="w-4 h-4 rounded-full bg-[#2a2a2a] flex items-center justify-center text-amber-300">
                      <Sparkles size={10} />
                    </span>
                    <span className="font-semibold text-[#a0a0a0]">SOCRATIC COACH</span>
                  </>
                )}
              </div>
              <div className="text-sm text-[#e0e0e0] leading-relaxed">
                <MarkdownView content={msg.content} onApplyCode={onApplyCodeToEditor} />
              </div>
            </article>
          ))}

        {/* Live streaming assistant content */}
        {isStreaming && streamingContent && (
          <article className="chat-message from-coach py-2 animate-fadeIn">
            <div className="message-sender flex items-center gap-2 text-xs text-[#8d8d8d] mb-1.5 font-mono">
              <span className="w-4 h-4 rounded-full bg-[#2a2a2a] flex items-center justify-center text-amber-300">
                <Sparkles size={10} />
              </span>
              <span className="font-semibold text-[#a0a0a0]">SOCRATIC COACH</span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1" />
            </div>
            <div className="text-sm text-[#e0e0e0] leading-relaxed">
              <MarkdownView content={streamingContent} onApplyCode={onApplyCodeToEditor} />
            </div>
          </article>
        )}
      </div>

      {/* Persistent Bottom Composer & Quick Actions (Never-Locked) */}
      <div className="border-t border-[#262626] bg-[#171717] p-3 space-y-2 shrink-0">
        <Composer
          isStreaming={isStreaming}
          onSendMessage={send}
          onStopStreaming={onStopStreaming}
          onQuickAction={quickAction}
          activeMilestoneTitle={activeMilestone ? cleanMilestoneTitle(activeMilestone.title) : undefined}
        />
      </div>
    </section>
  );
};
