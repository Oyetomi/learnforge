import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const keychain = new Map<string, string>();
let available = true;
let failWrites = false;
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { name: string; value?: string }) => {
    if (cmd === "secret_store_available") return available;
    if (cmd === "secret_get") return keychain.get(args!.name) ?? null;
    if (cmd === "secret_set") {
      if (failWrites) throw new Error("denied");
      if (args!.value) keychain.set(args!.name, args!.value);
      else keychain.delete(args!.name);
      return null;
    }
    throw new Error(`unexpected ${cmd}`);
  }),
}));

import { resetSecretsForTests } from "../secrets";
import {
  connectionFromPreset,
  hydrateAIKey,
  loadAIConnection,
  needsWebviewFetch,
  saveAIConnection,
} from "../ai/connection";
import { hydrateExaKey, loadPluginsState, savePluginsState, DEFAULT_EXA_CONFIG } from "../plugins/registry";
import { isSameOriginRequest } from "../ai/devBridgeGuard";

const store = new Map<string, string>();
const stored = (key: string) => JSON.parse(store.get(key) || "null");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  store.clear();
  keychain.clear();
  available = true;
  failWrites = false;
  resetSecretsForTests();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { __TAURI_INTERNALS__: {} }));
});
afterEach(() => vi.unstubAllGlobals());

describe("AI key in Keychain", () => {
  it("moves a plaintext key into Keychain and strips it from local storage", async () => {
    store.set("learnforge:ai-connection", JSON.stringify(connectionFromPreset("openai", "sk-old")));
    await hydrateAIKey();
    expect(keychain.get("ai-connection")).toBe("sk-old");
    expect(stored("learnforge:ai-connection").apiKey).toBe("");
    expect(loadAIConnection().apiKey).toBe("sk-old");
  });

  it("saves new keys to Keychain only", async () => {
    await hydrateAIKey();
    saveAIConnection(connectionFromPreset("openai", "sk-new"));
    await flush();
    expect(keychain.get("ai-connection")).toBe("sk-new");
    expect(stored("learnforge:ai-connection").apiKey).toBe("");
    expect(loadAIConnection().apiKey).toBe("sk-new");
  });

  it("keeps the key in local storage when the Keychain write fails", async () => {
    await hydrateAIKey();
    failWrites = true;
    saveAIConnection(connectionFromPreset("openai", "sk-kept"));
    await flush();
    expect(stored("learnforge:ai-connection").apiKey).toBe("sk-kept");
    expect(loadAIConnection().apiKey).toBe("sk-kept");
  });

  it("stays on local storage outside the Mac app", async () => {
    available = false;
    store.set("learnforge:ai-connection", JSON.stringify(connectionFromPreset("openai", "sk-web")));
    await hydrateAIKey();
    expect(keychain.size).toBe(0);
    expect(stored("learnforge:ai-connection").apiKey).toBe("sk-web");
    saveAIConnection(connectionFromPreset("openai", "sk-web2"));
    expect(stored("learnforge:ai-connection").apiKey).toBe("sk-web2");
  });
});

describe("Exa key in Keychain", () => {
  it("moves the Exa key and keeps the plugin enabled", async () => {
    store.set(
      "learnforge:plugins-v1",
      JSON.stringify({ exa: { ...DEFAULT_EXA_CONFIG, enabled: true, apiKey: "exa-key" } })
    );
    await hydrateExaKey();
    expect(keychain.get("exa")).toBe("exa-key");
    expect(stored("learnforge:plugins-v1").exa.apiKey).toBe("");
    expect(loadPluginsState().exa).toMatchObject({ enabled: true, apiKey: "exa-key" });

    savePluginsState({ exa: { ...loadPluginsState().exa, apiKey: "exa-2" } });
    await flush();
    expect(keychain.get("exa")).toBe("exa-2");
    expect(stored("learnforge:plugins-v1").exa.apiKey).toBe("");
  });
});

describe("webview fetch fallback", () => {
  it("applies only to custom hosts outside the native allow-list", () => {
    expect(needsWebviewFetch("https://api.openai.com/v1/chat/completions")).toBe(false);
    expect(needsWebviewFetch("http://localhost:11434/v1/chat/completions")).toBe(false);
    expect(needsWebviewFetch("https://llm.example.com/v1/chat/completions")).toBe(true);
    expect(needsWebviewFetch("not a url")).toBe(false);
  });
});

describe("dev bridge origin guard", () => {
  const host = "localhost:5173";
  it("accepts the app's own requests", () => {
    expect(isSameOriginRequest({ method: "GET", headers: { host, "sec-fetch-site": "same-origin" } })).toBe(true);
    expect(
      isSameOriginRequest({
        method: "POST",
        headers: { host, origin: `http://${host}`, "content-type": "application/json" },
      })
    ).toBe(true);
  });
  it("rejects cross-site and non-JSON posts", () => {
    expect(isSameOriginRequest({ method: "GET", headers: { host, "sec-fetch-site": "cross-site" } })).toBe(false);
    expect(
      isSameOriginRequest({
        method: "POST",
        headers: { host, origin: "https://evil.example", "content-type": "application/json" },
      })
    ).toBe(false);
    expect(
      isSameOriginRequest({ method: "POST", headers: { host, origin: `http://${host}`, "content-type": "text/plain" } })
    ).toBe(false);
  });
});
