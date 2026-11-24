/**
 * LearnForge Resilient AI Streaming Client
 *
 * Streams OpenAI-compatible chat completions (SSE) from the provider chosen in
 * Settings. Every request goes through `aiFetch()` in ./connection.
 * Features:
 * - Real-time Server-Sent Events (SSE) parsing with chunk-boundary buffering.
 * - Native AbortController support for instant cancellation.
 * - Automatic fallback to the connection's fallback model when the primary
 *   model fails before emitting tokens.
 * - Socratic prompt injection with active milestone and live editor code awareness.
 * - Zero external dependencies.
 */

import {
  AI_CONFIG,
  type ChatMessage,
  type Milestone,
  type StreamOptions,
} from "./types";
import {
  buildSocraticSystemPrompt,
  expandMultimodalMessageContent,
  formatConversationMessages,
} from "./prompts";
import {
  describeProviderError,
  AIConnectionError,
  aiFetch,
  loadAIConnection,
  recordUsage,
} from "./connection";

/**
 * Custom error class for AI client errors with status and model metadata
 */
export class AIClientError extends Error {
  readonly status?: number;
  readonly model: string;
  readonly isFallbackAttempt: boolean;

  constructor(
    message: string,
    model: string,
    status?: number,
    isFallbackAttempt = false
  ) {
    super(message);
    this.name = "AIClientError";
    this.model = model;
    this.status = status;
    this.isFallbackAttempt = isFallbackAttempt;
  }
}

/**
 * Internal single-model SSE streaming attempt
 */
async function streamSingleModelAttempt(
  apiUrl: string,
  model: string,
  formattedMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>,
  options?: StreamOptions
): Promise<string> {
  const signal = options?.abortSignal;
  if (signal?.aborted) {
    throw new DOMException("Request aborted by user", "AbortError");
  }

  const payload = {
    model,
    messages: formattedMessages.map((m) =>
      m.role === "user"
        ? { role: m.role, content: expandMultimodalMessageContent(m.content) }
        : m
    ),
    stream: true,
    temperature: options?.temperature ?? AI_CONFIG.DEFAULT_TEMPERATURE,
    ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };

  const response = await aiFetch(payload, {
    signal,
    stream: true,
    connection: { ...loadAIConnection(), url: apiUrl },
  });

  if (!response.ok) {
    let errorDetails = "";
    try {
      const errBody = await response.text();
      errorDetails = `: ${errBody}`;
    } catch {
      // Ignore text read error
    }
    throw new AIClientError(
      describeProviderError(response.status, errorDetails.replace(/^: /, ""), model),
      model,
      response.status
    );
  }

  if (!response.body) {
    throw new AIClientError(
      "ReadableStream not supported by environment or response body is empty",
      model
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulatedText = "";
  let lineBuffer = "";
  let streamUsage: { prompt_tokens?: number; completion_tokens?: number } | null =
    null;

  const processLine = (line: string): boolean => {
    const trimmed = line.trim();
    // Ignore empty lines and SSE ping comments
    if (!trimmed || trimmed.startsWith(":")) return false;
    if (!trimmed.startsWith("data:")) return false;

    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr) return false;
    if (jsonStr === "[DONE]") return true;

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.usage) streamUsage = parsed.usage;
      const delta =
        parsed.choices?.[0]?.delta?.content ??
        parsed.choices?.[0]?.text ??
        "";

      if (delta) {
        accumulatedText += delta;
        options?.onChunk?.(delta);
      }
    } catch {
      // Malformed chunk or partial JSON line; ignore and continue stream
    }
    return false;
  };

  try {
    let streamDone = false;
    while (!streamDone) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // Ignore cancellation errors
        }
        throw new DOMException("Request aborted by user", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? ""; // keep trailing partial line

      for (const line of lines) {
        if (processLine(line)) {
          streamDone = true;
          try {
            await reader.cancel();
          } catch {
            // Ignore cancellation errors
          }
          break;
        }
      }
    }

    // Flush any trailing UTF-8 bytes and residual buffered lines
    lineBuffer += decoder.decode();
    if (!streamDone && lineBuffer.trim()) {
      for (const line of lineBuffer.split("\n")) {
        if (processLine(line)) break;
      }
    }

    recordUsage(streamUsage, {
      prompt: formattedMessages
        .map((m) => m.content.replace(/data:image\/[^)\s]+/g, "[image]"))
        .join("\n"),
      completion: accumulatedText,
    });
    return accumulatedText;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams a Socratic dialogue turn from the configured AI provider.
 *
 * Automatically:
 * 1. Constructs the Socratic System Prompt tailored with active milestone & live code.
 * 2. Attempts streaming with the connection's primary model.
 * 3. If the primary model fails before emitting tokens, falls back to the connection's fallback model.
 * 4. Yields incremental tokens through `options.onChunk`.
 * 5. Returns full accumulated text and triggers `options.onComplete`.
 */
