import React from 'react';
import { Flame, Brain, BookOpen, Download, Cpu, CheckCircle } from 'lucide-react';
import { SupportedLanguage } from '../../types';

interface HeaderProps {
  currentTrackId: string;
  onSelectTrack: (trackId: string) => void;
  tracks: { id: string; title: string; language: SupportedLanguage }[];
  dueCardsCount: number;
  onOpenReview: () => void;
  onExportNotes: () => void;
  modelName?: string;
  isModelConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTrackId,
  onSelectTrack,
  tracks,
  dueCardsCount,
  onOpenReview,
  onExportNotes,
  modelName = 'gemini-3.8-flash-high',
  isModelConnected = true,
}) => {
  return (
    <header className="h-12 border-b border-forge-border bg-[#161b22] px-4 flex items-center justify-between shrink-0 select-none">
      {/* Brand & Track Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
            <Flame size={16} className="fill-current" />
          </div>
          <span className="font-bold text-sm tracking-tight text-forge-heading hidden md:inline">
            LearnForge
          </span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-forge-surface border border-forge-border text-forge-accent font-semibold">
            v0.1 Prototype
          </span>
        </div>

        {/* Track Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-forge-muted text-xs hidden lg:inline">Track:</span>
          <select
            value={currentTrackId}
            onChange={(e) => onSelectTrack(e.target.value)}
            className="bg-forge-surface hover:bg-forge-surfaceHover text-forge-heading text-xs font-medium py-1 px-2.5 rounded border border-forge-border cursor-pointer focus:outline-none focus:border-forge-accent"
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.language})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center / Right Actions */}
      <div className="flex items-center gap-3">
        {/* Proxy Model Status Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1117] border border-forge-border text-[11px] font-mono">
          <span className={`w-2 h-2 rounded-full ${isModelConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <Cpu size={12} className="text-forge-accent" />
          <span className="text-forge-text truncate max-w-[140px]">{modelName}</span>
        </div>

        {/* FSRS Daily Review Button */}
        <button
          onClick={onOpenReview}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-700/50 text-indigo-300 text-xs font-medium transition-colors"
          title="Daily Spaced Repetition Queue"
        >
          <Brain size={13} className="text-indigo-400" />
          <span>FSRS Review</span>
          {dueCardsCount > 0 ? (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
              {dueCardsCount}
            </span>
          ) : (
            <span className="text-[10px] text-indigo-400/80">0</span>
          )}
        </button>

        {/* Export Session Notes */}
        <button
          onClick={onExportNotes}
          className="flex items-center gap-1 px-2 py-1 rounded bg-forge-surface hover:bg-forge-surfaceHover border border-forge-border text-forge-text hover:text-forge-heading text-xs transition-colors"
          title="Export Session as Markdown Notes"
        >
          <Download size={13} />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
    </header>
  );
};
