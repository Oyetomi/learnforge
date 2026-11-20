import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedProviderModels,
  connectionFromPreset,
  fetchProviderModelCatalog,
  modelOptionsFrom,
  presetFor,
} from "../connection";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const proxyModels = {
  object: "list",
  data: ["gemini-4-argon", "gemini-4-argon-medium", "gemini-3.8-flash-high", "gemini-3-flash", "claude-opus-5-5-high"].map((id) => ({ id, owned_by: "google" })),
};

describe("provider model lists", () => {
  it("offers exactly what the provider lists, preferring its own names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(proxyModels))));
    const catalog = await fetchProviderModelCatalog(connectionFromPreset("proxy"));
    expect(catalog.live).toBe(true);
    expect(catalog.models.map((m) => m.id)).toEqual(proxyModels.data.map((m) => m.id));
    // Built-in names the provider no longer offers are not mixed in.
    expect(catalog.models.some((m) => m.id === "gpt-6.1-sol")).toBe(false);
    expect(catalog.models.find((m) => m.id === "gemini-4-argon")?.label).toBe(
      presetFor("proxy").models.find((m) => m.id === "gemini-4-argon")?.label
    );
    expect(catalog.models.find((m) => m.id === "gemini-3-flash")?.label).toBe("gemini-3-flash");
    const named = modelOptionsFrom({ data: [{ id: "gemini-4-argon", display_name: "Gemini 4 Argon" }] }, presetFor("proxy"));
    expect(named[0].label).toBe("Gemini 4 Argon");
  });

  it("remembers the last list per provider and endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(proxyModels))));
    const connection = connectionFromPreset("proxy");
    expect(cachedProviderModels(connection)).toBeNull();
    await fetchProviderModelCatalog(connection);
    expect(cachedProviderModels(connection)?.models).toHaveLength(5);
    expect(cachedProviderModels({ ...connection, url: "http://localhost:9/v1/chat/completions" })).toBeNull();
  });

  it("cleans Gemini's list: no models/ prefix, chat models only", () => {
    const options = modelOptionsFrom(
      { data: [{ id: "models/gemini-4-pro" }, { id: "models/text-embedding-005" }, { id: "models/imagen-5" }, { id: "models/gemini-4-flash-tts" }, { id: "models/gemini-4-flash" }] },
      presetFor("gemini")
    );
    expect(options.map((o) => o.id)).toEqual(["gemini-4-pro", "gemini-4-flash"]);
  });

  it("reads Anthropic's list with display names", () => {
    const options = modelOptionsFrom({ data: [{ id: "claude-new-6", display_name: "Claude New 6" }] }, presetFor("anthropic"));
    expect(options).toEqual([{ id: "claude-new-6", label: "Claude New 6" }]);
  });

  it("falls back to suggested names when the provider can't be asked or doesn't answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    const failed = await fetchProviderModelCatalog(connectionFromPreset("proxy"));
    expect(failed).toMatchObject({ live: false });
    expect(failed.models).toEqual(presetFor("proxy").models);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const noKey = await fetchProviderModelCatalog(connectionFromPreset("gemini"));
    expect(noKey.live).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
