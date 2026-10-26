import React, { useState } from 'react';
import { X, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { generateCustomTrack } from '../../services/ai/curriculum';

interface NewTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrackCreated: (track: any) => void;
}

const SUGGESTED_TOPICS = [
  'Linux eBPF Packet Filter',
  'LSM-Tree Storage Engine',
  'Raft Distributed Key-Value Store',
  'Async Event Loop & Coroutines',
  'Bytecode Virtual Machine',
  'Lock-Free Concurrent Queue',
];

export const NewTopicModal: React.FC<NewTopicModalProps> = ({
  isOpen,
  onClose,
  onTrackCreated,
}) => {
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setStatusMessage('Connecting to AI curriculum architect…');

    try {
      const track = await generateCustomTrack(
        {
          topic: topic.trim(),
        },
        (status) => setStatusMessage(status)
      );

      setIsGenerating(false);
      onTrackCreated(track);
      onClose();
    } catch (err: any) {
      setIsGenerating(false);
      setError(err?.message || 'Failed to generate curriculum. Please check your AI proxy connection.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-lg bg-[#181818] border border-[#2f2f2f] rounded-2xl shadow-2xl p-6 text-[#e6e6e6] space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-topic-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Sparkles size={18} />
            </span>
            <h2 id="new-topic-title" className="font-serif text-2xl font-normal text-[#f0f0f0] tracking-tight m-0">
              What do you want to learn?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="p-1 rounded-lg text-[#8d8d8d] hover:text-[#e6e6e6] hover:bg-[#282828] transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="topic-input" className="block text-xs font-mono uppercase tracking-wider text-[#a0a0a0] mb-2">
              Topic or Project Goal
            </label>
            <input
              id="topic-input"
              type="text"
              autoFocus
              disabled={isGenerating}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Building a Redis Clone, Raft Distributed KV Store, LSM-Tree Engine…"
              className="w-full px-4 py-3 bg-[#121212] border border-[#383838] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-base text-[#f0f0f0] placeholder-[#606060] outline-none transition-all"
            />
          </div>

          {/* Suggested Topics */}
          <div>
            <span className="block text-xs font-mono uppercase tracking-wider text-[#707070] mb-2">
              Ideas for Inspiration
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TOPICS.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setTopic(t)}
                  className="px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#2b2b2b] hover:border-[#404040] text-xs text-[#a0a0a0] hover:text-[#f0f0f0] transition-colors cursor-pointer"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/50 text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Progress state */}
          {isGenerating && (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/40 flex items-center gap-3 text-amber-300 text-xs animate-pulse">
              <Loader2 size={16} className="animate-spin text-amber-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#282828]">
            <button
              type="button"
              disabled={isGenerating}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#8d8d8d] hover:text-[#e0e0e0] hover:bg-[#222222] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isGenerating || !topic.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-black font-semibold text-xs tracking-wide transition-all cursor-pointer shadow-lg shadow-amber-600/20"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating Track…
                </>
              ) : (
                <>
                  Forge Curriculum <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
