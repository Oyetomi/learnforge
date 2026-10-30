/**
 * Exa Neural Search & Web Contents Plugin (`https://api.exa.ai`).
 *
 * Powers two core curriculum grounding workflows:
 *   1. Topic Grounding (`POST /search` with inline `contents` + `highlights`)
 *   2. Direct URL Reference Import (`POST /contents` for 1–5 pasted URLs)
 *
 * Uses Tauri's native Rust HTTP client (`@tauri-apps/plugin-http`) inside the
 * desktop app and Vite's `/api/exa` proxy in browser dev mode so CORS never
 * blocks requests.
 */

import type { LearningReference } from "../../types";
import { createLearningReference } from "../learning/grounding";
import {
  getExaPluginConfig,
  type ExaPluginConfig,
  type ExaSearchType,
} from "./registry";

export class ExaPluginError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ExaPluginError";
    this.status = status;
  }
}

export interface ExaGroundedSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedDate?: string;
  snippet: string;
  reference: LearningReference;
}

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

const EXA_ORIGIN = "https://api.exa.ai";

function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isLocalDevServer(): boolean {
  if (typeof window === "undefined" || isTauriDesktop()) return false;
  const host = window.location?.hostname || "";
  return host === "localhost" || host === "127.0.0.1";
}

async function resolveExaFetch(override?: FetchLike): Promise<{
  doFetch: FetchLike;
  baseUrl: string;
}> {
  if (override) {
    return { doFetch: override, baseUrl: EXA_ORIGIN };
  }
  if (isTauriDesktop()) {
    try {
      const mod = await import("@tauri-apps/plugin-http");
      return { doFetch: mod.fetch as unknown as FetchLike, baseUrl: EXA_ORIGIN };
    } catch {
      return { doFetch: fetch, baseUrl: EXA_ORIGIN };
    }
  }
  if (isLocalDevServer()) {
    return { doFetch: fetch, baseUrl: "/api/exa" };
  }
  return { doFetch: fetch, baseUrl: EXA_ORIGIN };
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

/** Extracts 1–5 HTTP(S) URLs when the user input consists purely of URL(s). */
export function parseDirectUrls(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const tokens = trimmed
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return [];
  const urls: string[] = [];
  for (const token of tokens) {
    if (!/^https?:\/\/\S+$/i.test(token)) return [];
    try {
      const parsed = new URL(token);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return [];
      }
      urls.push(parsed.toString());
    } catch {
      return [];
    }
  }
  return Array.from(new Set(urls));
}

interface RawExaResult {
  id?: string;
  url?: string;
  title?: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
}

function toGroundedSource(raw: RawExaResult, index: number): ExaGroundedSource | null {
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) return null;
  const domain = safeDomain(url);
  const title =
    (typeof raw.title === "string" && raw.title.trim()) ||
    `${domain} reference ${index + 1}`;
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .map((h) => h.trim())
    : [];
  const bodyText = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!bodyText && highlights.length === 0) return null;

  const publishedDate =
    typeof raw.publishedDate === "string" && raw.publishedDate.length >= 10
      ? raw.publishedDate.slice(0, 10)
      : undefined;

  const sections: string[] = [
    `# ${title}`,
    `Source URL: ${url}${publishedDate ? ` (Published ${publishedDate})` : ""}`,
  ];
  if (highlights.length > 0) {
    sections.push(
      `## Key Excerpts\n${highlights.map((h) => `- ${h}`).join("\n")}`
    );
  }
  if (bodyText) {
    sections.push(`## Extracted Content\n${bodyText}`);
  }

  const reference = createLearningReference(
    `${title} (${domain})`,
    sections.join("\n\n"),
    { url, pluginId: "exa" }
  );
  if (!reference) return null;

  const rawSnippet = highlights[0] || bodyText;
  const snippet =
    rawSnippet.replace(/\s+/g, " ").trim().slice(0, 200) +
    (rawSnippet.length > 200 ? "…" : "");

  return {
    id: reference.id,
    title,
    url,
    domain,
    ...(publishedDate ? { publishedDate } : {}),
    snippet,
    reference,
  };
}

