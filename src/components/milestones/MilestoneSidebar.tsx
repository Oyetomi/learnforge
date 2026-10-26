import React from 'react';
import { Check, Route, X } from 'lucide-react';
import { Milestone } from '../../types';

interface MilestoneSidebarProps {
  milestones: Milestone[];
  activeMilestoneId?: string;
  onSelectMilestone: (milestone: Milestone) => void;
  onClose: () => void;
}

export const cleanMilestoneTitle = (title: string) => title.replace(/^Milestone\s*\d+\s*:\s*/i, '');

export const MilestoneSidebar: React.FC<MilestoneSidebarProps> = ({
  milestones,
  activeMilestoneId,
  onSelectMilestone,
  onClose,
}) => {
  const completed = milestones.filter((m) => m.status === 'completed').length;
  const progress = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;
  return (
    <aside id="learning-path" className="learning-sidebar" aria-label="Learning path">
      <div className="sidebar-heading">
        <span>
          <Route size={16} /> Learning path
        </span>
        <button
          className="icon-button mobile-sidebar-close"
          onClick={onClose}
          aria-label="Close learning path"
        >
          <X size={18} />
        </button>
      </div>
      <div className="path-progress">
        <div>
          <span>Track progress</span>
          <strong>{progress}%</strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Track completion"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>
          {completed} of {milestones.length} milestones completed
        </p>
      </div>
      <div className="sidebar-section-label">
        MILESTONES <span>{String(milestones.length).padStart(2, '0')}</span>
      </div>
      <nav className="milestone-list" aria-label="Milestones">
        {milestones.map((m, index) => {
          const active = m.id === activeMilestoneId;
          const done = m.status === 'completed';
          return (
            <button
              key={m.id}
              className={`milestone-item ${active ? 'is-active' : ''} ${done ? 'is-complete' : ''}`}
              onClick={() => onSelectMilestone(m)}
              aria-current={active ? 'step' : undefined}
            >
              <span className="milestone-number">
                {done ? <Check size={14} /> : String(index + 1).padStart(2, '0')}
              </span>
              <span className="milestone-copy">
                <span>{cleanMilestoneTitle(m.title)}</span>
                <small>
                  {done
                    ? 'Completed'
                    : active || m.status === 'active'
                      ? 'In progress'
                      : 'Not started'}
                </small>
              </span>
              {active && <span className="active-dot" />}
            </button>
          );
        })}
        {!milestones.length && (
          <p className="empty-path">Your milestones will appear here when you start a track.</p>
        )}
      </nav>
      <div className="sidebar-bottom">
        <p className="sidebar-save-note">Progress saved on this device</p>
      </div>
    </aside>
  );
};
