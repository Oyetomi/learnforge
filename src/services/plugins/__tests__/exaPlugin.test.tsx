import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EXA_CONFIG,
  PLUGINS_CHANGED_EVENT,
  countActivePlugins,
  isExaPluginReady,
  loadPluginsState,
  savePluginsState,
  validateExaConfig,
} from "../registry";
import {
  ExaPluginError,
  fetchExaGrounding,
  importUrlsWithExa,
  parseDirectUrls,
  searchExaReferences,
  testExaConnection,
  type FetchLike,
} from "../exa";
import {
  referenceContext,
  resolveLearningReferences,
} from "../../learning/grounding";
import { ReferenceShelf } from "../../../components/learning/ReferenceShelf";

describe("Plugin registry & Exa grounding plugin", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to disabled with no hardcoded API key and persists local config", () => {
    const initial = loadPluginsState();
    expect(initial.exa).toEqual(DEFAULT_EXA_CONFIG);
    expect(initial.exa.apiKey).toBe("");
    expect(initial.exa.enabled).toBe(false);
    expect(isExaPluginReady(initial.exa)).toBe(false);
    expect(countActivePlugins(initial)).toBe(0);

    const listener = vi.fn();
    window.addEventListener(PLUGINS_CHANGED_EVENT, listener);
    try {
      const saved = savePluginsState({
        exa: {
          enabled: true,
          apiKey: "  exa-test-token-0000  ",
          searchType: "neural",
          numResults: 5,
          autoGroundNewTopics: false,
        },
      });
      expect(saved.exa.apiKey).toBe("exa-test-token-0000");
      expect(isExaPluginReady(saved.exa)).toBe(true);
      expect(countActivePlugins(saved)).toBe(1);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(loadPluginsState().exa).toEqual(saved.exa);
    } finally {
      window.removeEventListener(PLUGINS_CHANGED_EVENT, listener);
    }

    // Sanitization fallback on malformed storage values
    const sanitized = validateExaConfig({
      enabled: true,
      apiKey: 12345,
      searchType: "invalid-mode",
      numResults: 99,
    });
    expect(sanitized.apiKey).toBe("");
    expect(sanitized.searchType).toBe("auto");
    expect(sanitized.numResults).toBe(3);
    expect(isExaPluginReady(sanitized)).toBe(false);
  });

  it("distinguishes 1–5 direct HTTP(S) URLs from natural-language search queries", () => {
    expect(parseDirectUrls("https://go.dev/doc/effective_go")).toEqual([
      "https://go.dev/doc/effective_go",
    ]);
    expect(
      parseDirectUrls(
        "https://docs.rs/tokio/latest/tokio/, https://tokio.rs/tokio/tutorial"
      )
    ).toEqual([
      "https://docs.rs/tokio/latest/tokio/",
      "https://tokio.rs/tokio/tutorial",
    ]);
    expect(
      parseDirectUrls("teach me rust async pinning and https://tokio.rs")
    ).toEqual([]);
    expect(parseDirectUrls("javascript:alert(1)")).toEqual([]);
  });

  it("queries Exa /search with x-api-key and builds cited LearningReference items", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Effective Go - Interfaces",
              url: "https://go.dev/doc/effective_go",
              publishedDate: "2026-02-14T00:00:00.000Z",
              highlights: [
                "Interfaces in Go provide a way to specify the behavior of an object.",
              ],
              text: "If something can do this, then it can be used here.",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const sources = await searchExaReferences("go structural interfaces", {
      config: {
        apiKey: "exa-test-token-0000",
        searchType: "neural",
        numResults: 5,
      },
      fetchImpl: mockFetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.exa.ai/search");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("exa-test-token-0000");
    const payload = JSON.parse(String(calls[0].init?.body));
    expect(payload.query).toBe("go structural interfaces");
    expect(payload.type).toBe("neural");
    expect(payload.numResults).toBe(5);

    expect(sources).toHaveLength(1);
    expect(sources[0].domain).toBe("go.dev");
    expect(sources[0].publishedDate).toBe("2026-02-14");
    expect(sources[0].reference.pluginId).toBe("exa");
    expect(sources[0].reference.url).toBe("https://go.dev/doc/effective_go");
    expect(sources[0].reference.content).toContain("Key Excerpts");
    expect(sources[0].reference.content).toContain(
      "If something can do this, then it can be used here."
    );
  });

  it("routes direct URLs through Exa /contents via fetchExaGrounding", async () => {
    const endpoints: string[] = [];
    const mockFetch: FetchLike = async (url) => {
      endpoints.push(url);
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Tokio Spawning Tutorial",
              url: "https://tokio.rs/tokio/tutorial/spawning",
              text: "Tasks in Tokio are asynchronous green threads.",
            },
          ],
        }),
        { status: 200 }
      );
    };

    const res = await fetchExaGrounding(
      "https://tokio.rs/tokio/tutorial/spawning",
      {
        config: { apiKey: "exa-test-token-0000" },
        fetchImpl: mockFetch,
      }
    );

    expect(res.mode).toBe("urls");
    expect(endpoints).toEqual(["https://api.exa.ai/contents"]);
    expect(res.sources[0].reference.pluginId).toBe("exa");
  });

  it("surfaces clear ExaPluginError messages on 401 and verifies testExaConnection", async () => {
    const unauthorizedFetch: FetchLike = async () =>
      new Response("Unauthorized", { status: 401 });

    await expect(
      testExaConnection("bad-key", { fetchImpl: unauthorizedFetch })
    ).rejects.toMatchObject({
      name: "ExaPluginError",
      status: 401,
    });

    await expect(
      importUrlsWithExa(["https://example.com"], {
        config: { apiKey: "" },
        fetchImpl: unauthorizedFetch,
      })
    ).rejects.toBeInstanceOf(ExaPluginError);

    const okFetch: FetchLike = async () =>
      new Response(
        JSON.stringify({
          results: [{ title: "Rust Book", url: "https://doc.rust-lang.org" }],
        }),
        { status: 200 }
      );

    const ping = await testExaConnection("exa-test-token-0000", {
      fetchImpl: okFetch,
    });
    expect(ping.sampleTitle).toBe("Rust Book");
    expect(ping.latencyMs).toBeGreaterThanOrEqual(1);
  });

  it("merges Exa sources with local reference notes and renders Exa provenance in ReferenceShelf", async () => {
    const mockFetch: FetchLike = async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Mafs React Math Docs",
              url: "https://mafs.dev/guides/get-started/hello-f-x",
              highlights: ["Plot.OfX renders continuous functions f(x)."],
              text: "Mafs builds interactive Cartesian coordinate planes.",
            },
          ],
        }),
        { status: 200 }
      );

    const [exaSource] = await searchExaReferences("mafs plot ofx", {
      config: { apiKey: "exa-test-token-0000" },
      fetchImpl: mockFetch,
    });

    const combined = resolveLearningReferences([exaSource.reference], {
      name: "team-notes.md",
      content: "Focus on parametric vectors and unit circle intuition.",
    });

    expect(combined).toHaveLength(2);
    expect(combined?.[0].pluginId).toBe("exa");
    expect(combined?.[1].name).toBe("team-notes.md");

    const promptBlock = referenceContext(combined, "Cartesian functions");
    expect(promptBlock).toContain("Mafs React Math Docs");
    expect(promptBlock).toContain("team-notes.md");

    const shelfHtml = renderToStaticMarkup(
      <ReferenceShelf references={combined} />
    );
    expect(shelfHtml).toContain("reference-plugin-badge");
    expect(shelfHtml).toContain("Exa");
    expect(shelfHtml).toContain("Open source");
    expect(shelfHtml).toContain(
      "https://mafs.dev/guides/get-started/hello-f-x"
    );
  });
});
