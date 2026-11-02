import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_NARRATION, loadNarrationVoices, narrationKeyConfigured, nativeNarrationAvailable, type NarrationPreferences } from "../../services/learning/narration";
import "../learning/narration.css";

export function NarrationSettings({ value, onChange, apiKey, onKeyChange, onKeyStatus }: {
  value: NarrationPreferences; onChange: (patch: Partial<NarrationPreferences>) => void;
  apiKey: string; onKeyChange: (key: string) => void; onKeyStatus: (configured: boolean) => void;
}) {
  const native = nativeNarrationAvailable();
  const [configured, setConfigured] = useState(false);
  const [voices, setVoices] = useState<{id:string;name:string}[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const version = useRef(0);
  useEffect(() => { let active = true; void narrationKeyConfigured().then(ok => {
    if (active) { setConfigured(ok); onKeyStatus(ok); }
  }).catch(() => { if (active) setError("The Keychain status couldn't be checked. You can reconnect your key."); });
    return () => { active = false; version.current++; };
  }, []);
  useEffect(() => { version.current++; setLoading(false); setError(""); }, [apiKey]);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }, [error]);
  const load = async () => {
    const request = ++version.current; setLoading(true); setError("");
    try { const list = await loadNarrationVoices(apiKey); if (request === version.current) setVoices(list); }
    catch (e) { if (request === version.current) setError(typeof e === "string" ? e : "Couldn't load ElevenLabs voices."); }
    finally { if (request === version.current) setLoading(false); }
  };
  const enabled = value.provider === "elevenlabs" || (value.provider === "automatic" && configured);
  return <section className={`settings-plugin-card narration-settings ${enabled && configured ? "is-ready" : ""}`} aria-labelledby="narration-settings-title">
    <div className="settings-plugin-header">
      <div>
        <div className="settings-plugin-title-row">
          <strong id="narration-settings-title">ElevenLabs</strong>
          <span className={`codex-status-pill ${enabled && configured ? "is-connected" : ""}`}>
            {enabled ? (configured ? "Connected" : "Needs API key") : "Disabled"}
          </span>
        </div>
        <small className="settings-plugin-tagline">Natural voices for lessons and explanations</small>
      </div>
      <label className="settings-plugin-switch">
        <input type="checkbox" aria-label="Enable ElevenLabs narration" checked={enabled} disabled={!native}
          onChange={e => onChange({ provider: e.target.checked ? "elevenlabs" : "device" })} />
        <span>{enabled ? "Enabled" : "Enable"}</span>
      </label>
    </div>
    <p>Read lessons and explanations aloud with your own ElevenLabs account. Audio starts only when you choose Listen.</p>
    {native && !enabled && <p>Device voice stays available. Disabling this plugin keeps your saved key for later.</p>}
    {native ? <details className="settings-plugin-details" open={enabled}>
      <summary>Connection and voice settings</summary>
      <label className="settings-field"><span>ElevenLabs API key <small>{configured ? "Saved in Keychain" : "Optional"}</small></span>
        <input type="password" autoComplete="off" spellCheck={false} value={apiKey}
          placeholder={configured ? "Leave blank to keep your saved key" : "Enter your ElevenLabs key"}
          onChange={e => onKeyChange(e.target.value)} />
      </label>
      <div className="narration-fields">
        <label className="settings-field"><span>Voice</span>
          {voices.length ? <select value={value.voiceId} onChange={e => onChange({ voiceId: e.target.value })}>
            {!voices.some(v => v.id === value.voiceId) && <option value={value.voiceId}>Current voice</option>}
            {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select> : <select value={value.voiceId} onChange={e => onChange({voiceId:e.target.value})}>
            <option value={DEFAULT_NARRATION.voiceId}>George · narration</option>
            {value.voiceId !== DEFAULT_NARRATION.voiceId && <option value={value.voiceId}>Custom voice</option>}
          </select>}
        </label>
        <label className="settings-field"><span>Speech model</span>
          <select value={value.modelId} onChange={e => onChange({modelId:e.target.value as NarrationPreferences["modelId"]})}>
            <option value="eleven_flash_v2_5">Flash v2.5 · faster</option>
            <option value="eleven_multilingual_v2">Multilingual v2 · narration</option>
          </select>
        </label>
      </div>
      <details><summary>Use another voice ID</summary><label className="settings-field"><span>ElevenLabs voice ID</span>
        <input value={value.voiceId} onChange={e => onChange({voiceId:e.target.value})} spellCheck={false} />
      </label></details>
      <div><button type="button" className="check-coach-button" disabled={loading || (!configured && !apiKey.trim())} onClick={() => void load()}>
        {loading && <Loader2 size={12} className="animate-spin" />} {loading ? "Loading voices…" : "Load voices"}
      </button></div>
      <p>Your key is stored in macOS Keychain. Pressing Listen sends the displayed explanation to ElevenLabs and uses its credits. Recent audio is cached while the app stays open. Device voice is available without ElevenLabs.</p>
    </details> : <p>Configure ElevenLabs in the Mac app. Device voice is available here.</p>}
    {error && <p ref={errorRef} className="narration-error" role="alert">{error}</p>}
  </section>;
}
