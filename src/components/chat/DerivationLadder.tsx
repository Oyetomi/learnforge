import React from 'react';

export interface LadderStep {
  rule: string;
  evalText?: string;
  state: string;
  color?: 'orange' | 'blue' | 'green' | 'amber' | 'purple' | 'red';
}

export interface DerivationLadderProps {
  title?: string;
  initialState: string;
  steps: LadderStep[];
  result?: string;
}

const colorMap = {
  orange: {
    line: 'stroke-amber-500',
    arrow: 'text-amber-500',
    border: 'border-amber-500/80',
    text: 'text-amber-300',
    bg: 'bg-amber-950/20',
  },
  blue: {
    line: 'stroke-sky-400',
    arrow: 'text-sky-400',
    border: 'border-sky-400/80',
    text: 'text-sky-300',
    bg: 'bg-sky-950/20',
  },
  green: {
    line: 'stroke-emerald-400',
    arrow: 'text-emerald-400',
    border: 'border-emerald-400/80',
    text: 'text-emerald-300',
    bg: 'bg-emerald-950/20',
  },
  amber: {
    line: 'stroke-amber-400',
    arrow: 'text-amber-400',
    border: 'border-amber-400/80',
    text: 'text-amber-300',
    bg: 'bg-amber-950/20',
  },
  purple: {
    line: 'stroke-purple-400',
    arrow: 'text-purple-400',
    border: 'border-purple-400/80',
    text: 'text-purple-300',
    bg: 'bg-purple-950/20',
  },
  red: {
    line: 'stroke-red-400',
    arrow: 'text-red-400',
    border: 'border-red-400/80',
    text: 'text-red-300',
    bg: 'bg-red-950/20',
  },
};

/**
 * Parses state string to highlight `[term]:color` or `[term]` in colored rounded pills
 */
function renderHighlightedState(raw: string) {
  // Regex matches [content]:color or [content]
  const regex = /\[([^\]]+)\](?::([a-z]+))?/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      parts.push(raw.substring(lastIndex, match.index));
    }
    const content = match[1];
    const colorKey = (match[2] as keyof typeof colorMap) || 'blue';
    const c = colorMap[colorKey] || colorMap.blue;

    parts.push(
      <span
        key={match.index}
        className={`inline-block border-2 ${c.border} ${c.text} ${c.bg} px-1.5 py-0.5 rounded-md font-mono text-sm mx-0.5`}
      >
        {content}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    parts.push(raw.substring(lastIndex));
  }

  return parts;
}

export const DerivationLadder: React.FC<DerivationLadderProps> = ({
  title,
  initialState,
  steps,
  result,
}) => {
  return (
    <div className="derivation-ladder my-4 p-5 rounded-xl bg-[#171717] border border-[#2b2b2b] text-[#e6e6e6] shadow-sm select-text font-sans">
      {/* Title */}
      {title && (
        <div className="font-semibold text-sky-400 text-sm tracking-wide mb-3 uppercase font-mono">
          {title}
        </div>
      )}

      {/* Initial Expression State */}
      <div className="font-mono text-lg font-medium text-[#f0f0f0] tracking-wide mb-2 pl-2">
        {renderHighlightedState(initialState)}
      </div>

      {/* Steps with Directed Vertical Connectors */}
      <div className="space-y-1">
        {steps.map((step, idx) => {
          const colorKey = step.color || (['orange', 'blue', 'green', 'amber'][idx % 4] as keyof typeof colorMap);
          const c = colorMap[colorKey] || colorMap.blue;

          return (
            <div key={idx} className="step-group flex flex-col">
              {/* Connector Row: Vertical line with annotation */}
              <div className="flex items-start gap-4 my-1">
                {/* Vertical Arrow Indicator */}
                <div className="flex flex-col items-center w-6 shrink-0 pt-0.5">
                  <div className={`w-[2px] h-10 ${c.bg.replace('/20', '')} bg-current opacity-80`} />
                  <div className={`w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-current ${c.text}`} />
                </div>

                {/* Step Annotation */}
                <div className="flex-1 py-1">
                  <div className="italic text-sm text-[#a8a8a8] font-serif leading-snug">
                    {step.rule}
                  </div>
                  {step.evalText && (
                    <div className="font-mono text-xs text-[#808080] mt-0.5 tracking-tight">
                      {step.evalText}
                    </div>
                  )}
                </div>
              </div>

              {/* State After Transformation */}
              <div className="font-mono text-lg font-medium text-[#f0f0f0] tracking-wide pl-2 py-1">
                {renderHighlightedState(step.state)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Result Footer */}
      {result && (
        <div className="mt-4 pt-3 border-t border-[#262626]">
          <div className="font-semibold text-sky-400 text-xs uppercase tracking-wider font-mono mb-1">
            Result
          </div>
          <div className="font-mono text-xl font-bold text-emerald-400 pl-2">
            {renderHighlightedState(result)}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Parser for code blocks with language `ladder` or `steps`
 */
export function parseLadderMarkdown(rawText: string): DerivationLadderProps | null {
  try {
    const lines = rawText.trim().split('\n');
    let title: string | undefined;
    let initialState: string = '';
    let result: string | undefined;
    const steps: LadderStep[] = [];

    let currentStep: Partial<LadderStep> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.toLowerCase().startsWith('title:')) {
        title = line.slice(6).trim();
        continue;
      }

      if (line.toLowerCase().startsWith('initial:') || line.toLowerCase().startsWith('start:')) {
        initialState = line.slice(line.indexOf(':') + 1).trim();
        continue;
      }

      if (line.toLowerCase().startsWith('result:')) {
        if (currentStep && currentStep.state) {
          steps.push(currentStep as LadderStep);
          currentStep = null;
        }
        result = line.slice(7).trim();
        continue;
      }

      if (line === '---' || line.toLowerCase().startsWith('step:')) {
        if (currentStep && currentStep.state) {
          steps.push(currentStep as LadderStep);
        }
        currentStep = {};
        continue;
      }

      if (currentStep) {
        if (line.toLowerCase().startsWith('rule:')) {
          currentStep.rule = line.slice(5).trim();
        } else if (line.toLowerCase().startsWith('eval:')) {
          currentStep.evalText = line.slice(5).trim();
        } else if (line.toLowerCase().startsWith('state:')) {
          currentStep.state = line.slice(6).trim();
        } else if (line.toLowerCase().startsWith('color:')) {
          currentStep.color = line.slice(6).trim() as any;
        }
      } else if (!initialState) {
        initialState = line;
      }
    }

    if (currentStep && currentStep.state) {
      steps.push(currentStep as LadderStep);
    }

    if (initialState && steps.length > 0) {
      return {
        title,
        initialState,
        steps,
        result,
      };
    }
  } catch (err) {
    console.warn('Could not parse ladder block:', err);
  }

  return null;
}
