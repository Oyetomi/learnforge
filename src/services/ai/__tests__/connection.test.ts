import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AIConnectionError,
  DEFAULT_CONNECTION,
  aiFetch,
  aiJsonRequest,
  buildHeaders,
  connectionFromPreset,
  loadAIConnection,
  readUsage,
  recordUsage,
  resetUsage,
  saveAIConnection,
  subscriptionBridgeAvailable,
  getChatGptCodexStatus,
  startChatGptCodexLogin,
} from "../connection";
import { AI_CONFIG } from "../types";

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

describe("AI connection settings", () => {
  it("does not advertise the development bridge as a packaged auth capability", async () => {
    expect(subscriptionBridgeAvailable(false,false)).toBe(false);
    expect(subscriptionBridgeAvailable(true,true)).toBe(false);
    expect(subscriptionBridgeAvailable(true,false)).toBe(true);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    await expect(aiFetch({}, {connection:connectionFromPreset("chatgpt-codex")})).rejects.toThrow("development-only");
    expect(await getChatGptCodexStatus()).toEqual({authenticated:false});
    await expect(startChatGptCodexLogin()).rejects.toThrow("development-only");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("defaults to the local proxy so existing behaviour is unchanged", () => {
    expect(loadAIConnection()).toEqual(DEFAULT_CONNECTION);
    expect(DEFAULT_CONNECTION.url).toBe(AI_CONFIG.DEFAULT_API_URL);
    expect(DEFAULT_CONNECTION.model).toBe(AI_CONFIG.DEFAULT_MODEL);
  });

  it("round-trips a saved provider and fills blanks from the preset", () => {
    saveAIConnection({ ...connectionFromPreset("openai", "sk-test"), model: "" });
    const loaded = loadAIConnection();
    expect(loaded.provider).toBe("openai");
    expect(loaded.apiKey).toBe("sk-test");
    expect(loaded.model).toBe("gpt-4o-mini");
  });

  it("recovers from corrupt storage", () => {
    store.set("learnforge:ai-connection", "{not json");
    expect(loadAIConnection()).toEqual(DEFAULT_CONNECTION);
  });

  it("builds bearer and provider-specific headers", () => {
    expect(buildHeaders(DEFAULT_CONNECTION).Authorization).toBeUndefined();
    const anthropic = buildHeaders(connectionFromPreset("anthropic", "sk-ant"));
    expect(anthropic.Authorization).toBe("Bearer sk-ant");
    expect(anthropic["x-api-key"]).toBe("sk-ant");
    expect(anthropic["anthropic-version"]).toBeDefined();
  });

  it("asks for setup instead of calling a provider without its key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      aiFetch({}, { connection: connectionFromPreset("openai") })
    ).rejects.toBeInstanceOf(AIConnectionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a rejected key into a readable setup error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(
      aiFetch({}, { connection: connectionFromPreset("openai", "bad") })
    ).rejects.toThrow(/rejected the API key/);
  });

  it("accumulates real and estimated token usage", () => {
    resetUsage();
    recordUsage({ prompt_tokens: 10, completion_tokens: 5 });
    recordUsage(null, { prompt: "abcdefgh", completion: "abcd" });
    expect(readUsage()).toEqual({ prompt: 12, completion: 6, estimated: true });
  });

  it("retries aiJsonRequest without response_format on HTTP 400 and falls back to fallbackModel on 5xx", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const parsed = JSON.parse(String(init?.body || "{}"));
        calls.push(parsed);
        if (parsed.response_format) {
          return new Response("response_format unsupported", { status: 400 });
        }
        if (parsed.model === "primary-model") {
          return new Response("overloaded", { status: 503 });
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
          { status: 200 }
        );
      })
    );

    const conn = {
      ...DEFAULT_CONNECTION,
      model: "primary-model",
      fallbackModel: "fallback-model",
    };
    const res = await aiJsonRequest(
      {
        model: conn.model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: "hi" }],
      },
      { connection: conn }
    );
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      model: "primary-model",
      response_format: { type: "json_object" },
    });
    expect(calls[1].response_format).toBeUndefined();
    expect(calls[1].model).toBe("primary-model");
    expect(calls[2].response_format).toBeUndefined();
    expect(calls[2].model).toBe("fallback-model");
  });
});
