import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, RotateCcw, Check, Sparkles, Terminal, CheckCircle2, ChevronDown } from 'lucide-react';
import { SupportedLanguage, ExecutionResult } from '../../types';
import { OutputConsole } from './OutputConsole';
import { TestResultsPanel } from './TestResultsPanel';

interface EditorPaneProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  language: SupportedLanguage;
  onChangeLanguage: (lang: SupportedLanguage) => void;
  onRunCode: () => void;
  onResetCode: () => void;
  isRunning: boolean;
  executionResult: ExecutionResult | null;
  onClearConsole: () => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  code,
  onChangeCode,
  language,
  onChangeLanguage,
  onRunCode,
  onResetCode,
  isRunning,
  executionResult,
  onClearConsole,
}) => {
  const [activeBottomTab, setActiveBottomTab] = useState<'console' | 'tests'>('console');

  // Convert language to Monaco language id
  const getMonacoLang = (lang: SupportedLanguage) => {
    switch (lang) {
      case 'go': return 'go';
      case 'python': return 'python';
      case 'rust': return 'rust';
      case 'typescript': return 'typescript';
      case 'javascript': return 'javascript';
      default: return 'plaintext';
    }
  };

  const testsCount = executionResult?.testResults?.length || 0;
  const passedTests = executionResult?.testResults?.filter((t) => t.passed).length || 0;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] min-h-0 overflow-hidden">
      {/* Editor Top Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-forge-surface/70 border-b border-forge-border text-xs shrink-0">
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <div className="relative">
            <select
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value as SupportedLanguage)}
              className="appearance-none bg-forge-surface hover:bg-forge-surfaceHover text-forge-heading text-xs font-mono font-medium py-1 pl-2.5 pr-6 rounded border border-forge-border cursor-pointer focus:outline-none focus:border-forge-accent"
            >
              <option value="go">Go 1.22</option>
              <option value="python">Python 3.12</option>
              <option value="typescript">TypeScript 5.7</option>
              <option value="rust">Rust 1.80</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-2 pointer-events-none text-forge-muted" />
          </div>

          <span className="text-forge-muted text-[11px] hidden sm:inline">
            In-Browser Execution
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onResetCode}
            disabled={isRunning}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-forge-surface hover:bg-forge-surfaceHover border border-forge-border text-forge-muted hover:text-forge-heading transition-colors text-xs disabled:opacity-50"
            title="Reset to starter code"
          >
            <RotateCcw size={12} />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            onClick={onRunCode}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-sm disabled:opacity-50"
            title="Run Code (Cmd+Enter or Ctrl+Enter)"
          >
            <Play size={12} className={isRunning ? 'animate-spin' : 'fill-current'} />
            <span>{isRunning ? 'Running...' : 'Run Code'}</span>
          </button>
        </div>
      </div>

      {/* Monaco Code Editor */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={getMonacoLang(language)}
          value={code}
          onChange={(val) => onChangeCode(val || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
            tabSize: 4,
            insertSpaces: true,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
          }}
          loading={
            <div className="h-full flex items-center justify-center text-forge-muted text-xs font-mono">
              Loading Monaco Editor...
            </div>
          }
        />
      </div>

      {/* Bottom Tabs & Output Section */}
      <div className="h-44 sm:h-52 border-t border-forge-border flex flex-col shrink-0 bg-[#0a0e14]">
        {/* Tab Header */}
        <div className="flex items-center px-2 bg-[#161b22] border-b border-forge-border text-xs gap-1 shrink-0">
          <button
            onClick={() => setActiveBottomTab('console')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeBottomTab === 'console'
                ? 'border-forge-accent text-forge-heading'
                : 'border-transparent text-forge-muted hover:text-forge-text'
            }`}
          >
            <Terminal size={12} />
            <span>Console Output</span>
          </button>

          <button
            onClick={() => setActiveBottomTab('tests')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeBottomTab === 'tests'
                ? 'border-forge-accent text-forge-heading'
                : 'border-transparent text-forge-muted hover:text-forge-text'
            }`}
          >
            <CheckCircle2 size={12} />
            <span>Tests</span>
            {testsCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${passedTests === testsCount ? 'bg-emerald-900/60 text-emerald-300' : 'bg-yellow-900/60 text-yellow-300'}`}>
                {passedTests}/{testsCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0">
          {activeBottomTab === 'console' ? (
            <OutputConsole
              stdout={executionResult?.stdout || ''}
              stderr={executionResult?.stderr || executionResult?.error || ''}
              durationMs={executionResult?.durationMs}
              exitCode={executionResult?.exitCode}
              onClear={onClearConsole}
            />
          ) : (
            <TestResultsPanel
              testResults={executionResult?.testResults || []}
              isRunning={isRunning}
            />
          )}
        </div>
      </div>
    </div>
  );
};
