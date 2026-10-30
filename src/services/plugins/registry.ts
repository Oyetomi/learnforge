/**
 * LearnForge Extensible Plugin Registry.
 *
 * Manages local-first learning plugins (starting with Exa Neural Search & Web
 * Reader). All plugin states and API keys live strictly in device-local storage
 * (`learnforge:plugins-v1`) and are never hardcoded or exposed to zero-origin
 * simulation sandboxes.
 */

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
    return {
      exa: validateExaConfig(parsed?.exa),
    };
  } catch {
    return { exa: { ...DEFAULT_EXA_CONFIG } };
  }
}

export function savePluginsState(next: PluginsState): PluginsState {
  const validated: PluginsState = {
    exa: validateExaConfig(next.exa),
  };
  localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(validated));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PluginsState>(PLUGINS_CHANGED_EVENT, {
        detail: validated,
      })
    );
  }
  return validated;
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
