/**
 * LearnForge Resilient AI Streaming Client
 *
 * Connects to the local proxy at http://127.0.0.1:10532/v1/chat/completions (OpenAI SSE format).
 * Features:
 * - Real-time Server-Sent Events (SSE) parsing with chunk-boundary buffering.
 * - Native AbortController support for instant cancellation.
 * - Automatic fallback recovery (gemini-3.8-flash-high -> gemini-4-argon).
 * - Socratic prompt injection with active milestone and live editor code awareness.
 * - Zero external dependencies.
 */

import { AI_CONFIG, type ChatMessage, type Milestone, type StreamOptions } from './types';
import { buildSocraticSystemPrompt, formatConversationMessages } from './prompts';

/**
 * Custom error class for AI client errors with status and model metadata
 */
export class AIClientError extends Error {
  readonly status?: number;
  readonly model: string;
  readonly isFallbackAttempt: boolean;

  constructor(message: string, model: string, status?: number, isFallbackAttempt = false) {
    super(message);
    this.name = 'AIClientError';
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
  formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: StreamOptions
): Promise<string> {
  const signal = options?.abortSignal;
  if (signal?.aborted) {
    throw new DOMException('Request aborted by user', 'AbortError');
  }

  const payload = {
    model,
    messages: formattedMessages,
    stream: true,
    temperature: options?.temperature ?? AI_CONFIG.DEFAULT_TEMPERATURE,
    ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let errorDetails = '';
    try {
      const errBody = await response.text();
      errorDetails = `: ${errBody}`;
    } catch {
      // Ignore text read error
    }
    throw new AIClientError(
      `Proxy request failed with HTTP ${response.status} (${response.statusText})${errorDetails}`,
      model,
      response.status
    );
  }

  if (!response.body) {
    throw new AIClientError('ReadableStream not supported by environment or response body is empty', model);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulatedText = '';
  let lineBuffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // Ignore cancellation errors
        }
        throw new DOMException('Request aborted by user', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? ''; // keep trailing partial line

      for (const line of lines) {
        const trimmed = line.trim();
        // Ignore empty lines and SSE ping comments
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          // Stream successfully terminated by server
          break;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.text ??
              '';

            if (delta) {
              accumulatedText += delta;
              options?.onChunk?.(delta);
            }
          } catch {
            // Malformed chunk or partial JSON line; ignore and continue stream
          }
        }
      }
    }

    // Process any residual content in buffer
    if (lineBuffer.trim().startsWith('data: ')) {
      const jsonStr = lineBuffer.trim().slice(6).trim();
      if (jsonStr && jsonStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            accumulatedText += delta;
            options?.onChunk?.(delta);
          }
        } catch {
          // Ignore
        }
      }
    }

    return accumulatedText;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams a Socratic dialogue turn from the local proxy.
 *
 * Automatically:
 * 1. Constructs the Socratic System Prompt tailored with active milestone & live code.
 * 2. Attempts streaming with the primary model (gemini-3.8-flash-high).
 * 3. If primary model fails before emitting tokens, automatically falls back to secondary model (gemini-4-argon).
 * 4. Yields incremental tokens through `options.onChunk`.
 * 5. Returns full accumulated text and triggers `options.onComplete`.
 */
export async function streamSocraticChat(
  messages: ChatMessage[],
  activeMilestone?: Milestone,
  currentCode?: string,
  options?: StreamOptions
): Promise<string> {
  const apiUrl = options?.apiUrl ?? AI_CONFIG.DEFAULT_API_URL;
  const primaryModel = options?.model ?? AI_CONFIG.DEFAULT_MODEL;
  const fallbackModel = options?.fallbackModel ?? AI_CONFIG.FALLBACK_MODEL;

  // Build Socratic prompt with active milestone context & student's current code
  const systemPrompt = buildSocraticSystemPrompt(
    activeMilestone,
    currentCode,
    activeMilestone ? undefined : undefined
  );
  const formattedMessages = formatConversationMessages(messages, systemPrompt);

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
    const result = await streamSingleModelAttempt(apiUrl, primaryModel, formattedMessages, wrappedOptions);
    options?.onComplete?.(result);
    return result;
  } catch (err: unknown) {
    // Check if user cancelled request
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }

    // If we already sent chunks to the UI or if primary and fallback are identical, cannot cleanly fallback
    if (streamedAnyChunk || primaryModel === fallbackModel) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      options?.onError?.(errorObj);
      throw errorObj;
    }

    // Attempt 2: Fallback Model
    console.warn(
      `[LearnForge AI] Primary model ${primaryModel} failed (${(err as Error).message}). Falling back to ${fallbackModel}...`
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
      if (fallbackErr instanceof DOMException && fallbackErr.name === 'AbortError') {
        throw fallbackErr;
      }
      const errorObj = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
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
  options?: Omit<StreamOptions, 'onChunk'>
): Promise<string> {
  return streamSocraticChat(messages, activeMilestone, currentCode, options);
}
