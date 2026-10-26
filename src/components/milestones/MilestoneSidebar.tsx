import React from 'react';
import { Milestone } from '../../types';
import { CheckCircle2, Circle, Clock, ChevronRight } from 'lucide-react';

interface MilestoneSidebarProps {
  milestones: Milestone[];
  activeMilestoneId?: string;
  onSelectMilestone: (milestone: Milestone) => void;
}

export const MilestoneSidebar: React.FC<MilestoneSidebarProps> = ({
  milestones,
  activeMilestoneId,
  onSelectMilestone,
}) => {
  return (
    <div className="w-64 border-r border-forge-border bg-[#0d1117] flex flex-col shrink-0">
      <div className="p-3 border-b border-forge-border bg-forge-surface/50">
        <h3 className="text-xs font-semibold text-forge-heading uppercase tracking-wider">
          Milestones
        </h3>
        <p className="text-[11px] text-forge-muted">
          Hands-on progressive builds
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {milestones.length === 0 ? (
          <div className="p-4 text-center text-xs text-forge-muted/60 italic">
            Milestones will be generated as you converse with the Socratic AI.
          </div>
        ) : (
          milestones.map((m, idx) => {
            const isActive = m.id === activeMilestoneId;
            const isCompleted = m.status === 'completed';

            return (
              <button
                key={m.id}
                onClick={() => onSelectMilestone(m)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-start gap-2.5 ${
                  isActive
                    ? 'bg-forge-surface border-forge-accent/70 shadow-sm'
                    : 'bg-transparent border-transparent hover:bg-forge-surface/40 hover:border-forge-border'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 size={15} className="text-emerald-400" />
                  ) : isActive ? (
                    <Clock size={15} className="text-forge-accent animate-pulse" />
                  ) : (
                    <Circle size={15} className="text-forge-muted" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[11px] text-forge-muted mb-0.5">
                    <span>M{idx + 1}</span>
                    <span className="capitalize">{m.status}</span>
                  </div>
                  <div className="text-xs font-medium text-forge-heading truncate">
                    {m.title}
                  </div>
                </div>

                {isActive && <ChevronRight size={14} className="text-forge-accent shrink-0 mt-1" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