async function exaPost(
  endpoint: "/search" | "/contents",
  apiKey: string,
  payload: Record<string, unknown>,
  options?: { signal?: AbortSignal; fetchImpl?: FetchLike }
): Promise<{ results: RawExaResult[] }> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new ExaPluginError(
      "Add your Exa API key in Settings → Plugins before searching."
    );
  }

  const { doFetch, baseUrl } = await resolveExaFetch(options?.fetchImpl);
  let response: Response;
  try {
    response = await doFetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": cleanKey,
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ExaPluginError(
      "Could not reach Exa (api.exa.ai). Check your internet connection."
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ExaPluginError(
      `Exa rejected this API key (HTTP ${response.status}). Check your key from dashboard.exa.ai.`,
      response.status
    );
  }
  if (response.status === 429) {
    throw new ExaPluginError(
      "Exa rate limit or credit quota reached (HTTP 429).",
      429
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ExaPluginError(
      `Exa returned HTTP ${response.status}${
        detail ? `: ${detail.slice(0, 160)}` : ""
      }`,
      response.status
    );
  }

  const data = (await response.json()) as { results?: unknown };
  const results = Array.isArray(data?.results)
    ? (data.results as RawExaResult[])
    : [];
  return { results };
}

export async function testExaConnection(
  apiKey: string,
  options?: { signal?: AbortSignal; fetchImpl?: FetchLike }
): Promise<{ latencyMs: number; sampleTitle: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const onAbort = () => controller.abort();
  options?.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const { results } = await exaPost(
      "/search",
      apiKey,
      {
        query: "official programming language documentation",
        type: "fast",
        numResults: 1,
      },
      { signal: controller.signal, fetchImpl: options?.fetchImpl }
    );
    const latencyMs = Math.max(1, Date.now() - start);
    const sampleTitle =
      results[0]?.title?.trim() || results[0]?.url || "Exa search verified";
    return { latencyMs, sampleTitle };
  } catch (err) {
    if ((err as Error)?.name === "AbortError" && !options?.signal?.aborted) {
      throw new ExaPluginError("Exa did not respond within 15 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener("abort", onAbort);
  }
}

export async function searchExaReferences(
  query: string,
  options?: {
    config?: Partial<ExaPluginConfig>;
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
  }
): Promise<ExaGroundedSource[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new ExaPluginError("Enter a topic or search query to ground with Exa.");
  }
  const stored = getExaPluginConfig();
  const apiKey = options?.config?.apiKey ?? stored.apiKey;
  const searchType: ExaSearchType =
    options?.config?.searchType ?? stored.searchType;
  const numResults = options?.config?.numResults ?? stored.numResults;

  const { results } = await exaPost(
    "/search",
    apiKey,
    {
      query: cleanQuery,
      type: searchType,
      numResults,
      contents: {
        text: { maxCharacters: 6500 },
        highlights: { numSentences: 4, highlightsPerUrl: 3 },
      },
    },
    { signal: options?.signal, fetchImpl: options?.fetchImpl }
  );

  const sources: ExaGroundedSource[] = [];
  const seen = new Set<string>();
  results.forEach((raw, idx) => {
    const built = toGroundedSource(raw, idx);
    if (built && !seen.has(built.id)) {
      seen.add(built.id);
      sources.push(built);
    }
  });
  return sources;
}

export async function importUrlsWithExa(
  urls: string[],
  options?: {
    config?: Partial<ExaPluginConfig>;
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
  }
): Promise<ExaGroundedSource[]> {
  if (urls.length === 0) {
    throw new ExaPluginError("Paste at least one valid https:// URL to import.");
  }
  const stored = getExaPluginConfig();
  const apiKey = options?.config?.apiKey ?? stored.apiKey;

  const { results } = await exaPost(
    "/contents",
    apiKey,
    {
      urls,
      text: { maxCharacters: 12000 },
      highlights: { numSentences: 4, highlightsPerUrl: 3 },
    },
    { signal: options?.signal, fetchImpl: options?.fetchImpl }
  );

  const sources: ExaGroundedSource[] = [];
  const seen = new Set<string>();
  results.forEach((raw, idx) => {
    const built = toGroundedSource(raw, idx);
    if (built && !seen.has(built.id)) {
      seen.add(built.id);
      sources.push(built);
    }
  });
  return sources;
}

/**
 * Unified grounding helper for New Topic:
 * - If `input` is 1–5 URLs, calls Exa `/contents` to extract clean markdown.
 * - Otherwise calls Exa `/search` to retrieve top authoritative sources.
 */
export async function fetchExaGrounding(
  input: string,
  options?: {
    config?: Partial<ExaPluginConfig>;
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
  }
): Promise<{ mode: "urls" | "search"; sources: ExaGroundedSource[] }> {
  const directUrls = parseDirectUrls(input);
  if (directUrls.length > 0) {
    const sources = await importUrlsWithExa(directUrls, options);
    return { mode: "urls", sources };
  }
  const sources = await searchExaReferences(input, options);
  return { mode: "search", sources };
}
