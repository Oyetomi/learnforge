import React, { useEffect, useRef, useState } from "react";
import {
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

interface SettingsModalProps {
  initialSection?: "learning" | "connection";
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
  const [saveError, setSaveError] = useState("");
  const setPreference = (patch: Partial<LearningPreferences>) =>
    setLearning((p) => ({ ...p, ...patch }));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<AIConnection>(() => loadAIConnection());
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<
    | { kind: "idle" }
    | { kind: "testing" }
    | { kind: "ok"; model: string }
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

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.isConnected && previous.focus();
    };
  }, []);

  useEffect(() => {
    setModelOptions(presetFor(draft.provider).models);
    setCustomMainModel(false);
    setCustomFallbackModel(false);
    if (draft.provider === "chatgpt-codex") {
      getChatGptCodexStatus().then((status) => {
        setCodexStatus(status);
        if (status.authenticated) {
          fetchProviderModels(draft).then((list) => {
            if (list.length > 0) {
              setModelOptions(list);
              if (!list.some((m) => m.id === draft.model)) {
                setDraft((d) => ({
                  ...d,
                  model: list[0].id,
                  fallbackModel: list[1]?.id || list[0].id,
                }));
              }
            }
          });
        }
      });
    }
  }, [draft.provider]);

  const update = (patch: Partial<AIConnection>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setTestState({ kind: "idle" });
  };

  const chooseProvider = (id: ProviderId) => {
    const saved = loadAIConnection();
    update(connectionFromPreset(id, saved.provider === id ? saved.apiKey : ""));
  };

  const refreshModels = async () => {
    setLoadingModels(true);
    try {
      const list = await fetchProviderModels(draft);
      setModelOptions(list);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleStartCodexLogin = async () => {
    setCodexBusy(true);
    setCodexError("");
    try {
      const { authUrl } = await startChatGptCodexLogin();
      window.open(authUrl, "_blank", "noopener,noreferrer");
      // Poll for completion for up to 60 seconds
      let attempts = 0;
      const timer = window.setInterval(async () => {
        attempts += 1;
        const status = await getChatGptCodexStatus();
        if (status.authenticated) {
          window.clearInterval(timer);
          setCodexStatus(status);
          setCodexBusy(false);
        } else if (attempts >= 40) {
          window.clearInterval(timer);
          setCodexBusy(false);
        }
      }, 1500);
    } catch (err) {
      setCodexError((err as Error).message || "Could not start sign-in.");
      setCodexBusy(false);
    }
  };

  const handleManualCodexCallback = async () => {
    if (!manualCallbackInput.trim()) return;
    setCodexBusy(true);
    setCodexError("");
    try {
      const status = await submitChatGptCodexCallback(manualCallbackInput);
      setCodexStatus(status);
      setManualCallbackInput("");
    } catch (err) {
      setCodexError((err as Error).message || "Sign-in failed.");
    } finally {
      setCodexBusy(false);
    }
  };

  const handleCodexLogout = async () => {
    await logoutChatGptCodex();
    setCodexStatus({ authenticated: false });
  };

  const runTest = async () => {
    setTestState({ kind: "testing" });
    try {
      const model = await testAIConnection(draft);
      if (model && model !== draft.model) {
        setDraft((d) => ({ ...d, model }));
      }
      setTestState({ kind: "ok", model });
      setUsage(readUsage());
    } catch (err) {
      setTestState({
        kind: "error",
        message: (err as Error)?.message || "Connection failed.",
      });
    }
  };

  const save = () => {
    try {
      if (draft.provider === "chatgpt-codex" && !bridgeAvailable) {
        setSaveError(SUBSCRIPTION_BRIDGE_NOTICE);
        return;
      }
      saveLearningPreferences(learning);
      saveAIConnection(draft);
      onClose();
    } catch {
      setSaveError(
        "Settings could not be saved on this device. Please try again."
      );
    }
  };
  const totalTokens = usage.prompt + usage.completion;

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
                <label className="retention-setting"><input type="checkbox" checked={learning.retention}
                  onChange={(event) => setPreference({ retention: event.target.checked })} />Offer a quick revisit in later sessions</label>
                <p className="written-grading-note">Optional and off by default. Offers one earlier idea within the same topic, without a review modal. You can always continue your current lesson.</p>
              </div>

              <div className="settings-group">
                <span className="settings-group-label">Explanation depth</span>
                <div className="settings-option-grid cols-2">
                  {[
                    {
                      value: "brief",
                      title: "Brief & focused",
                      desc: "Start with one atomic concept and example",
                    },
                    {
                      value: "deeper",
                      title: "Deeper detail",
                      desc: "Include invariants, edge cases & trade-offs",
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
                      desc: "Progressive disclosure across sections",
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
                    <option key={p.id} value={p.id} disabled={p.id === "chatgpt-codex" && !bridgeAvailable}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              {draft.provider === "chatgpt-codex" && !bridgeAvailable && <div className="continuation-error" role="status">
                <p>{SUBSCRIPTION_BRIDGE_NOTICE}</p>
                <button type="button" className="check-coach-button" onClick={() => chooseProvider("proxy")}>Use a local provider</button>
                <button type="button" className="check-coach-button" onClick={() => chooseProvider("openai")}>Use an OpenAI API key</button>
              </div>}
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

                  {!codexStatus.authenticated && (
                    <details className="codex-manual-details">
                      <summary>
                        Paste callback URL or token manually (if port 1455 is
                        busy)
                      </summary>
                      <div className="codex-manual-row">
                        <input
                          type="text"
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
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
              )}

              {(draft.provider !== "chatgpt-codex" || bridgeAvailable) && <>
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
                        {loadingModels ? "Fetching…" : "Fetch live models"}
                      </span>
                    </button>
                  )}
              </div>

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
                  {mergedFallbackOptions.length > 0 && !customFallbackModel ? (
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
                  Test connection
                </button>
                <span
                  role="status"
                  className={`settings-test-result is-${testState.kind}`}
                >
                  {testState.kind === "ok" && (
                    <>
                      <CheckCircle2 size={14} /> Connected · {testState.model}
                    </>
                  )}
                  {testState.kind === "error" && (
                    <>
                      <XCircle size={14} /> {testState.message}
                    </>
                  )}
                </span>
              </div>

              </>}
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
          <p className="settings-save-error" role="alert">
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
