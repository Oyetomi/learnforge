/**
 * LearnForge Extensible Plugin Registry.
 *
 * Manages local-first learning plugins (starting with Exa Neural Search & Web
 * Reader). Plugin settings live in device-local storage (`learnforge:plugins-v1`).
 * In the Mac app the Exa key moves to macOS Keychain; elsewhere it stays in
 * local storage. Keys are never hardcoded or exposed to zero-origin
 * simulation sandboxes.
 */
import { cachedSecret, hydrateSecret, keychainHolds, storeSecret } from "../secrets";

export type PluginId = "exa";

export type PluginCapability = "topic-grounding" | "url-import";

export interface PluginManifest {
  id: PluginId;
  name: string;
  tagline: string;
  description: string;
  docsUrl: string;
  keyPortalUrl: string;
  keyHint: string;
  capabilities: PluginCapability[];
}

export type ExaSearchType = "auto" | "neural" | "fast";

export interface ExaPluginConfig {
  enabled: boolean;
  apiKey: string;
  searchType: ExaSearchType;
  numResults: 3 | 5;
  /** Automatically ground new topics with Exa when toggled on in New Topic. */
  autoGroundNewTopics: boolean;
}

export interface PluginsState {
  exa: ExaPluginConfig;
}

export const PLUGINS_STORAGE_KEY = "learnforge:plugins-v1";
export const PLUGINS_CHANGED_EVENT = "learnforge:plugins-changed";

export const PLUGIN_MANIFESTS: readonly PluginManifest[] = [
  {
    id: "exa",
    name: "Exa Neural Search",
    tagline: "Live documentation, paper & URL grounding for curricula",
    description:
      "Fetches authoritative primary documentation, research papers, and clean markdown from URLs (/search & /contents) so new learning tracks teach current APIs with cited sources.",
    docsUrl: "https://docs.exa.ai",
    keyPortalUrl: "https://dashboard.exa.ai/api-keys",
    keyHint: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    capabilities: ["topic-grounding", "url-import"],
  },
] as const;

export const DEFAULT_EXA_CONFIG: ExaPluginConfig = {
  enabled: false,
  apiKey: "",
  searchType: "auto",
  numResults: 3,
  autoGroundNewTopics: true,
};

export const DEFAULT_PLUGINS_STATE: PluginsState = {
  exa: { ...DEFAULT_EXA_CONFIG },
};

export function validateExaConfig(raw: unknown): ExaPluginConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_EXA_CONFIG };
  const obj = raw as Record<string, unknown>;
  const apiKey =
    typeof obj.apiKey === "string" ? obj.apiKey.trim().slice(0, 200) : "";
  const searchType: ExaSearchType =
    obj.searchType === "neural" || obj.searchType === "fast"
      ? obj.searchType
      : "auto";
  const numResults: 3 | 5 = obj.numResults === 5 ? 5 : 3;
  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : Boolean(apiKey);
  const autoGroundNewTopics =
    typeof obj.autoGroundNewTopics === "boolean"
      ? obj.autoGroundNewTopics
      : true;

  return {
    enabled,
    apiKey,
    searchType,
    numResults,
    autoGroundNewTopics,
  };
}

export function loadPluginsState(): PluginsState {
  try {
    const raw = localStorage.getItem(PLUGINS_STORAGE_KEY);
    if (!raw) return { exa: { ...DEFAULT_EXA_CONFIG } };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    let exa = parsed?.exa;
    // A plaintext key remains only before the Keychain move or after a failed
    // Keychain write; it is the newer value in both cases.
    if (keychainHolds("exa") && exa && typeof exa === "object" && !(exa as { apiKey?: unknown }).apiKey)
      exa = { ...(exa as object), apiKey: cachedSecret("exa") };
    return {
      exa: validateExaConfig(exa),
    };
  } catch {
    return { exa: { ...DEFAULT_EXA_CONFIG } };
  }
}

export function savePluginsState(next: PluginsState): PluginsState {
  const validated: PluginsState = {
    exa: validateExaConfig(next.exa),
  };
  if (!keychainHolds("exa")) {
    localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(validated));
  } else {
    localStorage.setItem(
      PLUGINS_STORAGE_KEY,
      JSON.stringify({ ...validated, exa: { ...validated.exa, apiKey: "" } })
    );
    storeSecret("exa", validated.exa.apiKey, () => writeStoredExaKey(validated.exa.apiKey));
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PluginsState>(PLUGINS_CHANGED_EVENT, {
        detail: validated,
      })
    );
  }
  return validated;
}

function readStoredPlugins(): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLUGINS_STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredExaKey(apiKey: string): void {
  const stored = readStoredPlugins();
  const exa = stored?.exa;
  if (!stored || !exa || typeof exa !== "object") return;
  localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify({ ...stored, exa: { ...exa, apiKey } }));
}

/** Move the Exa key out of local storage into macOS Keychain (Mac app). */
export async function hydrateExaKey(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  const moved = await hydrateSecret("exa", {
    read: () => {
      const exa = readStoredPlugins()?.exa as { apiKey?: unknown } | undefined;
      return typeof exa?.apiKey === "string" ? exa.apiKey : "";
    },
    strip: () => writeStoredExaKey(""),
  });
  if (moved && typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<PluginsState>(PLUGINS_CHANGED_EVENT, { detail: loadPluginsState() })
    );
}

export function getExaPluginConfig(): ExaPluginConfig {
  return loadPluginsState().exa;
}

export function isExaPluginReady(config = getExaPluginConfig()): boolean {
  return config.enabled && config.apiKey.trim().length > 0;
}

export function countActivePlugins(state = loadPluginsState()): number {
  let count = 0;
  if (isExaPluginReady(state.exa)) count += 1;
  return count;
}
