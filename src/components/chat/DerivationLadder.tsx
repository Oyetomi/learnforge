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
    color: '#e58055',
    border: 'border-[#e58055]',
    text: 'text-[#e58055]',
    bg: 'bg-[#e58055]/15',
  },
  blue: {
    color: '#4ea8de',
    border: 'border-[#4ea8de]',
    text: 'text-[#4ea8de]',
    bg: 'bg-[#4ea8de]/15',
  },
  green: {
    color: '#52b788',
    border: 'border-[#52b788]',
    text: 'text-[#52b788]',
    bg: 'bg-[#52b788]/15',
  },
  amber: {
    color: '#e5aa72',
    border: 'border-[#e5aa72]',
    text: 'text-[#e5aa72]',
    bg: 'bg-[#e5aa72]/15',
  },
  purple: {
    color: '#b5838d',
    border: 'border-[#b5838d]',
    text: 'text-[#b5838d]',
    bg: 'bg-[#b5838d]/15',
  },
  red: {
    color: '#e63946',
    border: 'border-[#e63946]',
    text: 'text-[#e63946]',
    bg: 'bg-[#e63946]/15',
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
        className={`inline-block border-2 ${c.border} ${c.text} ${c.bg} px-1.5 py-0.5 rounded-md font-mono text-base mx-1 font-semibold`}
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
    <div className="derivation-ladder my-3 p-5 rounded-xl bg-[#17191c] border border-[#2b2f36] text-[#e6e6e6] shadow-md select-text font-sans">
      {/* Title Header */}
      {title && (
        <div className="font-semibold text-sky-400 text-sm tracking-wide mb-3 uppercase font-mono">
          {title}
        </div>
      )}

      {/* Initial Expression State */}
      <div className="font-mono text-lg font-medium text-[#f0f0f0] tracking-wide mb-1 pl-1">
        {renderHighlightedState(initialState)}
      </div>

      {/* Steps with Directed Vertical Connectors */}
      <div className="space-y-0.5">
        {steps.map((step, idx) => {
          const colorKey = step.color || (['orange', 'blue', 'green', 'amber'][idx % 4] as keyof typeof colorMap);
          const c = colorMap[colorKey] || colorMap.blue;

          return (
            <div key={idx} className="step-group flex flex-col">
              {/* Connector Row: SVG vertical line with arrow and annotation */}
              <div className="flex items-start gap-3 my-0.5">
                {/* Vertical Arrow Indicator */}
                <div className="flex flex-col items-center w-5 shrink-0 pt-0.5">
                  <svg width="12" height="38" viewBox="0 0 12 38" className="overflow-visible">
                    <line
                      x1="6"
                      y1="0"
                      x2="6"
                      y2="30"
                      stroke={c.color}
                      strokeWidth="2"
                    />
                    <polygon
                      points="2,28 6,36 10,28"
                      fill={c.color}
                    />
                  </svg>
                </div>

                {/* Step Annotation */}
                <div className="flex-1 py-0.5">
                  <div className="italic text-sm text-[#b0b0b0] font-serif leading-snug">
                    {step.rule}
                  </div>
                  {step.evalText && (
                    <div className="font-mono text-xs text-[#8d929b] mt-0.5 tracking-tight">
                      {step.evalText}
                    </div>
                  )}
                </div>
              </div>

              {/* State After Transformation */}
              <div className="font-mono text-lg font-medium text-[#f0f0f0] tracking-wide pl-1 py-1">
                {renderHighlightedState(step.state)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Result Footer */}
      {result && (
        <div className="mt-4 pt-3 border-t border-[#2a2e36]">
          <div className="font-semibold text-sky-400 text-xs uppercase tracking-wider font-mono mb-1">
            Result
          </div>
          <div className="font-mono text-xl font-bold text-emerald-400 pl-1">
            {renderHighlightedState(result)}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Standard Presets for instant display & verification
 */
export const MATH_SIMPLIFY_LADDER: DerivationLadderProps = {
  title: 'Simplify expression',
  initialState: '6 ÷ 2(1 + 2)',
  steps: [
    {
      rule: 'Rewrite the expression in fractional form',
      evalText: '6 ÷ 2(1 + 2) = 6 / 2(1 + 2)',
      state: '6 / 2([1 + 2]:blue)',
      color: 'orange',
    },
    {
      rule: 'Add numbers',
      evalText: '1 + 2 = 3',
      state: '6 / (2 × [3]:blue)',
      color: 'blue',
    },
    {
      rule: 'Multiply numbers in the denominator',
      evalText: '2 × 3 = 6',
      state: '6 / [6]:green',
      color: 'green',
    },
    {
      rule: 'Dividing the same numbers equals 1',
      evalText: '6 / 6 = 1',
      state: '[1]:orange',
      color: 'orange',
    },
  ],
  result: '1',
};

export const GO_CHANNEL_LADDER: DerivationLadderProps = {
  title: 'Channel Synchronization Handoff',
  initialState: 'ch := make(chan string) [Buffer: 0]',
  steps: [
    {
      rule: 'Main goroutine executes send to unbuffered channel',
      evalText: 'Sending blocks because no receiver is waiting',
      state: '[G1: Blocked on send]:orange -> [ch buffer: 0]',
      color: 'orange',
    },
    {
      rule: 'Spawn concurrent worker goroutine',
      evalText: 'go func() { ch <- msg }()',
      state: '[G2: Sender]:blue -> [ch] -> [G1: Receiver]:green',
      color: 'blue',
    },
    {
      rule: 'Direct synchronous value handoff',
      evalText: 'Value copied from G2 to G1, both goroutines unblock',
      state: '[G1: Received "concurrency-ok"]:green',
      color: 'green',
    },
  ],
  result: 'Zero-copy synchronous transfer complete',
};

export const GO_WAITGROUP_LADDER: DerivationLadderProps = {
  title: 'sync.WaitGroup Atomic Lifecycle',
  initialState: 'var wg sync.WaitGroup [Counter: 0]',
  steps: [
    {
      rule: 'Increment counter in parent before spawning worker',
      evalText: 'wg.Add(1) -> Counter = 0 + 1 = 1',
      state: '[Counter: 1]:blue',
      color: 'blue',
    },
    {
      rule: 'Worker executes task concurrently',
      evalText: 'go func() { defer wg.Done(); counter += 1 }()',
      state: '[Worker executing, counter updated]:amber',
      color: 'amber',
    },
    {
      rule: 'Worker returns and defer wg.Done() executes',
      evalText: 'wg.Done() -> Counter = 1 - 1 = 0',
      state: '[Counter: 0]:green',
      color: 'green',
    },
    {
      rule: 'wg.Wait() unblocks when counter reaches 0',
      evalText: 'All workers finished, main proceeds safely',
      state: '[Main unblocked]:orange',
      color: 'orange',
    },
  ],
  result: 'Safe deterministic concurrency without time.Sleep',
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
