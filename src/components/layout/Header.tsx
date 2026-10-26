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
}) => (
  <header className="app-header">
    <div className="brand">
      <span className="brand-mark">
        <Flame size={21} fill="currentColor" />
      </span>
      <span>
        learn<span className="brand-forge">forge</span>
        <span className="brand-period">.</span>
      </span>
    </div>
    <div className="header-divider" />
    <button
      className="icon-button sidebar-toggle"
      onClick={(event) => {
        event.currentTarget.focus();
        onToggleSidebar();
      }}
      aria-label={isSidebarOpen ? 'Hide learning path' : 'Show learning path'}
      aria-expanded={isSidebarOpen}
      aria-controls="learning-path"
    >
      <PanelLeft size={18} />
    </button>
    <div className="track-select-wrap">
      <span className="eyebrow">YOUR TRACK</span>
      <div className="track-select-control">
        <select
          aria-label="Learning track"
          value={currentTrackId}
          onChange={(e) => onSelectTrack(e.target.value)}
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <ChevronDown size={14} />
      </div>
    </div>
    <div className="header-actions">
      <button
        className="review-button"
        onClick={(event) => {
          event.currentTarget.focus();
          onOpenReview();
        }}
        aria-label={`Daily review, ${dueCardsCount} cards due`}
      >
        <Brain size={16} />
        <span>Daily review</span>
        <span className="count-badge">{dueCardsCount}</span>
      </button>
      <button
        className="icon-button export-button"
        onClick={onExportNotes}
        aria-label="Export session notes"
        title="Export session notes"
      >
        <Download size={17} />
      </button>
    </div>
  </header>
);
