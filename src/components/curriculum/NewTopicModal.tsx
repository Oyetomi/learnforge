import React, { useState } from 'react';
import { X, Sparkles, Loader2, ArrowRight, Code2 } from 'lucide-react';
import { SupportedLanguage } from '../../types';
import { generateCustomTrack } from '../../services/ai/curriculum';

interface NewTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrackCreated: (track: any) => void;
}

const SUGGESTED_TOPICS = [
  { title: 'Linux eBPF Packet Filter', lang: 'go' as const },
  { title: 'LSM-Tree Storage Engine', lang: 'go' as const },
  { title: 'Raft Key-Value Store', lang: 'rust' as const },
  { title: 'Async Event Loop & Coroutines', lang: 'python' as const },
  { title: 'Bytecode Virtual Machine', lang: 'typescript' as const },
  { title: 'Lock-Free Concurrent Queue', lang: 'rust' as const },
];

export const NewTopicModal: React.FC<NewTopicModalProps> = ({
  isOpen,
  onClose,
  onTrackCreated,
}) => {
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('go');
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
          language,
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

  const handleSelectSuggestion = (s: { title: string; lang: SupportedLanguage }) => {
    setTopic(s.title);
    setLanguage(s.lang);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-lg bg-[#191919] border border-[#333333] rounded-2xl shadow-2xl p-6 text-[#e6e6e6] space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-topic-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
          <div className="flex items-center gap-2">
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
            <label htmlFor="topic-input" className="block text-xs font-mono uppercase tracking-wider text-[#a0a0a0] mb-1.5">
              Topic or Project Goal
            </label>
            <input
              id="topic-input"
              type="text"
              autoFocus
              disabled={isGenerating}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Linux eBPF Packet Filter, Building a Redis Clone, Actor Model in Tokio…"
              className="w-full px-3.5 py-2.5 bg-[#121212] border border-[#383838] focus:border-amber-400 rounded-xl text-sm text-[#f0f0f0] placeholder-[#666666] outline-none transition-colors"
            />
          </div>

          {/* Language Selector */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#a0a0a0] mb-1.5">
              Primary Language
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['go', 'rust', 'python', 'typescript'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setLanguage(lang)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium uppercase tracking-wide transition-all cursor-pointer ${
                    language === lang
                      ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                      : 'bg-[#151515] border-[#2c2c2c] text-[#8d8d8d] hover:border-[#444444] hover:text-[#e0e0e0]'
                  }`}
                >
                  {lang === 'typescript' ? 'TS / JS' : lang}
                </button>
              ))}
            </div>
          </div>

          {/* Suggested Topics Pills */}
          <div>
            <span className="block text-xs font-mono uppercase tracking-wider text-[#777777] mb-2">
              Ideas for Inspiration
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TOPICS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleSelectSuggestion(s)}
                  className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#2b2b2b] text-[11px] text-[#a0a0a0] hover:text-[#f0f0f0] transition-colors cursor-pointer"
                >
                  {s.title} <span className="text-amber-400/80 uppercase font-mono text-[9px] ml-1">({s.lang})</span>
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
