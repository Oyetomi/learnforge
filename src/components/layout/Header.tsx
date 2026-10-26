import React from 'react';
import { Flame, Brain, Download, ChevronDown, PanelLeft } from 'lucide-react';
import { SupportedLanguage } from '../../types';

interface HeaderProps {
  currentTrackId: string;
  onSelectTrack: (trackId: string) => void;
  tracks: { id: string; title: string; language: SupportedLanguage }[];
  dueCardsCount: number;
  onOpenReview: () => void;
  onExportNotes: () => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  trackTitle?: string;
  onOpenNewTopic?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTrackId,
  onSelectTrack,
  tracks,
  dueCardsCount,
  onOpenReview,
  onExportNotes,
  onToggleSidebar,
  isSidebarOpen,
  trackTitle,
  onOpenNewTopic,
}) => {
  const currentTrack = tracks.find((t) => t.id === currentTrackId);
  const displayTitle = trackTitle || currentTrack?.title || 'LearnForge';

  const handleDropdownChange = (val: string) => {
    if (val === '__new__') {
      onOpenNewTopic?.();
      return;
    }
    onSelectTrack(val);
  };

  return (
    <header className="app-header h-15 bg-[#141414] border-b border-[#2e2e2e] flex items-center justify-between px-4 select-none shrink-0 z-10">
      {/* Left: Brand & Sidebar Toggle */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="p-1.5 rounded-md text-[#8d8d8d] hover:text-[#e6e6e6] hover:bg-[#222222] transition-colors cursor-pointer"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Hide learning path' : 'Show learning path'}
          aria-expanded={isSidebarOpen}
        >
          <PanelLeft size={18} />
        </button>

        <div className="flex items-center gap-2 pr-3 border-r border-[#2e2e2e]">
          <span className="text-amber-400">
            <Flame size={19} fill="currentColor" />
          </span>
          <span className="font-semibold text-sm tracking-tight text-[#e6e6e6] hidden sm:inline">
            learn<span className="text-amber-300">forge</span>
          </span>
        </div>

        {/* Center / Session Title in LearnHarness-style Serif */}
        <div className="min-w-0">
          <h1 className="font-serif text-lg sm:text-xl font-normal text-[#f0f0f0] tracking-tight truncate m-0">
            {displayTitle}
          </h1>
        </div>
      </div>

      {/* Right: Track Switcher & Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Track Selector Dropdown with Create Option */}
        <div className="relative flex items-center">
          <select
            aria-label="Select learning track"
            value={currentTrackId}
            onChange={(e) => handleDropdownChange(e.target.value)}
            className="appearance-none bg-[#1c1c1c] hover:bg-[#252525] border border-[#383838] text-xs text-[#cccccc] font-medium py-1.5 pl-3 pr-7 rounded-lg cursor-pointer transition-colors focus:border-amber-400"
          >
            <optgroup label="Active Tracks">
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="Explore Custom Topic">
              <option value="__new__">+ New Custom Track…</option>
            </optgroup>
          </select>
          <ChevronDown size={13} className="absolute right-2 text-[#8d8d8d] pointer-events-none" />
        </div>

        {/* + New Topic Quick Button */}
        {onOpenNewTopic && (
          <button
            type="button"
            onClick={onOpenNewTopic}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium transition-colors cursor-pointer"
            title="Create a new custom learning track on any topic"
          >
            <span>+ Topic</span>
          </button>
        )}

        {/* Daily Review Button with Badge */}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#383838] text-xs font-medium text-[#cccccc] hover:text-[#f0f0f0] transition-colors cursor-pointer"
          onClick={onOpenReview}
          aria-label={`Daily review, ${dueCardsCount} cards due`}
        >
          <Brain size={14} className="text-amber-400" />
          <span className="hidden md:inline">Daily review</span>
          {dueCardsCount > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {dueCardsCount}
            </span>
          ) : (
            <span className="text-[10px] text-[#8d8d8d]">0</span>
          )}
        </button>

        {/* Export Notes Button */}
        <button
          type="button"
          className="p-1.5 rounded-lg text-[#8d8d8d] hover:text-[#e6e6e6] hover:bg-[#222222] transition-colors cursor-pointer"
          onClick={onExportNotes}
          aria-label="Export session notes"
          title="Export session notes as Markdown"
        >
          <Download size={16} />
        </button>
      </div>
    </header>
  );
};
