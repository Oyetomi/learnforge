import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
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
} from "lucide-react";
import { SupportedLanguage, ExecutionResult } from "../../types";
import { OutputConsole } from "./OutputConsole";
import { TestResultsPanel } from "./TestResultsPanel";
import "./monaco";
import {
  getExecutionEnvironment,
  ExecutionEnvironment,
} from "../../services/sandbox/api";
import { handleTabNavigation } from "../layout/keyboard";
import { editorShortcutApplies } from "./keyboard";

interface EditorPaneProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  language: SupportedLanguage;
  onRunCode: () => void;
  onResetCode: () => void;
  isRunning: boolean;
  executionResult: ExecutionResult | null;
  onClearConsole: () => void;
  draftStatus: "saved" | "saving" | "memory";
  milestoneId?: string;
  onNextMilestone?: () => void;
  canAdvance?: boolean;
  onClose?: () => void;
}

const fileNames: Record<string, string> = {
  go: "main.go",
  golang: "main.go",
  python: "main.py",
  py: "main.py",
  rust: "main.rs",
  rs: "main.rs",
  typescript: "main.ts",
  ts: "main.ts",
  javascript: "main.js",
  js: "main.js",
  cpp: "main.cpp",
  "c++": "main.cpp",
  c: "main.c",
  java: "Main.java",
  csharp: "Program.cs",
  cs: "Program.cs",
  "c#": "Program.cs",
  bash: "script.sh",
  sh: "script.sh",
  shell: "script.sh",
  ruby: "main.rb",
  rb: "main.rb",
  php: "index.php",
  swift: "main.swift",
  zig: "main.zig",
  elixir: "main.exs",
  sql: "query.sql",
};

const languageNames: Record<string, string> = {
  go: "Go",
  golang: "Go",
  python: "Python",
  py: "Python",
  rust: "Rust",
  rs: "Rust",
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  js: "JavaScript",
  cpp: "C++",
  "c++": "C++",
  c: "C",
  java: "Java",
  csharp: "C#",
  cs: "C#",
  "c#": "C#",
  bash: "Bash",
  sh: "Bash",
  shell: "Bash",
  ruby: "Ruby",
  rb: "Ruby",
  php: "PHP",
  swift: "Swift",
  zig: "Zig",
  elixir: "Elixir",
  sql: "SQL",
};

