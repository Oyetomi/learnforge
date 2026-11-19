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
  ChevronRight,
  PanelLeft,
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
import { ProjectStepPanel } from "./ProjectStepPanel";
import { ProjectExplorer } from "./ProjectExplorer";
import { ProjectRunLog, ProjectRunReport, runHeadline } from "./ProjectRunReport";
import { profileFor, suggestPath } from "../../services/languages";
import { parseDiagnostics } from "../../services/sandbox/diagnostics";
import { attachLanguageServer, modelPath as projectModelPath, modelUri, type AttachedServer, type ServerStatus } from "./languageServer";
import type { ProjectWorkspaceController } from "./useProjectWorkspace";

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
  /** Project mode: several files carried across lessons, plus the step panel. */
  project?: ProjectWorkspaceController;
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
  project,
}) => {
  const projectMode = !!project?.enabled;
  const runLabel = projectMode && project!.tabs.some((t) => t.readOnly) ? "Run tests" : projectMode ? "Run" : "Run code";
  // The explorer follows the learner's choice; until they choose, it shows
  // only when the pane is wide enough to keep a usable editor beside it.
  const [explorerPref, setExplorerPref] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem("learnforge:explorer-open");
      return v === null ? null : v === "true";
    } catch {
      return null;
    }
  });
  const [paneWidth, setPaneWidth] = useState(1000);
  useEffect(() => {
    const el = paneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setPaneWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const explorerOpen = explorerPref ?? paneWidth >= 600;
  const setExplorerOpen = (update: (open: boolean) => boolean) => {
    const next = update(explorerOpen);
    setExplorerPref(next);
    try {
      localStorage.setItem("learnforge:explorer-open", String(next));
    } catch {
      /* Preference only. */
    }
  };
  const paneRef = useRef<HTMLElement>(null);
  const executedCode = useRef<string | null>(null);
  // In project mode a run covers every file, so compare the whole project.
  const runKey = project?.enabled ? `project:${project.revision}` : code;
  const resultIsStale =
    executionResult !== null &&
    executedCode.current !== null &&
    runKey !== executedCode.current;
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
  const projectRuntime = project?.enabled ? project.runtime : undefined;
  useEffect(() => {
    if (projectRuntime) {
      setRuntime({ language, available: projectRuntime.available, label: projectRuntime.label, detail: projectRuntime.detail });
      return;
    }
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
  }, [language, projectRuntime?.available, projectRuntime?.label, projectRuntime?.detail]);
  const runtimeAvailable = runtime.language === language && runtime.available;
  const runCommand = useRef<() => void>(() => {});
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const [editorReady, setEditorReady] = useState(0);
  // Underline errors from the last run in the files they point to.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const owner = "learnforge-run";
    const singleFile = fileNames[language] ?? `main.${language}`;
    const known = projectMode ? project!.tabs.map((t) => t.path) : [singleFile, "learner.go", "prog.go", "main.go"];
    const output = executionResult
      ? [executionResult.stdout, executionResult.stderr, ...(executionResult.testResults || []).map((t) => t.error || "")].join("\n")
      : "";
    const diagnostics = output ? parseDiagnostics(output, known) : [];
    const modelPathOf = (model: import("monaco-editor").editor.ITextModel) =>
      projectMode
        ? projectModelPath(model.uri, project!.trackId)
        : model === editorRef.current?.getModel() ? singleFile : undefined;
    for (const model of monaco.editor.getModels()) {
      const path = modelPathOf(model);
      const own = diagnostics.filter((d) =>
        projectMode ? d.path === path : path !== undefined && d.path !== "prog.go"
      );
      monaco.editor.setModelMarkers(
        model,
        owner,
        own.map((d) => {
          const line = Math.min(d.line, model.getLineCount());
          return {
            severity: d.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
            message: d.message,
            startLineNumber: line,
            startColumn: d.column ?? model.getLineFirstNonWhitespaceColumn(line) ?? 1,
            endLineNumber: line,
            endColumn: model.getLineMaxColumn(line),
            source: "Run",
          };
        })
      );
    }
  }, [executionResult, project?.activePath, editorReady, language, projectMode]);

  // Project mode: one Monaco model per file, so rename, go-to-definition and
  // diagnostics work across files. The active model is driven by `code`; the
  // others follow the workspace, and edits made to them (rename) flow back.
  const profile = projectMode ? profileFor(project!.language) : undefined;
  const modelListeners = useRef(new Map<string, { dispose(): void }>());
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !projectMode || !profile) return;
    const trackId = project!.trackId;
    const wanted = new Set<string>();
    for (const f of project!.allFiles) {
      const uri = modelUri(monaco as any, trackId, f.path);
      wanted.add(uri.toString());
      let model = monaco.editor.getModel(uri as any);
      if (!model) model = monaco.editor.createModel(f.content, profile.monaco, uri as any);
      else if (model !== editorRef.current?.getModel() && model.getValue() !== f.content) model.setValue(f.content);
      if (!f.readOnly && !modelListeners.current.has(uri.toString())) {
        const m = model;
        modelListeners.current.set(
          uri.toString(),
          m.onDidChangeContent(() => {
            if (m !== editorRef.current?.getModel()) projectRef.current?.updatePath(f.path, m.getValue());
          })
        );
      }
    }
    for (const model of monaco.editor.getModels()) {
      const key = model.uri.toString();
      if (projectModelPath(model.uri as any, trackId) && !wanted.has(key) && model !== editorRef.current?.getModel()) {
        modelListeners.current.get(key)?.dispose();
        modelListeners.current.delete(key);
        model.dispose();
      }
    }
  }, [project?.allFiles, project?.trackId, editorReady, projectMode, profile]);
  useEffect(
    () => () => {
      for (const l of modelListeners.current.values()) l.dispose();
      modelListeners.current.clear();
    },
    []
  );

  // Language server (completion, live errors, hover, definition, rename,
  // formatting) when the project runs locally and a server is installed.
  const [server, setServer] = useState<ServerStatus>({ state: "off" });
  const [serverInfoOpen, setServerInfoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [serverInfoOpen]);
  const serverInfoRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!serverInfoOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !serverInfoRef.current?.contains(e.target as Node))
        setServerInfoOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [serverInfoOpen]);
  const installCommand = server.state === "unavailable" ? profile?.lspInstall || "" : "";
  const serverRef = useRef<AttachedServer | null>(null);
  const localRuntime = projectMode && !!project!.runtime.local;
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !localRuntime || !profile || !project!.loaded) {
      setServer({ state: "off" });
      return;
    }
    if (!profile.lsp.length) {
      setServer({ state: "unavailable", message: `No language server is set up for ${profile.name}.` });
      return;
    }
    const attached = attachLanguageServer(monaco as any, {
      trackId: project!.trackId,
      profile,
      files: project!.allFiles,
      prepare: () => projectRef.current!.syncToDisk(),
      onOpenFile: (path, line, column) => projectRef.current?.openAt(path, line, column),
      onStatus: setServer,
    });
    serverRef.current = attached;
    return () => {
      attached.dispose();
      if (serverRef.current === attached) serverRef.current = null;
    };
  }, [localRuntime, profile, project?.trackId, project?.loaded, editorReady]);
  useEffect(() => {
    if (projectMode) serverRef.current?.sync(project!.allFiles);
  }, [project?.allFiles, projectMode]);

  // Show the location go-to-definition asked for once its file is active.
  useEffect(() => {
    const target = project?.reveal;
    const editor = editorRef.current;
    if (!target || !editor || target.path !== project?.activePath) return;
    const id = requestAnimationFrame(() => {
      editor.revealLineInCenter(target.line);
      editor.setPosition({ lineNumber: target.line, column: target.column });
      editor.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [project?.reveal, project?.activePath]);
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
      executedCode.current = runKey;
      setOutputOpen(true);
      setActiveBottomTab("console");
    }
    if (executionResult) {
      setOutputOpen(true);
      setActiveBottomTab(
        projectMode || (executionResult.testResults?.length && !failed) ? "tests" : "console"
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
                aria-label={projectMode ? "Confirm reset of this file" : "Confirm reset to starter code"}
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
              disabled={isRunning || (projectMode && !project!.canResetActive)}
              onClick={() => {
                resetFocus.current = true;
                setConfirmReset(true);
              }}
              title={projectMode ? "Reset this file to how it was when this step began" : "Reset to starter code"}
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
            <span>{isRunning ? "Running…" : runLabel}</span>
            <kbd>⌘ ↵</kbd>
          </button>
        </div>
      </div>
      {projectMode && <ProjectStepPanel project={project!} isRunning={isRunning} />}
      <div className="editor-filebar">
        {projectMode ? (
          <div className="project-breadcrumb">
            <button
              type="button"
              className="explorer-toggle"
              aria-label={explorerOpen ? "Hide project files" : "Show project files"}
              aria-pressed={explorerOpen}
              title={explorerOpen ? "Hide project files" : "Show project files"}
              onClick={() => setExplorerOpen((v) => !v)}
            >
              <PanelLeft size={14} />
            </button>
            <span className="project-breadcrumb-path" title={project!.activePath}>
              {(project!.activePath || "No files yet").split("/").map((part, i, all) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight size={11} aria-hidden="true" />}
                  <span className={i === all.length - 1 ? "is-file" : ""}>{part}</span>
                </React.Fragment>
              ))}
              {project!.activeReadOnly && <em> · step tests, read-only</em>}
            </span>
          </div>
        ) : (
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
        )}
        <span className="file-language-label">
          {languageNames[language] || language}
        </span>
      </div>
      <div className="editor-body">
      {projectMode && explorerOpen && (
        <ProjectExplorer
          files={project!.tabs}
          activePath={project!.activePath}
          onSelect={project!.selectFile}
          onAdd={(typed) => {
            const p = profileFor(project!.language);
            return project!.addFile(p ? suggestPath(p, typed) : typed);
          }}
          onDelete={project!.removeFile}
          placeholder={(() => {
            const p = profileFor(project!.language);
            return p ? suggestPath(p, p.id === "java" ? "Replication" : "wordcount/main") : "folder/file";
          })()}
          addError={(() => {
            const p = profileFor(project!.language);
            return `Use a new ${p?.name ?? ""} file name, optionally in a folder, such as ${p ? suggestPath(p, p.id === "java" ? "Replication" : "wordcount/main") : "folder/file"}. Test file names are reserved.`;
          })()}
        />
      )}
      <div className="monaco-container">
        <Editor
          height="100%"
          language={getMonacoLanguage(language)}
          {...(projectMode ? { path: `project/${project!.trackId}/${project!.activePath || "empty"}`, keepCurrentModel: true } : {})}
          value={code}
          onChange={(value) => {
            resetFocus.current = false;
            setResetUndo(null);
            onChangeCode(value || "");
          }}
          theme="learnforge"
          onMount={(editor, monaco) => {
            monacoRef.current = monaco as unknown as typeof import("monaco-editor");
            editorRef.current = editor as unknown as import("monaco-editor").editor.IStandaloneCodeEditor;
            setEditorReady((n) => n + 1);
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
            ariaLabel: projectMode
              ? `${project!.activePath || "Project"} ${project!.activeReadOnly ? "(read-only tests)" : ""}`.trim()
              : `${languageNames[language] || language} code editor`,
            readOnly: projectMode && (project!.activeReadOnly || !project!.tabs.length),
          }}
          loading={
            <div className="editor-loading">
              <Loader2 size={18} className="animate-spin" />
              Preparing your editor…
            </div>
          }
        />
      </div>
      </div>
      <div className="editor-statusbar">
        <span role="status" aria-live="polite" className="editor-status-save">
          <span
            className={`tiny-dot ${
              isRunning || draftStatus === "saving" ? "running-dot" : ""
            }`}
          />
          {isRunning
            ? projectMode ? "Running" : "Executing code"
            : draftStatus === "saving"
            ? "Saving…"
            : draftStatus === "saved"
            ? projectMode ? "Saved" : "Saved on this device"
            : "Not saved: device storage unavailable"}
        </span>
        <span className="editor-status-right">
          <span className="editor-status-runtime" title={runtime.detail} aria-live="polite">
            {runtime.language === language ? runtime.label : "Checking runtime…"}
          </span>
          {server.state !== "off" && (
            <span className="editor-intellisense-wrap" ref={serverInfoRef}>
              <button
                type="button"
                className={`editor-intellisense is-${server.state}`}
                aria-expanded={serverInfoOpen}
                aria-controls="editor-intellisense-info"
                onClick={() => setServerInfoOpen((v) => !v)}
              >
                <span className="editor-intellisense-dot" aria-hidden="true" />
                {server.state === "ready" ? server.program : server.state === "starting" ? "Starting IntelliSense…" : "IntelliSense off"}
              </button>
              {serverInfoOpen && (
                <span className="editor-intellisense-info" id="editor-intellisense-info" role="dialog" aria-label="IntelliSense">
                  {server.state === "ready" ? (
                    <>
                      <strong>IntelliSense is on</strong>
                      <small>
                        {server.program} provides completion, live errors and hover. F12 goes to a definition, F2 renames, and
                        ⇧⌥F formats the file.
                      </small>
                    </>
                  ) : server.state === "starting" ? (
                    <strong>Starting the language server…</strong>
                  ) : (
                    <>
                      <strong>No language server</strong>
                      <small>{installCommand ? `Install one for completion, live errors and go to definition, then reopen the code workspace:` : server.message}</small>
                      {installCommand && (
                        <span className="editor-install">
                          <code>{installCommand}</code>
                          <button type="button" onClick={() => { void navigator.clipboard?.writeText(installCommand).then(() => setCopied(true), () => {}); }}>
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </span>
              )}
            </span>
          )}
        </span>
      </div>
      {(!projectMode || !runtime.available) && <p className="editor-runtime-note">{runtime.detail}</p>}
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
              {projectMode ? "Log" : "Output"}{failed && !projectMode && <span className="output-error-dot" />}
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
              {projectMode ? "Results" : "Tests"}
              {projectMode && executionResult?.stepRuns?.length ? (
                <span className={`test-count ${executionResult.stepRuns.every((r) => r.passed) ? "passing" : ""}`}>
                  {executionResult.stepRuns.filter((r) => r.passed).length}/{executionResult.stepRuns.length}
                </span>
              ) : projectMode && failed ? (
                <span className="output-error-dot" />
              ) : null}
              {!projectMode && testsCount > 0 && (
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
            {projectMode ? (
              activeBottomTab === "console" ? (
                <ProjectRunLog result={executionResult} isRunning={isRunning} />
              ) : (
                <ProjectRunReport
                  result={executionResult}
                  isRunning={isRunning}
                  canRun={runtimeAvailable}
                  currentStep={project!.stage?.number}
                  known={project!.tabs.map((t) => t.path)}
                  runLabel={runLabel}
                  onOpen={(path, line, column) => project!.openAt(path, line, column ?? 1)}
                  onClear={onClearConsole}
                />
              )
            ) : activeBottomTab === "console" ? (
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
          : executionResult && projectMode
          ? (({ title, detail }) => `${title}. ${detail ?? ""}`)(runHeadline(executionResult, project!.stage?.number))
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
