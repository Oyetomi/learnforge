/**
 * LearnForge AI connection settings.
 *
 * Every AI call goes through `aiFetch()` so the user can bring their own
 * provider. All presets speak the OpenAI-compatible chat completions format,
 * so prompts and parsing are unchanged. The local proxy stays the default.
 */
import { AI_CONFIG } from "./types";

export type ProviderId =
  | "proxy"
  | "chatgpt-codex"
  | "openai"
  | "gemini"
  | "anthropic"
  | "openrouter"
  | "ollama"
  | "custom";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  url: string;
  needsKey: boolean;
  authMode?: "none" | "api-key" | "oauth-chatgpt";
  model: string;
  fallbackModel: string;
  keyHint?: string;
  models: ModelOption[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "proxy",
    label: "Local proxy",
    url: AI_CONFIG.DEFAULT_API_URL,
    needsKey: false,
    authMode: "none",
    model: AI_CONFIG.DEFAULT_MODEL,
    fallbackModel: AI_CONFIG.FALLBACK_MODEL,
    models: [
      { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash High · Fast" },
      { id: "gemini-4-argon", label: "Gemini 4 Argon · Flagship 1M Context" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol · Agentic Coding" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 · Deep Reasoning" },
    ],
  },
  {
    id: "chatgpt-codex",
    label: "ChatGPT / Codex (development bridge)",
    url: "/api/chatgpt-codex/v1/chat/completions",
    needsKey: false,
    authMode: "oauth-chatgpt",
    model: "gpt-6.1-sol",
    fallbackModel: "gpt-6-astra",
    models: [
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol · Agentic Coding & Reasoning" },
      { id: "gpt-6-astra", label: "GPT-6 Astra · Frontier Flagship" },
      { id: "gpt-6.1-terra", label: "GPT-6.1 Terra · Deep Reasoning" },
      { id: "gpt-6-sol", label: "GPT-6 Sol · Balanced" },
      { id: "gpt-6-luna", label: "GPT-6 Luna · High Speed" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI (API Key)",
    url: "https://api.openai.com/v1/chat/completions",
    needsKey: true,
    authMode: "api-key",
    model: "gpt-4o-mini",
    fallbackModel: "gpt-6.1-sol",
    keyHint: "sk-…",
    models: [
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol · Agentic Coding & Reasoning" },
      { id: "gpt-6-astra", label: "GPT-6 Astra · Frontier Flagship" },
      { id: "gpt-6.1-terra", label: "GPT-6.1 Terra · Deep Reasoning" },
      { id: "gpt-6-sol", label: "GPT-6 Sol · Balanced" },
      { id: "gpt-6-luna", label: "GPT-6 Luna · High Speed" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini · Legacy Fast" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    needsKey: true,
    authMode: "api-key",
    model: "gemini-3.8-flash-high",
    fallbackModel: "gemini-4-argon",
    keyHint: "AIza…",
    models: [
      { id: "gemini-4-argon", label: "Gemini 4 Argon · Flagship 1M Context" },
      { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash High · Fast Reasoning" },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash · High Speed" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite · Lightweight" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    url: "https://api.anthropic.com/v1/chat/completions",
    needsKey: true,
    authMode: "api-key",
    model: "claude-opus-5-5",
    fallbackModel: "claude-sonnet-5",
    keyHint: "sk-ant-…",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 · Flagship 1M Context" },
      { id: "claude-fable-5-1", label: "Claude Fable 5.1 · Frontier Research" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 · Balanced Production" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 · Instant Speed" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    needsKey: true,
    authMode: "api-key",
    model: "openai/gpt-6.1-sol",
    fallbackModel: "anthropic/claude-opus-5.5",
    keyHint: "sk-or-…",
    models: [
      { id: "openai/gpt-6.1-sol", label: "OpenAI · GPT-6.1 Sol" },
      { id: "openai/gpt-6-astra", label: "OpenAI · GPT-6 Astra" },
      { id: "anthropic/claude-opus-5.5", label: "Anthropic · Claude Opus 5.5" },
      { id: "anthropic/claude-sonnet-5", label: "Anthropic · Claude Sonnet 5" },
      { id: "google/gemini-4-argon", label: "Google · Gemini 4 Argon" },
      { id: "google/gemini-3.8-flash-high", label: "Google · Gemini 3.8 Flash High" },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    url: "http://localhost:11434/v1/chat/completions",
    needsKey: false,
    authMode: "none",
    model: "llama3.1",
    fallbackModel: "llama3.1",
    models: [
      { id: "llama3.1", label: "Llama 3.1 (8B / 70B)" },
      { id: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B" },
      { id: "deepseek-r1:8b", label: "DeepSeek R1 8B" },
      { id: "mistral", label: "Mistral 7B" },
    ],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    url: "",
    needsKey: false,
    authMode: "api-key",
    model: "",
    fallbackModel: "",
    models: [],
  },
];

export interface AIConnection {
  provider: ProviderId;
  url: string;
  apiKey: string;
  model: string;
  fallbackModel: string;
}

const STORAGE_KEY = "learnforge:ai-connection";
const USAGE_KEY = "learnforge:ai-usage";
export const AI_CONNECTION_EVENT = "learnforge:ai-connection";

export const presetFor = (id: ProviderId) =>
  PROVIDER_PRESETS.find((p) => p.id === id) || PROVIDER_PRESETS[0];

export function connectionFromPreset(id: ProviderId, apiKey = ""): AIConnection {
  const p = presetFor(id);
  return { provider: p.id, url: p.url, apiKey, model: p.model, fallbackModel: p.fallbackModel };
}

export const DEFAULT_CONNECTION: AIConnection = connectionFromPreset("proxy");

const RETIRED_CODEX_MODELS = new Set([
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.2-codex",
  "codex-mini-latest",
  "o3",
  "o4-mini",
]);

export function loadAIConnection(): AIConnection {
  if (typeof localStorage === "undefined") return DEFAULT_CONNECTION;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return DEFAULT_CONNECTION;
    const base = connectionFromPreset(saved.provider);
    const rawModel =
      typeof saved.model === "string" && saved.model.trim() ? saved.model.trim() : "";
    const rawFallback =
      typeof saved.fallbackModel === "string" && saved.fallbackModel.trim()
        ? saved.fallbackModel.trim()
        : "";
    const model =
      base.provider === "chatgpt-codex" && RETIRED_CODEX_MODELS.has(rawModel)
        ? base.model
        : rawModel || base.model;
    const fallbackModel =
      base.provider === "chatgpt-codex" && RETIRED_CODEX_MODELS.has(rawFallback)
        ? base.fallbackModel
        : rawFallback || model || base.fallbackModel;
    return {
      provider: base.provider,
      url: (typeof saved.url === "string" && saved.url.trim()) || base.url,
      apiKey: typeof saved.apiKey === "string" ? saved.apiKey : "",
      model,
      fallbackModel,
    };
  } catch {
    return DEFAULT_CONNECTION;
  }
}

export function saveAIConnection(connection: AIConnection) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(AI_CONNECTION_EVENT));
}

export function buildHeaders(
  connection: AIConnection,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  const key = connection.apiKey.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  if (connection.provider === "anthropic") {
    if (key) headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  if (connection.provider === "openrouter") {
    headers["X-Title"] = "LearnForge";
  }
  return headers;
}

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let tauriFetch: typeof fetch | null = null;
async function resolveFetch(): Promise<typeof fetch> {
  if (!isTauri()) return fetch;
  if (!tauriFetch) {
    try {
      const mod = await import("@tauri-apps/plugin-http");
      tauriFetch = mod.fetch as unknown as typeof fetch;
    } catch {
      tauriFetch = fetch;
    }
  }
  return tauriFetch;
}

/** Thrown when the provider cannot be reached or rejects the request. */
export class AIConnectionError extends Error {
  readonly needsSetup = true;
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AIConnectionError";
  }
}

export const SUBSCRIPTION_BRIDGE_NOTICE = "This development-only sign-in bridge is unavailable in packaged LearnForge. Choose an API-key provider or a local provider in Settings. Native Sign in with ChatGPT needs its own supported integration.";
export function subscriptionBridgeAvailable(development = import.meta.env.DEV, native = isTauri()): boolean {
  return development && !native;
}

function requireSubscriptionBridge() {
  if (!subscriptionBridgeAvailable()) throw new AIConnectionError(SUBSCRIPTION_BRIDGE_NOTICE);
}

/** POST a chat-completions body to the configured provider. */
export async function aiFetch(
  body: Record<string, unknown>,
  init: { signal?: AbortSignal; stream?: boolean; connection?: AIConnection } = {}
): Promise<Response> {
  const connection = init.connection || loadAIConnection();
  if (connection.provider === "chatgpt-codex") requireSubscriptionBridge();
  if (!connection.url.trim())
    throw new AIConnectionError("No AI provider address is set. Open Settings to choose one.");
  if (presetFor(connection.provider).needsKey && !connection.apiKey.trim())
    throw new AIConnectionError(
      `${presetFor(connection.provider).label} needs an API key. Open Settings to add one.`
    );
  const doFetch = await resolveFetch();
  const request: RequestInit = {
    method: "POST",
    signal: init.signal,
    headers: buildHeaders(connection, init.stream ? { Accept: "text/event-stream" } : {}),
    body: JSON.stringify(body),
  };
  let response: Response;
  try {
    try {
      response = await doFetch(connection.url, request);
    } catch (err) {
      // Custom URLs outside the desktop allow-list: retry with the webview's fetch.
      if (doFetch === fetch || (err as Error)?.name === "AbortError") throw err;
      response = await fetch(connection.url, request);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if ((err as Error)?.name === "AbortError") throw err;
    const message = isTauri()
      ? `Couldn't reach ${presetFor(connection.provider).label} at ${connection.url}.`
      : `Couldn't reach ${presetFor(connection.provider).label}. Some providers block browser requests — use the desktop app or a proxy.`;
    reportAIStatus(false, message);
    throw new AIConnectionError(message);
  }
  if (response.status === 401 || response.status === 403) {
    const message = `${presetFor(connection.provider).label} rejected the API key (HTTP ${response.status}).`;
    reportAIStatus(false, message);
    throw new AIConnectionError(message, response.status);
  }
  reportAIStatus(
    response.ok,
    response.ok ? "" : `HTTP ${response.status} from ${presetFor(connection.provider).label}`
  );
  return response;
}

/** Fired after every AI request so the session UI can show connection health. */
export const AI_STATUS_EVENT = "learnforge:ai-status";
export interface AIStatusDetail {
  ok: boolean;
  message: string;
}
function reportAIStatus(ok: boolean, message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AIStatusDetail>(AI_STATUS_EVENT, { detail: { ok, message } })
  );
}

/** Quick connectivity check used by the Settings dialog. */
export async function testAIConnection(connection: AIConnection): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await aiFetch(
      {
        model: connection.model,
        max_tokens: 5,
        messages: [{ role: "user", content: "Reply with: ok" }],
      },
      { signal: controller.signal, connection }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AIConnectionError(
        `HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
        response.status
      );
    }
    const data = await response.json();
    recordUsage(data?.usage);
    return data?.model || connection.model;
  } catch (err) {
    if ((err as Error)?.name === "AbortError")
      throw new AIConnectionError("The provider didn't answer within 20 seconds.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Token meter ── */
export interface UsageTotals {
  prompt: number;
  completion: number;
  estimated: boolean;
}

export function readUsage(): UsageTotals {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || "null");
    if (u && typeof u.prompt === "number") return u;
  } catch {
    /* ignore */
  }
  return { prompt: 0, completion: 0, estimated: false };
}

export function recordUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined | null,
  fallbackText?: { prompt: string; completion: string }
) {
  if (typeof localStorage === "undefined") return;
  const totals = readUsage();
  if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
    totals.prompt += usage.prompt_tokens || 0;
    totals.completion += usage.completion_tokens || 0;
  } else if (fallbackText) {
    totals.prompt += Math.ceil(fallbackText.prompt.length / 4);
    totals.completion += Math.ceil(fallbackText.completion.length / 4);
    totals.estimated = true;
  } else return;
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(totals));
  } catch {
    /* ignore */
  }
}

export function resetUsage() {
  localStorage.removeItem(USAGE_KEY);
}

/**
 * Fetches live available models from an OpenAI-compatible `/v1/models` endpoint,
 * merging them with the provider preset's curated catalog.
 */
export async function fetchProviderModels(
  connection: AIConnection
): Promise<ModelOption[]> {
  if (connection.provider === "chatgpt-codex" && !subscriptionBridgeAvailable()) return [];
  const preset = presetFor(connection.provider);
  const baseModels = [...preset.models];
  if (!connection.url.trim() || connection.provider === "anthropic") {
    return baseModels;
  }

  const modelsUrl = connection.url
    .trim()
    .replace(/\/chat\/completions\/?$/, "/models");
  if (modelsUrl === connection.url.trim()) return baseModels;

  try {
    const doFetch = await resolveFetch();
    const res = await doFetch(modelsUrl, {
      method: "GET",
      headers: buildHeaders(connection),
    });
    if (!res.ok) return baseModels;
    const data = await res.json();
    const list: Array<{
      id?: string;
      slug?: string;
      name?: string;
      display_name?: string;
      context_window?: number;
    }> =
      Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
        ? data.models
        : [];

    const liveOptions: ModelOption[] = [];
    const seen = new Set<string>();
    for (const item of list.slice(0, 60)) {
      const id =
        typeof item?.id === "string"
          ? item.id.trim()
          : typeof item?.slug === "string"
          ? item.slug.trim()
          : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (typeof item?.context_window === "number" && item.context_window > 0)
        rememberContextWindow(id, item.context_window);
      const displayName = item?.name || item?.display_name;
      liveOptions.push({
        id,
        label: displayName && displayName !== id ? `${displayName} (${id})` : id,
      });
    }
    if (liveOptions.length > 0 && connection.provider === "chatgpt-codex") {
      return liveOptions;
    }
    for (const presetModel of baseModels) {
      if (!seen.has(presetModel.id)) {
        seen.add(presetModel.id);
        liveOptions.push(presetModel);
      }
    }
    return liveOptions.length > 0 ? liveOptions : baseModels;
  } catch {
    // Return preset models if endpoint does not expose /models
  }
  return baseModels;
}

export interface ChatGptCodexStatus {
  authenticated: boolean;
  email?: string;
  accountId?: string;
  source?: string;
}

export async function getChatGptCodexStatus(): Promise<ChatGptCodexStatus> {
  if (!subscriptionBridgeAvailable()) return { authenticated: false };
  try {
    const res = await fetch("/api/chatgpt-codex/status");
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

export async function startChatGptCodexLogin(): Promise<{
  authUrl: string;
}> {
  requireSubscriptionBridge();
  const res = await fetch("/api/chatgpt-codex/login", { method: "POST" });
  if (!res.ok) {
    throw new Error("Could not start ChatGPT OAuth flow.");
  }
  return await res.json();
}

export async function submitChatGptCodexCallback(
  callbackUrlOrToken: string
): Promise<ChatGptCodexStatus> {
  requireSubscriptionBridge();
  const res = await fetch("/api/chatgpt-codex/callback-manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callbackUrlOrToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Could not complete ChatGPT sign-in.");
  }
  return data;
}

export async function logoutChatGptCodex(): Promise<void> {
  if (!subscriptionBridgeAvailable()) return;
  await fetch("/api/chatgpt-codex/logout", { method: "POST" }).catch(() => {});
}

// ── Context window sizes (for the session telemetry ring) ──
const CONTEXT_WINDOW_KEY = "learnforge:context-windows";
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Static fallbacks; live Codex metadata (context_window) overrides these. */
const STATIC_CONTEXT_WINDOWS: Array<[RegExp, number]> = [
  [/gpt-6\.1-(sol|terra)/, 500_000],
  [/gpt-(6|5\.6)/, 272_000],
  [/gpt-4o/, 128_000],
  [/gemini-4/, 1_000_000],
  [/gemini-3/, 1_000_000],
  [/claude/, 200_000],
];

function readContextWindowCache(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTEXT_WINDOW_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberContextWindow(model: string, tokens: number): void {
  try {
    const cache = readContextWindowCache();
    if (cache[model] === tokens) return;
    cache[model] = tokens;
    localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable; static table still applies
  }
}

/** Best-known context window (tokens) for a model. */
export function contextWindowFor(model: string): number {
  const id = (model || "").toLowerCase().replace(/^[a-z-]+\//, "");
  const cached = readContextWindowCache()[model] ?? readContextWindowCache()[id];
  if (typeof cached === "number" && cached > 0) return cached;
  for (const [pattern, size] of STATIC_CONTEXT_WINDOWS)
    if (pattern.test(id)) return size;
  return DEFAULT_CONTEXT_WINDOW;
}

export type ContextLevel = "low" | "mid" | "high";
/** Ring colour band: below 50% low, 50–80% mid, above 80% high. */
export function contextLevel(ratio: number): ContextLevel {
  return ratio > 0.8 ? "high" : ratio >= 0.5 ? "mid" : "low";
}