function getMonacoLanguage(lang: string): string {
  const clean = (lang || "").trim().toLowerCase();
  switch (clean) {
    case "go":
    case "golang":
      return "go";
    case "python":
    case "py":
      return "python";
    case "rust":
    case "rs":
      return "rust";
    case "typescript":
    case "ts":
      return "typescript";
    case "javascript":
    case "js":
      return "javascript";
    case "cpp":
    case "c++":
    case "cxx":
      return "cpp";
    case "c":
      return "c";
    case "java":
      return "java";
    case "csharp":
    case "cs":
    case "c#":
      return "csharp";
    case "bash":
    case "sh":
    case "shell":
    case "zsh":
      return "shell";
    case "ruby":
    case "rb":
      return "ruby";
    case "php":
      return "php";
    case "swift":
      return "swift";
    case "sql":
      return "sql";
    case "lua":
    case "kotlin":
    case "r":
      return clean;
    default:
      return "plaintext";
  }
}

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
  onNextMilestone,
  canAdvance = false,
  onClose,
}) => {
  const paneRef = useRef<HTMLElement>(null);
  const executedCode = useRef<string | null>(null);
  const resultIsStale =
    executionResult !== null &&
    executedCode.current !== null &&
    code !== executedCode.current;
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const [activeBottomTab, setActiveBottomTab] = useState<"console" | "tests">(
    "console"
  );
  const [outputOpen, setOutputOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetUndo, setResetUndo] = useState<string | null>(null);
  const resetFocus = useRef(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmReset) confirmRef.current?.focus();
    else if (resetUndo !== null) {
      undoRef.current?.focus();
      resetFocus.current = false;
    } else if (resetFocus.current) {
      resetRef.current?.focus();
      resetFocus.current = false;
    }
  }, [confirmReset, resetUndo]);
  const [runtime, setRuntime] = useState<
    ExecutionEnvironment & { language: string }
  >({
    language,
    available: false,
    label: "Checking runtime…",
    detail: "Checking execution service availability.",
  });
  useEffect(() => {
    let active = true;
    setRuntime({
      language,
      available: false,
      label: "Checking runtime…",
      detail: "Checking execution service availability.",
    });
    getExecutionEnvironment(language)
      .then((result) => {
        if (active) setRuntime({ ...result, language });
      })
      .catch(() => {
        // Allow an explicit Run to retry catalog discovery after a connection error.
        if (active)
          setRuntime({
            language,
            available: true,
            label: "Runtime check unavailable · retry with Run",
            detail:
              "Could not reach the execution service. Run retries the connection; code is sent only when you run it.",
          });
      });
    return () => {
      active = false;
    };
  }, [language]);
  const runtimeAvailable = runtime.language === language && runtime.available;
  const runCommand = useRef<() => void>(() => {});
  runCommand.current = () => {
    if (
      !isRunning &&
      runtimeAvailable &&
      !document.querySelector("dialog[open]")
    )
      onRunCode();
  };
  const testsCount = executionResult?.testResults?.length || 0;
  const passedTests =
    executionResult?.testResults?.filter((t) => t.passed).length || 0;
  const failed =
    executionResult &&
    (executionResult.exitCode !== 0 ||
      !!executionResult.error ||
      !!executionResult.testResults?.some((test) => !test.passed));
  useEffect(() => {
    resetFocus.current = false;
    setConfirmReset(false);
    setResetUndo(null);
    setActiveBottomTab("console");
    setOutputOpen(false);
  }, [milestoneId, language]);
  useEffect(() => {
    if (isRunning) {
      executedCode.current = code;
      setOutputOpen(true);
      setActiveBottomTab("console");
    }
    if (executionResult) {
      setOutputOpen(true);
      setActiveBottomTab(
        executionResult.testResults?.length && !failed ? "tests" : "console"
      );
    }
  }, [executionResult, isRunning]);
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        editorShortcutApplies(
          e,
          !!paneRef.current?.contains(document.activeElement),
          !!document.querySelector("dialog[open]")
        )
      ) {
        e.preventDefault();
        if (!isRunning && runtimeAvailable) onRunCode();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onRunCode, isRunning, runtimeAvailable]);
  return (
    <section
      className="editor-pane workspace-panel"
      ref={paneRef}
      aria-label="Code workspace"
    >
      <div className="editor-toolbar">
        <span className="editor-heading">
          <Code2 size={16} />
          Code workspace
        </span>
        <div className="editor-actions">
          {onClose && (
            <button
              className="icon-button"
              onClick={onClose}
              aria-label="Close code workspace"
            >
              <X size={15} />
            </button>
          )}
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
              <button
                onClick={() => setConfirmReset(false)}
                aria-label="Cancel reset"
              >
                <X size={15} />
              </button>
            </div>
          ) : resetUndo !== null ? (
            <button
              ref={undoRef}
              className="reset-button undo-reset"
              onClick={() => {
                resetFocus.current = true;
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
                ? `Run code (⌘ Enter / Ctrl Enter). ${runtime.detail}`
                : runtime.detail
            }
          >
            {isRunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
            <span>{isRunning ? "Running…" : "Run code"}</span>
            <kbd>⌘ ↵</kbd>
          </button>
        </div>
      </div>
      <div className="editor-filebar">
        <span className="editor-file">
          <span className="file-language-icon">
            {(
              {
                go: "GO",
                golang: "GO",
                python: "PY",
                py: "PY",
                rust: "RS",
                rs: "RS",
                javascript: "JS",
                js: "JS",
                typescript: "TS",
                ts: "TS",
                cpp: "C++",
                "c++": "C++",
                csharp: "C#",
                sql: "SQL",
              } as Record<string, string>
            )[language] ?? language.toUpperCase().slice(0, 4)}
          </span>
          {fileNames[language] ??
            `main.${language.replace(/[^a-z0-9]/gi, "") || "txt"}`}
          <span
            className="file-saved-dot"
            title={
              draftStatus === "saved"
                ? "Saved on this device"
                : draftStatus === "saving"
                ? "Saving changes"
                : "In-memory draft"
            }
          />
        </span>
        <span className="file-language-label">
          {languageNames[language] || language}
        </span>
      </div>
      <div className="monaco-container">
        <Editor
          height="100%"
          language={getMonacoLanguage(language)}
          value={code}
          onChange={(value) => {
            resetFocus.current = false;
            setResetUndo(null);
            onChangeCode(value || "");
          }}
          theme="learnforge"
          onMount={(editor, monaco) => {
            editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
              () => runCommand.current()
            );
            // Monaco caches character widths; remeasure after the bundled font loads.
            void document.fonts
              .load('13px "Google Sans Code"')
              .then(() => {
                if (editor.getDomNode()?.isConnected)
                  monaco.editor.remeasureFonts();
              })
              .catch(() => {
                /* The configured monospace fallback remains usable. */
              });
          }}
          beforeMount={(monaco) =>
            monaco.editor.defineTheme("learnforge", {
              base: "vs-dark",
              inherit: true,
              rules: [
                { token: "comment", foreground: "788279", fontStyle: "italic" },
                { token: "keyword", foreground: "C8A4DB" },
                { token: "string", foreground: "B9CA91" },
                { token: "number", foreground: "E6B986" },
              ],
              colors: {
                "editor.background": "#17191C",
                "editor.foreground": "#D9DDE3",
                "editorLineNumber.foreground": "#636A74",
                "editorLineNumber.activeForeground": "#BDC3CC",
                "editor.lineHighlightBackground": "#FFFFFF04",
                "editor.selectionBackground": "#E8AD6830",
                "editorCursor.foreground": "#E8AD68",
                "editorIndentGuide.background1": "#FFFFFF0B",
              },
            })
          }
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 22,
            fontFamily: "'Google Sans Code', monospace",
            tabSize: 4,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 18, bottom: 18 },
            renderLineHighlight: "gutter",
            cursorBlinking: reducedMotion ? "solid" : "smooth",
            smoothScrolling: !reducedMotion,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            wordWrap: "on",
            lineNumbersMinChars: 3,
            folding: true,
            contextmenu: true,
            ariaLabel: `${languageNames[language] || language} code editor`,
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
            className={`tiny-dot ${
              isRunning || draftStatus === "saving" ? "running-dot" : ""
            }`}
          />
          {isRunning
            ? "Executing code"
            : draftStatus === "saving"
            ? "Saving changes…"
            : draftStatus === "saved"
            ? "Saved on this device"
            : "Device storage unavailable"}
        </span>
        <span title={runtime.detail} aria-live="polite">
          {runtime.language === language ? runtime.label : "Checking runtime…"}
        </span>
      </div>
      <p className="editor-runtime-note">{runtime.detail}</p>
      <div className={`output-section ${outputOpen ? "is-open" : ""}`}>
        <div className="output-tabs">
          <div
            role="tablist"
            aria-label="Code output"
            onKeyDown={handleTabNavigation}
          >
            <button
              role="tab"
              id="console-tab"
              aria-selected={activeBottomTab === "console"}
              tabIndex={activeBottomTab === "console" ? 0 : -1}
              aria-controls="console-panel"
              onClick={() => {
                setActiveBottomTab("console");
                setOutputOpen(true);
              }}
            >
              <Terminal size={14} />
              Output{failed && <span className="output-error-dot" />}
            </button>
            <button
              role="tab"
              id="tests-tab"
              aria-selected={activeBottomTab === "tests"}
              tabIndex={activeBottomTab === "tests" ? 0 : -1}
              aria-controls="tests-panel"
              onClick={() => {
                setActiveBottomTab("tests");
                setOutputOpen(true);
              }}
            >
              <CheckCircle2 size={14} />
              Tests
              {testsCount > 0 && (
                <span
                  className={`test-count ${
                    passedTests === testsCount ? "passing" : ""
                  }`}
                >
                  {passedTests}/{testsCount}
                </span>
              )}
            </button>
          </div>
          <button
            className="icon-button"
            onClick={() => setOutputOpen((v) => !v)}
            aria-label={outputOpen ? "Collapse output" : "Expand output"}
            aria-expanded={outputOpen}
          >
            {outputOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
        {outputOpen && resultIsStale && (
          <p className="editor-stale-results" role="status">
            Code changed since this run. Run again to check the current version.
          </p>
        )}
        {outputOpen && (
          <div
            className="output-content"
            role="tabpanel"
            tabIndex={0}
            id={activeBottomTab === "console" ? "console-panel" : "tests-panel"}
            aria-labelledby={
              activeBottomTab === "console" ? "console-tab" : "tests-tab"
            }
          >
            {activeBottomTab === "console" ? (
              <OutputConsole
                stdout={executionResult?.stdout || ""}
                stderr={executionResult?.stderr || executionResult?.error || ""}
                durationMs={executionResult?.durationMs}
                exitCode={executionResult?.exitCode}
                onClear={() => {
                  onClearConsole();
                  requestAnimationFrame(() =>
                    paneRef.current
                      ?.querySelector<HTMLButtonElement>("#console-tab")
                      ?.focus()
                  );
                }}
                isRunning={isRunning}
                canRun={runtimeAvailable}
                errorGuidance={
                  executionResult?.exitCode !== 0
                    ? "Execution stopped with error. Review the compiler/runtime output below, update the code, and run again."
                    : undefined
                }
              />
            ) : (
              <TestResultsPanel
                testResults={executionResult?.testResults || []}
                isRunning={isRunning}
                canRun={runtimeAvailable}
                hasRun={executionResult !== null}
                onNextMilestone={
                  canAdvance && !resultIsStale ? onNextMilestone : undefined
                }
              />
            )}
          </div>
        )}
      </div>
      <span className="sr-only" role="status">
        {isRunning
          ? "Running code"
          : executionResult
          ? failed
            ? "Execution failed. See output for details."
            : testsCount
            ? `${passedTests} of ${testsCount} tests passed.`
            : "Execution complete."
          : ""}
      </span>
    </section>
  );
};
