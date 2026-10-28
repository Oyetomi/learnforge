import React from "react";
import { Download, PanelLeft, Plus, Settings } from "lucide-react";
import { SupportedLanguage } from "../../types";
import { TrackPicker } from "./TrackPicker";

interface HeaderProps {
  currentTrackId: string;
  onSelectTrack: (trackId: string) => void;
  tracks: { id: string; title: string; language: SupportedLanguage | null }[];
  dueCardsCount?: number;
  onOpenReview?: () => void;
  onExportNotes: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onOpenNewTopic: () => void;
  onManageTopics: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTrackId,
  onSelectTrack,
  tracks,
  onExportNotes,
  onOpenSettings,
  onToggleSidebar,
  isSidebarOpen,
  onOpenNewTopic,
  onManageTopics,
}) => (
  <header className="app-header">
    <div className="header-brand-group">
      <button
        className="icon-button"
        onClick={(event) => {
          event.currentTarget.focus();
          onToggleSidebar();
        }}
        aria-label={isSidebarOpen ? "Hide learning path" : "Show learning path"}
        disabled={!tracks.length}
        aria-expanded={isSidebarOpen && !!tracks.length}
        aria-controls="learning-path"
      >
        <PanelLeft size={18} />
      </button>
      <div className="workspace-brand" aria-label="LearnForge">
        <img
          src="/app-icon@2x.png"
          width={23}
          height={23}
          alt=""
          className="brand-mark"
        />
        <span>
          learnforge<span>.</span>
        </span>
      </div>
    </div>
    <TrackPicker
      tracks={tracks}
      currentTrackId={currentTrackId}
      onSelectTrack={onSelectTrack}
      onManageTopics={onManageTopics}
    />
    <div className="header-actions">
      <button
        className="header-secondary-button new-topic-trigger"
        onClick={(event) => {
          event.currentTarget.focus();
          onOpenNewTopic();
        }}
        aria-label="Create new topic"
      >
        <Plus size={16} />
        <span>New topic</span>
      </button>
      <button
        className="icon-button export-button"
        disabled={!tracks.length}
        onClick={onExportNotes}
        aria-label="Export session notes"
        title="Export notes"
      >
        <Download size={17} />
      </button>
      <button
        className="icon-button"
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
      >
        <Settings size={17} />
      </button>
    </div>
  </header>
);