export async function streamSocraticChat(
  messages: ChatMessage[],
  activeMilestone?: Milestone,
  currentCode?: string,
  options?: StreamOptions
): Promise<string> {
  const connection = loadAIConnection();
  const apiUrl = options?.apiUrl ?? connection.url;
  const primaryModel = options?.model ?? connection.model;
  const fallbackModel = options?.fallbackModel ?? connection.fallbackModel;

  // Build Socratic prompt with active milestone context & student's current code
  const systemPrompt = buildSocraticSystemPrompt(
    activeMilestone,
    currentCode,
    options?.language || undefined,
    options?.activeCheck,
    [...messages].reverse().find((message) => message.role === "user")?.content || ""
  );
  const formattedMessages = formatConversationMessages(
    messages,
    systemPrompt,
    activeMilestone
  );

  let streamedAnyChunk = false;
  const wrappedOptions: StreamOptions = {
    ...options,
    onChunk: (chunk: string) => {
      streamedAnyChunk = true;
      options?.onChunk?.(chunk);
    },
  };

  try {
    // Attempt 1: Primary Model
    const result = await streamSingleModelAttempt(
      apiUrl,
      primaryModel,
      formattedMessages,
      wrappedOptions
    );
    options?.onComplete?.(result);
    return result;
  } catch (err: unknown) {
    // Check if user cancelled request
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }

    // If we already sent chunks to the UI, the provider itself is unreachable/misconfigured,
    // or primary and fallback are identical, we cannot cleanly fallback
    if (
      streamedAnyChunk ||
      primaryModel === fallbackModel ||
      err instanceof AIConnectionError
    ) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      options?.onError?.(errorObj);
      throw errorObj;
    }

    // Attempt 2: Fallback Model
    console.warn(
      `[LearnForge AI] Primary model ${primaryModel} failed (${
        (err as Error).message
      }). Falling back to ${fallbackModel}...`
    );

    try {
      const fallbackResult = await streamSingleModelAttempt(
        apiUrl,
        fallbackModel,
        formattedMessages,
        wrappedOptions
      );
      options?.onComplete?.(fallbackResult);
      return fallbackResult;
    } catch (fallbackErr: unknown) {
      if (
        fallbackErr instanceof DOMException &&
        fallbackErr.name === "AbortError"
      ) {
        throw fallbackErr;
      }
      const errorObj =
        fallbackErr instanceof Error
          ? fallbackErr
          : new Error(String(fallbackErr));
      options?.onError?.(errorObj);
      throw errorObj;
    }
  }
}

/**
 * Non-streaming convenience function for Socratic completion
 */
export async function sendSocraticChat(
  messages: ChatMessage[],
  activeMilestone?: Milestone,
  currentCode?: string,
  options?: Omit<StreamOptions, "onChunk">
): Promise<string> {
  return streamSocraticChat(messages, activeMilestone, currentCode, options);
}
