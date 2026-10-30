import React, { useEffect, useRef, useState } from "react";
import { connectionDraftError } from "./validation";
import {
  Blocks,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  RefreshCw,
  Sliders,
  X,
  XCircle,
} from "lucide-react";
import {
  PROVIDER_PRESETS,
  connectionFromPreset,
  fetchProviderModels,
  getChatGptCodexStatus,
  loadAIConnection,
  logoutChatGptCodex,
  presetFor,
  readUsage,
  resetUsage,
  saveAIConnection,
  startChatGptCodexLogin,
  submitChatGptCodexCallback,
  testAIConnection,
  subscriptionBridgeAvailable,
  SUBSCRIPTION_BRIDGE_NOTICE,
  type AIConnection,
  type ChatGptCodexStatus,
  type ModelOption,
  type ProviderId,
} from "../../services/ai/connection";

import {
  DEFAULT_LEARNING_PREFERENCES,
  loadLearningPreferences,
  saveLearningPreferences,
  type LearningPreferences,
} from "../../services/learning/preferences";
import {
  clearConceptLedger,
  importNotesIntoLedger,
  loadConceptLedger,
} from "../../services/learning/conceptLedger";
import {
  PLUGIN_MANIFESTS,
  countActivePlugins,
  isExaPluginReady,
  loadPluginsState,
  savePluginsState,
  type ExaPluginConfig,
  type ExaSearchType,
  type PluginsState,
} from "../../services/plugins/registry";
import { testExaConnection } from "../../services/plugins/exa";

interface SettingsModalProps {
  initialSection?: "learning" | "connection" | "plugins";
  onClose: () => void;
}

const formatTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
    ? `${(n / 1000).toFixed(1)}k`
    : String(n);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  initialSection = "learning",
}) => {
  const [section, setSection] = useState(initialSection);
  const [learning, setLearning] = useState(loadLearningPreferences);
  const [ledger, setLedger] = useState(loadConceptLedger);
  const [ledgerStatus, setLedgerStatus] = useState("");
  const notesFileRef = useRef<HTMLInputElement>(null);
  const [saveError, setSaveError] = useState("");
  const setPreference = (patch: Partial<LearningPreferences>) =>
    setLearning((p) => ({ ...p, ...patch }));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(false),
    connectionVersion = useRef(0),
    testRequest = useRef(0),
    exaTestRequest = useRef(0),
    modelRequest = useRef(0);
  const loginPoll = useRef<number | null>(null);
  const initialConnection = useRef(loadAIConnection());
  const [modelListStatus, setModelListStatus] = useState("");
  const stopLoginPoll = () => {
    if (loginPoll.current !== null) window.clearInterval(loginPoll.current);
    loginPoll.current = null;
  };
  const [draft, setDraft] = useState<AIConnection>(() => loadAIConnection());
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<
    | { kind: "idle" }
    | { kind: "testing" }
    | { kind: "ok"; model: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [pluginsDraft, setPluginsDraft] = useState<PluginsState>(() =>
    loadPluginsState()
  );
  const [showExaKey, setShowExaKey] = useState(false);
  const [exaTestState, setExaTestState] = useState<
    | { kind: "idle" }
    | { kind: "testing" }
    | { kind: "ok"; latencyMs: number; sampleTitle: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [usage, setUsage] = useState(() => readUsage());

  const preset = presetFor(draft.provider);
  const bridgeAvailable = subscriptionBridgeAvailable();
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(
    () => preset.models
  );
  const [loadingModels, setLoadingModels] = useState(false);
  const [customMainModel, setCustomMainModel] = useState(false);
  const [customFallbackModel, setCustomFallbackModel] = useState(false);

  // ChatGPT / Codex OAuth state
  const [codexStatus, setCodexStatus] = useState<ChatGptCodexStatus>({
    authenticated: false,
  });
  const [codexBusy, setCodexBusy] = useState(false);
  const [codexError, setCodexError] = useState("");
  const [manualCallbackInput, setManualCallbackInput] = useState("");
  const [signInUrl, setSignInUrl] = useState("");

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      mounted.current = false;
      connectionVersion.current += 1;
      testRequest.current += 1;
      exaTestRequest.current += 1;
      modelRequest.current += 1;
      stopLoginPoll();
      dialog?.close();
      previous?.isConnected && previous.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const version = connectionVersion.current;
    setModelOptions(presetFor(draft.provider).models);
    setCustomMainModel(false);
    setCustomFallbackModel(false);
    setShowKey(false);
    setCodexError("");
    if (draft.provider === "chatgpt-codex") {
      void getChatGptCodexStatus()
        .then(async (status) => {
          if (!active || version !== connectionVersion.current) return;
          setCodexStatus(status);
          if (status.authenticated) {
            const list = await fetchProviderModels(draft);
            if (!active || version !== connectionVersion.current) return;
            if (list.length) setModelOptions(list);
          }
        })
        .catch(() => {
          if (active)
            setCodexError("Sign-in status could not be checked. Try again.");
        });
    }
    return () => {
      active = false;
      stopLoginPoll();
    };
  }, [draft.provider]);

  const update = (patch: Partial<AIConnection>) => {
    connectionVersion.current += 1;
    testRequest.current += 1;
    modelRequest.current += 1;
    stopLoginPoll();
    setCodexBusy(false);
    setSignInUrl("");
    setLoadingModels(false);
    setModelListStatus("");
    setSaveError("");
    setDraft((d) => ({ ...d, ...patch }));
    setTestState({ kind: "idle" });
  };

  const chooseProvider = (id: ProviderId) => {
    setShowKey(false);
    const saved = loadAIConnection();
    update(connectionFromPreset(id, saved.provider === id ? saved.apiKey : ""));
    setManualCallbackInput("");
  };

  const refreshModels = async () => {
    const request = ++modelRequest.current,
      version = connectionVersion.current;
    setLoadingModels(true);
    setModelListStatus("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const list = await Promise.race([
        fetchProviderModels(draft),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Model discovery timed out.")),
            15000
          );
        }),
      ]);
      if (
        !mounted.current ||
        request !== modelRequest.current ||
        version !== connectionVersion.current
      )
        return;
      setModelOptions(list);
      setModelListStatus(
        list.length
          ? "Model options are ready. Enter a model ID if yours is missing."
          : "No model options returned. Enter a model ID below."
      );
    } catch {
      if (
        mounted.current &&
        request === modelRequest.current &&
        version === connectionVersion.current
      )
        setModelListStatus(
          "Model options could not be refreshed. You can keep the current model or enter its ID."
        );
    } finally {
      if (timer) clearTimeout(timer);
      if (mounted.current && request === modelRequest.current)
        setLoadingModels(false);
    }
  };

  const handleStartCodexLogin = async () => {
    const version = connectionVersion.current;
    stopLoginPoll();
    setCodexBusy(true);
    setCodexError("");
    try {
      const { authUrl } = await startChatGptCodexLogin();
      if (!mounted.current || version !== connectionVersion.current) return;
      setSignInUrl(authUrl);
      window.open(authUrl, "_blank", "noopener,noreferrer");
      let attempts = 0,
        checking = false;
      loginPoll.current = window.setInterval(async () => {
        if (checking) return;
        checking = true;
        attempts += 1;
        try {
          const status = await getChatGptCodexStatus();
          if (!mounted.current || version !== connectionVersion.current) {
            stopLoginPoll();
            return;
          }
          if (status.authenticated) {
            stopLoginPoll();
            setCodexStatus(status);
            setCodexBusy(false);
          } else if (attempts >= 40) {
            stopLoginPoll();
            setCodexBusy(false);
            setCodexError(
              "Sign-in has not completed yet. Try signing in again or use the callback option."
            );
          }
        } catch {
          if (mounted.current && version === connectionVersion.current) {
            stopLoginPoll();
            setCodexBusy(false);
            setCodexError("Sign-in status could not be checked. Try again.");
          }
        } finally {
          checking = false;
        }
      }, 1500);
    } catch (err) {
      if (mounted.current && version === connectionVersion.current) {
        setCodexError((err as Error).message || "Could not start sign-in.");
        setCodexBusy(false);
      }
    }
  };

  const handleManualCodexCallback = async () => {
    if (!manualCallbackInput.trim()) return;
    const version = connectionVersion.current;
    stopLoginPoll();
    setCodexBusy(true);
    setCodexError("");
    try {
      const status = await submitChatGptCodexCallback(manualCallbackInput);
      if (!mounted.current || version !== connectionVersion.current) return;
      setCodexStatus(status);
      setManualCallbackInput("");
    } catch (err) {
      if (mounted.current && version === connectionVersion.current)
        setCodexError((err as Error).message || "Sign-in failed.");
    } finally {
      if (mounted.current && version === connectionVersion.current)
        setCodexBusy(false);
    }
  };

  const handleCodexLogout = async () => {
    const version = connectionVersion.current;
    stopLoginPoll();
    setCodexBusy(true);
    try {
      await logoutChatGptCodex();
      if (mounted.current && version === connectionVersion.current)
        setCodexStatus({ authenticated: false });
    } catch {
      if (mounted.current && version === connectionVersion.current)
        setCodexError("Could not sign out. Try again.");
    } finally {
      if (mounted.current && version === connectionVersion.current)
        setCodexBusy(false);
    }
  };

  const runTest = async () => {
    const request = ++testRequest.current,
      version = connectionVersion.current;
    setTestState({ kind: "testing" });
    try {
      const model = await testAIConnection(draft);
      if (
        !mounted.current ||
        request !== testRequest.current ||
        version !== connectionVersion.current
      )
        return;
      if (model && model !== draft.model) setDraft((d) => ({ ...d, model }));
      setTestState({ kind: "ok", model });
      setUsage(readUsage());
    } catch (err) {
      if (
        mounted.current &&
        request === testRequest.current &&
        version === connectionVersion.current
      )
        setTestState({
          kind: "error",
          message: (err as Error)?.message || "Connection failed.",
        });
    }
  };

  const updateExa = (patch: Partial<ExaPluginConfig>) => {
    exaTestRequest.current += 1;
    setExaTestState({ kind: "idle" });
    setSaveError("");
    setPluginsDraft((prev) => ({
      ...prev,
      exa: { ...prev.exa, ...patch },
    }));
  };

  const runExaTest = async () => {
    const request = ++exaTestRequest.current;
    setExaTestState({ kind: "testing" });
    try {
      const result = await testExaConnection(pluginsDraft.exa.apiKey);
      if (!mounted.current || request !== exaTestRequest.current) return;
      setExaTestState({
        kind: "ok",
        latencyMs: result.latencyMs,
        sampleTitle: result.sampleTitle,
      });
    } catch (err) {
      if (!mounted.current || request !== exaTestRequest.current) return;
      setExaTestState({
        kind: "error",
        message: (err as Error)?.message || "Exa connection failed.",
      });
    }
  };

  const showSaveError = (
    message: string,
    targetSection?: "connection" | "plugins"
  ) => {
    setSaveError(message);
    if (targetSection) setSection(targetSection);
    requestAnimationFrame(() => {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: "nearest" });
    });
  };
  const save = () => {
    if (draft.provider === "chatgpt-codex" && !bridgeAvailable) {
      showSaveError(SUBSCRIPTION_BRIDGE_NOTICE, "connection");
      return;
    }
    if (JSON.stringify(draft) !== JSON.stringify(initialConnection.current)) {
      const issue = connectionDraftError(draft, bridgeAvailable);
      if (issue) {
        showSaveError(issue, "connection");
        return;
      }
    }
    if (pluginsDraft.exa.enabled && !pluginsDraft.exa.apiKey.trim()) {
      showSaveError(
        "Paste your Exa API key or turn off Exa Neural Search before saving.",
        "plugins"
      );
      return;
    }

    const previousLearning = loadLearningPreferences();
    const previousPlugins = loadPluginsState();
    let preferencesSaved = false;
    let pluginsSaved = false;
    try {
      saveLearningPreferences(learning);
      preferencesSaved = true;
      savePluginsState({
        ...pluginsDraft,
        exa: {
          ...pluginsDraft.exa,
          apiKey: pluginsDraft.exa.apiKey.trim(),
        },
      });
      pluginsSaved = true;
      saveAIConnection({
        ...draft,
        url: draft.url.trim(),
        model: draft.model.trim(),
        fallbackModel: draft.fallbackModel.trim(),
        apiKey: draft.apiKey.trim(),
      });
      onClose();
    } catch {
      if (pluginsSaved) {
        try {
          savePluginsState(previousPlugins);
        } catch {}
      }
      if (preferencesSaved) {
        try {
          saveLearningPreferences(previousLearning);
        } catch {}
      }
      showSaveError(
        "Settings could not be saved on this device. Please try again."
      );
    }
  };

  const totalTokens = usage.prompt + usage.completion;
  const activePluginCount = countActivePlugins(pluginsDraft);
  const exaManifest = PLUGIN_MANIFESTS[0];
  const exaReady = isExaPluginReady(pluginsDraft.exa);

  // Ensure current draft model is always selectable in dropdown
  const mergedMainOptions: ModelOption[] = [...modelOptions];
  if (
    draft.model &&
    !mergedMainOptions.some((m) => m.id === draft.model) &&
    !customMainModel
  ) {
    mergedMainOptions.unshift({
      id: draft.model,
      label: `${draft.model} (current)`,
    });
  }
  const mergedFallbackOptions: ModelOption[] = [...modelOptions];
  if (
    draft.fallbackModel &&
    !mergedFallbackOptions.some((m) => m.id === draft.fallbackModel) &&
    !customFallbackModel
  ) {
    mergedFallbackOptions.unshift({
      id: draft.fallbackModel,
      label: `${draft.fallbackModel} (current)`,
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="review-dialog settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <div>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </header>
        <nav className="settings-sections" aria-label="Settings sections">
          <button
            type="button"
            aria-pressed={section === "learning"}
            onClick={() => setSection("learning")}
          >
            <Sliders size={14} />
            <span>Learning</span>
          </button>
          <button
            type="button"
            aria-pressed={section === "connection"}
            onClick={() => setSection("connection")}
          >
            <Cpu size={14} />
            <span>AI connection</span>
          </button>
          <button
            type="button"
            aria-pressed={section === "plugins"}
            onClick={() => setSection("plugins")}
          >
            <Blocks size={14} />
            <span>Plugins</span>
            {activePluginCount > 0 && (
              <small
                className="settings-nav-badge"
                aria-label={`${activePluginCount} active`}
              >
                {activePluginCount}
              </small>
            )}
          </button>
        </nav>
        <div className="settings-content" key={section}>
          {section === "learning" ? (
            <>
              <p className="settings-intro">
                Customize how LearnForge explains concepts, paces lessons, and
                renders visuals. Saved locally and applied to every session.
              </p>

              <div className="settings-group">
                <span className="settings-group-label">
                  Visual explanations
                </span>
                <div className="settings-option-grid cols-3">
                  {[
                    {
                      value: "auto",
                      title: "Auto",
                      desc: "When they clarify the idea",
                    },
                    {
                      value: "ask",
                      title: "When I ask",
                      desc: "Only on request",
                    },
                    {
                      value: "text",
                      title: "Text first",
                      desc: "Prioritize prose",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`settings-choice-card ${
                        learning.visuals === opt.value ? "is-active" : ""
                      }`}
                      aria-pressed={learning.visuals === opt.value}
                      onClick={() =>
                        setPreference({
                          visuals: opt.value as LearningPreferences["visuals"],
                        })
                      }
                    >
                      <strong>{opt.title}</strong>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group">
                <label className="retention-setting">
                  <input
                    type="checkbox"
                    checked={learning.retention}
                    onChange={(event) =>
                      setPreference({ retention: event.target.checked })
                    }
                  />
                  Offer a quick revisit in later sessions
                </label>
                <p className="written-grading-note">
                  Optional and off by default. Offers one earlier idea within
                  the same topic, without a review modal. You can always
                  continue your current lesson.
                </p>
              </div>

              <div className="settings-group">
                <span className="settings-group-label">Explanation depth</span>
                <div className="settings-option-grid cols-2">
                  {[
                    {
                      value: "brief",
                      title: "Brief & focused",
                      desc: "One idea and a concrete example",
                    },
                    {
                      value: "deeper",
                      title: "Deeper detail",
                      desc: "Explore reasoning, examples and exceptions",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`settings-choice-card ${
                        learning.detail === opt.value ? "is-active" : ""
                      }`}
                      aria-pressed={learning.detail === opt.value}
                      onClick={() =>
                        setPreference({
                          detail: opt.value as LearningPreferences["detail"],
                        })
                      }
                    >
                      <strong>{opt.title}</strong>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group">
                <span className="settings-group-label">Lesson pace</span>
                <div className="settings-option-grid cols-2">
                  {[
                    {
                      value: "steps",
                      title: "One step at a time",
                      desc: "Move through short sections at your pace",
                    },
                    {
                      value: "overview",
                      title: "Full overview",
                      desc: "Show the complete explanation at once",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`settings-choice-card ${
                        learning.pace === opt.value ? "is-active" : ""
                      }`}
                      aria-pressed={learning.pace === opt.value}
                      onClick={() =>
                        setPreference({
                          pace: opt.value as LearningPreferences["pace"],
                        })
                      }
                    >
                      <strong>{opt.title}</strong>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
              </div>

              <label className="settings-field">
                <span>
                  Familiar examples <small>· optional</small>
                </span>
                <input
                  value={learning.examples}
                  maxLength={240}
                  placeholder="e.g. architecture, product design, medicine, football"
                  onChange={(e) => setPreference({ examples: e.target.value })}
                />
                <small className="settings-field-hint">
                  Analogies draw on your domain while keeping the core subject
                  rigorous.
                </small>
              </label>

              <div className="settings-group settings-ledger-group">
                <span className="settings-group-label">
                  Cross-topic prior knowledge
                </span>
                <p className="written-grading-note">
                  {ledger.length === 0
                    ? "Demonstrated concepts from completed units are remembered across topics so new curricula skip redundant basics. You can also import Markdown study notes."
                    : `${ledger.length} ${
                        ledger.length === 1 ? "concept" : "concepts"
                      } stored locally across sessions to calibrate new curricula and analogies.`}
                </p>
                <input
                  ref={notesFileRef}
                  type="file"
                  hidden
                  accept=".md,.txt"
                  aria-label="Import Markdown study notes"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void file.text().then((text) => {
                      const added = importNotesIntoLedger(file.name, text);
                      setLedger(loadConceptLedger());
                      setLedgerStatus(
                        added > 0
                          ? `Imported ${added} ${
                              added === 1 ? "concept" : "concepts"
                            } from ${file.name}.`
                          : `No structured headings or bullet takeaways found in ${file.name}.`
                      );
                    });
                  }}
                />
                <div className="settings-ledger-actions">
                  <button
                    type="button"
                    className="check-coach-button"
                    onClick={() => notesFileRef.current?.click()}
                  >
                    Import notes (.md)
                  </button>
                  {ledger.length > 0 && (
                    <button
                      type="button"
                      className="check-coach-button"
                      onClick={() => {
                        clearConceptLedger();
                        setLedger([]);
                        setLedgerStatus("Cleared prior knowledge ledger.");
                      }}
                    >
                      Clear ledger
                    </button>
                  )}
                </div>
                {ledgerStatus && (
                  <small className="settings-field-hint" role="status">
                    {ledgerStatus}
                  </small>
                )}
              </div>

              <div className="settings-reset-row">
                <button
                  type="button"
                  className="check-coach-button"
                  onClick={() =>
                    setLearning({ ...DEFAULT_LEARNING_PREFERENCES })
                  }
                >
                  Reset learning preferences
                </button>
              </div>
            </>
          ) : section === "plugins" ? (
            <>
              <p className="settings-intro">
                Extend LearnForge with local-first learning plugins. Keys stay
                on this device and feed cited primary documentation into new
                curricula and focused lessons.
              </p>

              <section
                className={`settings-plugin-card ${
                  exaReady ? "is-ready" : ""
                }`}
                aria-label={exaManifest.name}
              >
                <div className="settings-plugin-header">
                  <div>
                    <div className="settings-plugin-title-row">
                      <strong>{exaManifest.name}</strong>
                      <span
                        className={`codex-status-pill ${
                          exaReady ? "is-connected" : ""
                        }`}
                      >
                        {exaReady ? (
                          <>
                            <CheckCircle2 size={12} /> Active
                          </>
                        ) : pluginsDraft.exa.enabled ? (
                          "Needs API key"
                        ) : (
                          "Off"
                        )}
                      </span>
                    </div>
                    <small className="settings-plugin-tagline">
                      {exaManifest.tagline}
                    </small>
                  </div>
                  <label className="settings-plugin-switch">
                    <input
                      type="checkbox"
                      checked={pluginsDraft.exa.enabled}
                      onChange={(e) =>
                        updateExa({ enabled: e.target.checked })
                      }
                    />
                    <span>
                      {pluginsDraft.exa.enabled ? "Enabled" : "Enable"}
                    </span>
                  </label>
                </div>

                <p className="settings-plugin-desc">
                  {exaManifest.description}
                </p>

                <div className="settings-plugin-caps">
                  <span>Live topic grounding (/search)</span>
                  <span>Clean URL &amp; paper reader (/contents)</span>
                  <a
                    href={exaManifest.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="settings-inline-link"
                  >
                    Docs <ExternalLink size={11} />
                  </a>
                </div>

                <label className="settings-field">
                  <span className="settings-field-label-row">
                    <span>Exa API key</span>
                    <a
                      href={exaManifest.keyPortalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="settings-inline-link"
                    >
                      dashboard.exa.ai <ExternalLink size={11} />
                    </a>
                  </span>
                  <div className="settings-key">
                    <input
                      aria-label="Exa API key"
                      type={showExaKey ? "text" : "password"}
                      spellCheck={false}
                      autoComplete="off"
                      value={pluginsDraft.exa.apiKey}
                      placeholder={exaManifest.keyHint}
                      onChange={(e) => {
                        const nextKey = e.target.value;
                        const autoEnable =
                          !pluginsDraft.exa.apiKey.trim() &&
                          Boolean(nextKey.trim());
                        updateExa({
                          apiKey: nextKey,
                          ...(autoEnable ? { enabled: true } : {}),
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setShowExaKey((v) => !v)}
                      aria-label={showExaKey ? "Hide Exa key" : "Show Exa key"}
                      aria-pressed={showExaKey}
                    >
                      {showExaKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <small className="settings-field-hint">
                    Stored locally on this device only. Never sent to code
                    execution or visual sandboxes.
                  </small>
                </label>

                <div className="settings-group">
                  <span className="settings-group-label">Search mode</span>
                  <div className="settings-option-grid cols-3">
                    {(
                      [
                        {
                          value: "auto",
                          title: "Auto",
                          desc: "Blends neural & keyword precision",
                        },
                        {
                          value: "neural",
                          title: "Neural",
                          desc: "Deep semantic docs & papers",
                        },
                        {
                          value: "fast",
                          title: "Fast",
                          desc: "Lowest-latency web lookup",
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`settings-choice-card ${
                          pluginsDraft.exa.searchType === opt.value
                            ? "is-active"
                            : ""
                        }`}
                        aria-pressed={pluginsDraft.exa.searchType === opt.value}
                        onClick={() =>
                          updateExa({
                            searchType: opt.value as ExaSearchType,
                          })
                        }
                      >
                        <strong>{opt.title}</strong>
                        <small>{opt.desc}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <span className="settings-group-label">
                    Sources per grounded topic
                  </span>
                  <div className="settings-option-grid cols-2">
                    {(
                      [
                        {
                          value: 3,
                          title: "3 sources",
                          desc: "Focused, high-signal primary docs",
                        },
                        {
                          value: 5,
                          title: "5 sources",
                          desc: "Broader multi-source synthesis",
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`settings-choice-card ${
                          pluginsDraft.exa.numResults === opt.value
                            ? "is-active"
                            : ""
                        }`}
                        aria-pressed={pluginsDraft.exa.numResults === opt.value}
                        onClick={() => updateExa({ numResults: opt.value })}
                      >
                        <strong>{opt.title}</strong>
                        <small>{opt.desc}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <label className="retention-setting">
                    <input
                      type="checkbox"
                      checked={pluginsDraft.exa.autoGroundNewTopics}
                      onChange={(e) =>
                        updateExa({ autoGroundNewTopics: e.target.checked })
                      }
                    />
                    Pre-select live Exa grounding in New Topic
                  </label>
                  <p className="written-grading-note">
                    You can still toggle Exa grounding on or off per topic, or
                    paste specific URLs to extract clean reference markdown.
                  </p>
                </div>

                <div className="settings-test">
                  <button
                    type="button"
                    className="header-secondary-button"
                    onClick={runExaTest}
                    disabled={
                      exaTestState.kind === "testing" ||
                      !pluginsDraft.exa.apiKey.trim()
                    }
                  >
                    {exaTestState.kind === "testing" && (
                      <Loader2 size={14} className="animate-spin" />
                    )}
                    {exaTestState.kind === "testing"
                      ? "Testing Exa…"
                      : "Test Exa connection"}
                  </button>
                  <span
                    role="status"
                    className={`settings-test-result is-${exaTestState.kind}`}
                  >
                    {exaTestState.kind === "ok" && (
                      <>
                        <CheckCircle2 size={14} /> Connected ·{" "}
                        {exaTestState.latencyMs}ms
                      </>
                    )}
                    {exaTestState.kind === "error" && (
                      <>
                        <XCircle size={14} /> {exaTestState.message}
                      </>
                    )}
                  </span>
                </div>
              </section>
            </>
          ) : (
            <>
              <p className="settings-intro">
                Connect an API-key or local provider. Connection settings and
                credentials are saved locally on this device.
              </p>

              <label className="settings-field">
                <span>Provider</span>
                <select
                  value={draft.provider}
                  onChange={(e) => chooseProvider(e.target.value as ProviderId)}
                >
                  {PROVIDER_PRESETS.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={p.id === "chatgpt-codex" && !bridgeAvailable}
                    >
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              {draft.provider === "chatgpt-codex" && !bridgeAvailable && (
                <div className="continuation-error" role="status">
                  <p>{SUBSCRIPTION_BRIDGE_NOTICE}</p>
                  <button
                    type="button"
                    className="check-coach-button"
                    onClick={() => chooseProvider("proxy")}
                  >
                    Use a local provider
                  </button>
                  <button
                    type="button"
                    className="check-coach-button"
                    onClick={() => chooseProvider("openai")}
                  >
                    Use an OpenAI API key
                  </button>
                </div>
              )}
              {draft.provider === "chatgpt-codex" && bridgeAvailable && (
                <div className="codex-oauth-card">
                  <div className="codex-oauth-header">
                    <div>
                      <strong>ChatGPT / Codex · development only</strong>
                      <p>
                        This experimental bridge runs on the development server.
                        It is not the packaged app’s authentication system.
                      </p>
                    </div>
                    {codexStatus.authenticated ? (
                      <span className="codex-status-pill is-connected">
                        <CheckCircle2 size={13} /> Connected
                        {codexStatus.email ? ` · ${codexStatus.email}` : ""}
                      </span>
                    ) : (
                      <span className="codex-status-pill">Not signed in</span>
                    )}
                  </div>

                  <div className="codex-oauth-actions">
                    {codexStatus.authenticated ? (
                      <button
                        type="button"
                        className="header-secondary-button"
                        onClick={handleCodexLogout}
                        disabled={codexBusy}
                      >
                        <LogOut size={13} />
                        Sign out
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dialog-primary-button"
                        onClick={handleStartCodexLogin}
                        disabled={codexBusy}
                      >
                        {codexBusy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ExternalLink size={14} />
                        )}
                        {codexBusy
                          ? "Waiting for ChatGPT sign-in…"
                          : "Sign in with ChatGPT"}
                      </button>
                    )}
                  </div>

                  {signInUrl && !codexStatus.authenticated && (
                    <p className="written-grading-note">
                      If the sign-in window did not open,{" "}
                      <a
                        href={signInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        open the sign-in page
                      </a>
                      .
                    </p>
                  )}
                  {!codexStatus.authenticated && (
                    <details className="codex-manual-details">
                      <summary>
                        Paste callback URL or token manually (if port 1455 is
                        busy)
                      </summary>
                      <div className="codex-manual-row">
                        <input
                          type="password"
                          aria-label="Callback URL or access token"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="http://localhost:1455/auth/callback?code=… or access token"
                          value={manualCallbackInput}
                          onChange={(e) =>
                            setManualCallbackInput(e.target.value)
                          }
                        />
                        <button
                          type="button"
                          className="header-secondary-button"
                          onClick={handleManualCodexCallback}
                          disabled={codexBusy || !manualCallbackInput.trim()}
                        >
                          Connect
                        </button>
                      </div>
                    </details>
                  )}

                  {codexError && (
                    <p className="codex-oauth-error" role="alert">
                      {codexError}
                    </p>
                  )}
                </div>
              )}

              {(draft.provider === "custom" ||
                draft.provider === "proxy" ||
                draft.provider === "ollama") && (
                <label className="settings-field">
                  <span>Endpoint</span>
                  <input
                    type="url"
                    spellCheck={false}
                    value={draft.url}
                    placeholder="https://…/v1/chat/completions"
                    onChange={(e) => update({ url: e.target.value })}
                  />
                </label>
              )}

              {(preset.needsKey || draft.provider === "custom") && (
                <label className="settings-field">
                  <span>
                    API key{!preset.needsKey && <small> · optional</small>}
                  </span>
                  <div className="settings-key">
                    <input
                      aria-label="API key"
                      type={showKey ? "text" : "password"}
                      spellCheck={false}
                      autoComplete="off"
                      value={draft.apiKey}
                      placeholder={preset.keyHint || "Paste your key"}
                      onChange={(e) => update({ apiKey: e.target.value })}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? "Hide key" : "Show key"}
                      aria-pressed={showKey}
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
              )}

              {(draft.provider !== "chatgpt-codex" || bridgeAvailable) && (
                <>
                  <div className="settings-models-header">
                    <span>Model selection</span>
                    {draft.provider !== "anthropic" && (
                      <button
                        type="button"
                        className="settings-refresh-models"
                        onClick={refreshModels}
                        disabled={loadingModels}
                      >
                        <RefreshCw
                          size={11}
                          className={loadingModels ? "animate-spin" : undefined}
                        />
                        <span>
                          {loadingModels ? "Fetching…" : "Refresh models"}
                        </span>
                      </button>
                    )}
                  </div>

                  {modelListStatus && (
                    <p className="settings-model-status" role="status">
                      {modelListStatus}
                    </p>
                  )}
                  <div className="settings-row">
                    <label className="settings-field">
                      <span>Main model</span>
                      {mergedMainOptions.length > 0 && !customMainModel ? (
                        <select
                          aria-label="Main model"
                          value={draft.model}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              setCustomMainModel(true);
                            } else {
                              update({ model: e.target.value });
                            }
                          }}
                        >
                          {mergedMainOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                          <option value="__custom__">Custom model ID…</option>
                        </select>
                      ) : (
                        <div className="settings-custom-model-row">
                          <input
                            aria-label="Main model"
                            spellCheck={false}
                            placeholder="e.g. gpt-6.1-sol"
                            value={draft.model}
                            onChange={(e) => update({ model: e.target.value })}
                          />
                          {mergedMainOptions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCustomMainModel(false)}
                            >
                              List
                            </button>
                          )}
                        </div>
                      )}
                    </label>

                    <label className="settings-field">
                      <span>Fallback model</span>
                      {mergedFallbackOptions.length > 0 &&
                      !customFallbackModel ? (
                        <select
                          aria-label="Fallback model"
                          value={draft.fallbackModel}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              setCustomFallbackModel(true);
                            } else {
                              update({ fallbackModel: e.target.value });
                            }
                          }}
                        >
                          {mergedFallbackOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                          <option value="__custom__">Custom model ID…</option>
                        </select>
                      ) : (
                        <div className="settings-custom-model-row">
                          <input
                            aria-label="Fallback model"
                            spellCheck={false}
                            placeholder="e.g. gpt-6-astra"
                            value={draft.fallbackModel}
                            onChange={(e) =>
                              update({ fallbackModel: e.target.value })
                            }
                          />
                          {mergedFallbackOptions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCustomFallbackModel(false)}
                            >
                              List
                            </button>
                          )}
                        </div>
                      )}
                    </label>
                  </div>

                  <div className="settings-test">
                    <button
                      type="button"
                      className="header-secondary-button"
                      onClick={runTest}
                      disabled={
                        testState.kind === "testing" ||
                        !draft.url.trim() ||
                        !draft.model.trim()
                      }
                    >
                      {testState.kind === "testing" && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      {testState.kind === "testing"
                        ? "Testing connection…"
                        : "Test connection"}
                    </button>
                    <span
                      role="status"
                      className={`settings-test-result is-${testState.kind}`}
                    >
                      {testState.kind === "ok" && (
                        <>
                          <CheckCircle2 size={14} /> Connected ·{" "}
                          {testState.model}
                        </>
                      )}
                      {testState.kind === "error" && (
                        <>
                          <XCircle size={14} /> {testState.message}
                        </>
                      )}
                    </span>
                  </div>
                </>
              )}
              <div className="settings-usage">
                <span>
                  {usage.estimated ? "≈ " : ""}
                  {formatTokens(totalTokens)} tokens used on this device
                  {totalTokens > 0 && (
                    <small>
                      {" "}
                      ({formatTokens(usage.prompt)} in ·{" "}
                      {formatTokens(usage.completion)} out)
                    </small>
                  )}
                </span>
                {totalTokens > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      resetUsage();
                      setUsage(readUsage());
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {saveError && (
          <p
            className="settings-save-error"
            role="alert"
            ref={errorRef}
            tabIndex={-1}
          >
            {saveError}
          </p>
        )}
        <footer className="manage-topics-footer">
          <button
            type="button"
            className="dialog-secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="dialog-primary-button" onClick={save}>
            Save changes
          </button>
        </footer>
      </div>
    </dialog>
  );
};
