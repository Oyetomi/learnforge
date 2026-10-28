import React from 'react';
import { renderToString } from 'katex';
import 'katex/dist/katex.min.css';

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

const highlightColors: Record<string, string> = {
  orange: '#d18b70',
  blue: '#78aed0',
  green: '#8bbf92',
  amber: '#d6b276',
  purple: '#baa0d0',
  red: '#d49b94',
};

function renderHighlightedState(raw: string) {
  const pattern = /\[([^\]]+)\](?::([a-z]+))?/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > lastIndex) parts.push(raw.slice(lastIndex, match.index));
    parts.push(
      <mark key={match.index} style={{ color: highlightColors[match[2]] || highlightColors.blue }}>
        {match[1]}
      </mark>
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < raw.length) parts.push(raw.slice(lastIndex));
  return parts;
}

function renderState(raw: string) {
  const text = raw.trim();
  const math =
    text.startsWith('$$') && text.endsWith('$$')
      ? text.slice(2, -2)
      : text.startsWith('$') && text.endsWith('$')
        ? text.slice(1, -1)
        : text.startsWith('\\(') && text.endsWith('\\)')
          ? text.slice(2, -2)
          : text.startsWith('\\[') && text.endsWith('\\]')
            ? text.slice(2, -2)
            : null;
  if (math !== null) {
    const html = renderToString(math, {
      displayMode: true,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
    });
    return <div className="ladder-formula" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <code className="ladder-state">{renderHighlightedState(raw)}</code>;
}

export const DerivationLadder: React.FC<DerivationLadderProps> = ({
  title,
  initialState,
  steps,
  result,
}) => (
  <section
    className="derivation-ladder visual-ladder"
    aria-label={title || 'Step-by-step explanation'}
  >
    <h4>{title || 'Step-by-step explanation'}</h4>
    <div className="ladder-start">
      <span>Starting state</span>
      {renderState(initialState)}
    </div>
    <ol className="ladder-steps">
      {steps.map((step, index) => {
        const color =
          highlightColors[step.color || ['orange', 'blue', 'green'][index % 3]] ||
          highlightColors.blue;
        return (
          <li key={index}>
            <div className="ladder-transition">
              <span className="ladder-arrow" style={{ color }} aria-hidden="true">
                <svg width="18" height="100%" viewBox="0 0 18 100" preserveAspectRatio="none">
                  <line
                    x1="9"
                    y1="3"
                    x2="9"
                    y2="92"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <polyline
                    points="3,86 9,94 15,86"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="ladder-annotation">
                <h5>
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.rule}
                </h5>
                {step.evalText && (
                  <div className="ladder-evaluation">{renderState(step.evalText)}</div>
                )}
              </div>
            </div>
            <div className="ladder-after">{renderState(step.state)}</div>
          </li>
        );
      })}
    </ol>
    {result && (
      <div className="ladder-result">
        <span>Result</span>
        {renderState(result)}
      </div>
    )}
  </section>
);

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
  result: 'Sender and receiver resume after the handoff',
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

/** Read existing coach explanations without another AI request. */
export function extractDerivationLadders(content: string): DerivationLadderProps[] {
  const blocks = /^[ \t]*```[ \t]*(?:ladder|steps)[^\r\n]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gim;
  const ladders: DerivationLadderProps[] = [];
  for (const match of content.matchAll(blocks)) {
    const ladder = parseLadderMarkdown(match[1]);
    if (ladder) ladders.push(ladder);
  }
  return ladders;
}
