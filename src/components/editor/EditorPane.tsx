import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play,
  RotateCcw,
  Code2,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Terminal,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { SupportedLanguage, ExecutionResult } from '../../types';
import { OutputConsole } from './OutputConsole';
import { TestResultsPanel } from './TestResultsPanel';
import './monaco';
import { handleTabNavigation } from '../layout/keyboard';

interface EditorPaneProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  language: SupportedLanguage;
  onRunCode: () => void;
  onResetCode: () => void;
  isRunning: boolean;
  executionResult: ExecutionResult | null;
  onClearConsole: () => void;
  draftStatus: 'saved' | 'saving' | 'memory';
  milestoneId?: string;
}

const fileNames: Record<SupportedLanguage, string> = {
  go: 'main.go',
  python: 'main.py',
  rust: 'main.rs',
  typescript: 'main.ts',
  javascript: 'main.js',
};
const languageNames: Record<SupportedLanguage, string> = {
  go: 'Go',
  python: 'Python',
  rust: 'Rust',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
};

export const EditorPane: React.FC<EditorPaneProps> = ({
  code,
  onChangeCode,
  language,
  onRunCode,
  onResetCode,
  isRunning,
  executionResult,
  onClearConsole,
  draftStatus,
  milestoneId,
}) => {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const [activeBottomTab, setActiveBottomTab] = useState<'console' | 'tests'>('console');
  const [outputOpen, setOutputOpen] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetUndo, setResetUndo] = useState<string | null>(null);
  const resetFocus = useRef(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmReset) confirmRef.current?.focus();
    else if (resetUndo !== null) undoRef.current?.focus();
    else if (resetFocus.current) {
      resetRef.current?.focus();
      resetFocus.current = false;
    }
  }, [confirmReset, resetUndo]);
  const runtimeAvailable = language !== 'rust';
  const testsCount = executionResult?.testResults?.length || 0;
  const passedTests = executionResult?.testResults?.filter((t) => t.passed).length || 0;
  const failed =
    executionResult &&
    (executionResult.exitCode !== 0 || !!executionResult.error || !!executionResult.stderr);
  useEffect(() => {
    resetFocus.current = false;
    setConfirmReset(false);
    setResetUndo(null);
    setActiveBottomTab('console');
  }, [milestoneId, language]);
  useEffect(() => {
    if (isRunning) {
      setOutputOpen(true);
      setActiveBottomTab('console');
    }
    if (executionResult) {
      setOutputOpen(true);
      setActiveBottomTab(executionResult.testResults?.length && !failed ? 'tests' : 'console');
    }
  }, [executionResult, isRunning]);
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'Enter' &&
        !document.querySelector('dialog[open]')
      ) {
        e.preventDefault();
        if (!isRunning && runtimeAvailable) onRunCode();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onRunCode, isRunning, runtimeAvailable]);
  return (
    <section className="editor-pane workspace-panel" aria-label="Code workspace">
      <div className="editor-toolbar">
        <span className="editor-heading">
          <Code2 size={16} />
          Code workspace
        </span>
        <div className="editor-actions">
          {confirmReset ? (
            <div className="reset-confirm">
              <span>Discard edits?</span>
              <button
                onClick={() => {
                  setResetUndo(code);
                  onResetCode();
                  setConfirmReset(false);
                }}
                ref={confirmRef}
                aria-label="Confirm reset to starter code"
              >
                <Check size={15} />
              </button>
              <button onClick={() => setConfirmReset(false)} aria-label="Cancel reset">
                <X size={15} />
              </button>
            </div>
          ) : resetUndo !== null ? (
            <button
              ref={undoRef}
              className="reset-button undo-reset"
              onClick={() => {
                onChangeCode(resetUndo);
                setResetUndo(null);
              }}
            >
              <RotateCcw size={14} />
              Undo reset
            </button>
          ) : (
            <button
              ref={resetRef}
              className="reset-button"
              disabled={isRunning}
              onClick={() => {
                resetFocus.current = true;
                setConfirmReset(true);
              }}
              title="Reset to starter code"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          )}
          <button
            className="run-button"
            onClick={onRunCode}
            disabled={isRunning || !runtimeAvailable}
            title={
              runtimeAvailable
                ? 'Run code (⌘ Enter / Ctrl Enter)'
                : 'Rust execution is not available yet'
            }
          >
            {isRunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
            <span>{isRunning ? 'Running…' : 'Run code'}</span>
            <kbd>⌘ ↵</kbd>
          </button>
        </div>
      </div>
      <div className="editor-filebar">
        <span className="editor-file">
          <span className="file-language-icon">
            {language === 'go'
              ? 'GO'
              : language === 'python'
                ? 'PY'
                : language === 'rust'
                  ? 'RS'
                  : 'JS'}
          </span>
          {fileNames[language]}
          <span
            className="file-saved-dot"
            title={
              draftStatus === 'saved'
                ? 'Saved on this device'
                : draftStatus === 'saving'
                  ? 'Saving changes'
                  : 'In-memory draft'
            }
          />
        </span>
        <span className="file-language-label">{languageNames[language]}</span>
      </div>
      {!runtimeAvailable && (
        <div className="runtime-notice">
          <AlertCircle size={15} />
          <span>You can edit and discuss Rust code here. Running Rust isn’t supported yet.</span>
        </div>
      )}
      <div className="monaco-container">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(value) => {
            setResetUndo(null);
            onChangeCode(value || '');
          }}
          theme="learnforge"
          beforeMount={(monaco) =>
            monaco.editor.defineTheme('learnforge', {
              base: 'vs-dark',
              inherit: true,
              rules: [
                { token: 'comment', foreground: '788279', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'C8A4DB' },
                { token: 'string', foreground: 'B9CA91' },
                { token: 'number', foreground: 'E6B986' },
              ],
              colors: {
                'editor.background': '#17191C',
                'editor.foreground': '#D9DDE3',
                'editorLineNumber.foreground': '#636A74',
                'editorLineNumber.activeForeground': '#BDC3CC',
                'editor.lineHighlightBackground': '#FFFFFF04',
                'editor.selectionBackground': '#E8AD6830',
                'editorCursor.foreground': '#E8AD68',
                'editorIndentGuide.background1': '#FFFFFF0B',
              },
            })
          }
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 22,
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
            tabSize: 4,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 18, bottom: 18 },
            renderLineHighlight: 'gutter',
            cursorBlinking: reducedMotion ? 'solid' : 'smooth',
            smoothScrolling: !reducedMotion,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            wordWrap: 'on',
            lineNumbersMinChars: 3,
            folding: true,
            contextmenu: true,
            ariaLabel: `${languageNames[language]} code editor`,
          }}
          loading={
            <div className="editor-loading">
              <Loader2 size={18} className="animate-spin" />
              Preparing your editor…
            </div>
          }
        />
      </div>
      <div className="editor-statusbar">
        <span role="status" aria-live="polite">
          <span
            className={`tiny-dot ${isRunning || draftStatus === 'saving' ? 'running-dot' : ''}`}
          />
          {isRunning
            ? 'Executing code'
            : draftStatus === 'saving'
              ? 'Saving changes…'
              : draftStatus === 'saved'
                ? 'Saved on this device'
                : 'Device storage unavailable'}
        </span>
        <span>
          {language === 'go'
            ? 'Go simulator'
            : runtimeAvailable
              ? languageNames[language]
              : 'Editor only'}
        </span>
      </div>
      <div className={`output-section ${outputOpen ? 'is-open' : ''}`}>
        <div className="output-tabs">
          <div role="tablist" aria-label="Code output" onKeyDown={handleTabNavigation}>
            <button
              role="tab"
              id="console-tab"
              aria-selected={activeBottomTab === 'console'}
              tabIndex={activeBottomTab === 'console' ? 0 : -1}
              aria-controls="console-panel"
              onClick={() => {
                setActiveBottomTab('console');
                setOutputOpen(true);
              }}
            >
              <Terminal size={14} />
              Output{failed && <span className="output-error-dot" />}
            </button>
            <button
              role="tab"
              id="tests-tab"
              aria-selected={activeBottomTab === 'tests'}
              tabIndex={activeBottomTab === 'tests' ? 0 : -1}
              aria-controls="tests-panel"
              onClick={() => {
                setActiveBottomTab('tests');
                setOutputOpen(true);
              }}
            >
              <CheckCircle2 size={14} />
              Tests
              {testsCount > 0 && (
                <span className={`test-count ${passedTests === testsCount ? 'passing' : ''}`}>
                  {passedTests}/{testsCount}
                </span>
              )}
            </button>
          </div>
          <button
            className="icon-button"
            onClick={() => setOutputOpen((v) => !v)}
            aria-label={outputOpen ? 'Collapse output' : 'Expand output'}
            aria-expanded={outputOpen}
          >
            {outputOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
        {outputOpen && (
          <div
            className="output-content"
            role="tabpanel"
            id={activeBottomTab === 'console' ? 'console-panel' : 'tests-panel'}
            aria-labelledby={activeBottomTab === 'console' ? 'console-tab' : 'tests-tab'}
          >
            {activeBottomTab === 'console' ? (
              <OutputConsole
                stdout={executionResult?.stdout || ''}
                stderr={executionResult?.stderr || executionResult?.error || ''}
                durationMs={executionResult?.durationMs}
                exitCode={executionResult?.exitCode}
                onClear={onClearConsole}
                isRunning={isRunning}
                canRun={runtimeAvailable}
                errorGuidance={
                  language === 'go'
                    ? 'The Go simulator could not execute this program. Some Go syntax is not supported; check the error below before changing your solution.'
                    : 'Execution stopped. Check the error below, update the code, and run again.'
                }
              />
            ) : (
              <TestResultsPanel
                testResults={executionResult?.testResults || []}
                isRunning={isRunning}
                canRun={runtimeAvailable}
                hasRun={executionResult !== null}
              />
            )}
          </div>
        )}
      </div>
      <span className="sr-only" role="status">
        {isRunning
          ? 'Running code'
          : executionResult
            ? failed
              ? 'Execution failed. See output for details.'
              : testsCount
                ? `${passedTests} of ${testsCount} tests passed.`
                : 'Execution complete.'
            : ''}
      </span>
    </section>
  );
};
