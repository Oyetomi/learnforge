/**
 * Natural Tutor Speech (TTS) & Multi-Engine Voice Dictation (STT) Service.
 *
 * Fixes two systemic macOS / WebView audio failures:
 *   1. TTS: Blocks macOS MacInTalk novelty joke voices (`Albert`, `Fred`,
 *      `Zarvox`, `Boing`, `Bad News`, etc.) that WebKit picks alphabetically
 *      by default, formats math/code into natural spoken English, and routes
 *      through OpenAI neural TTS (when an OpenAI key is configured), native
 *      macOS `AVSpeechSynthesizer` (Premium/Enhanced/`Samantha`), or ranked
 *      browser voices.
 *   2. STT: Uses native macOS `AVAudioEngine` + `SFSpeechRecognizer` inside
 *      Tauri (`LearnForge.app`), streaming Web Speech (`interimResults: true`)
 *      in supporting browsers, and `MediaRecorder` + Whisper fallback when
 *      Web Speech is unavailable or blocked.
 */

import { loadAIConnection } from "../ai/connection";

export interface VoiceRecordingStatus {
  active: boolean;
  transcript: string;
  isFinal: boolean;
  level: number;
  error: string;
}

const NOVELTY_VOICE_PREFIXES = [
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "eddy",
  "flo",
  "fred",
  "good news",
  "grandma",
  "grandpa",
  "hysterical",
  "jester",
  "junior",
  "organ",
  "pipe organ",
  "princess",
  "ralph",
  "reed",
  "rocko",
  "sandy",
  "shelley",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
] as const;

export function isNoveltyVoiceName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower) return true;
  return NOVELTY_VOICE_PREFIXES.some(
    (prefix) =>
      lower === prefix ||
      lower.startsWith(`${prefix} `) ||
      lower.startsWith(`${prefix}(`)
  );
}

export function isTauriDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Converts Markdown, inline code, and mathematical notation into calm,
 * natural spoken English so TTS never reads backslashes, braces, or raw code
 * punctuation out loud.
 */
export function formatTextForSpeech(raw: string): string {
  if (!raw) return "";
  let s = raw;

  // Omit multi-line fenced code blocks from spoken narration
  s = s.replace(/```[\s\S]*?```/g, " ");

  // Unwrap display and inline math delimiters while keeping expressions
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, " $1 ");
  s = s.replace(/\$([^$]+)\$/g, " $1 ");

  // Common LaTeX constructs -> natural English words
  s = s.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, " $1 over $2 ");
  s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, " square root of $1 ");
  s = s.replace(
    /\\(?:text|mathrm|operatorname|mathbf|mathit|mathsf|mathtt)\s*\{([^{}]+)\}/g,
    " $1 "
  );
  s = s.replace(/\\(?:iff|Longleftrightarrow|Leftrightarrow)\b/g, " means ");
  s = s.replace(/\\(?:implies|Rightarrow)\b/g, " leads to ");
  s = s.replace(/\\(?:to|rightarrow|mapsto)\b/g, " to ");
  s = s.replace(/\\(?:subseteq|subset)\b/g, " is part of ");
  s = s.replace(/\\in\b/g, " in ");
  s = s.replace(/\\models\b/g, " satisfies ");
  s = s.replace(/\\(?:neq|ne)\b/g, " does not equal ");
  s = s.replace(/\\(?:geq|ge)\b/g, " is at least ");
  s = s.replace(/\\(?:leq|le)\b/g, " is at most ");
  s = s.replace(/\\(?:approx|sim)\b/g, " is approximately ");
  s = s.replace(/\\(?:times|cdot)\b/g, " times ");

  // Clean inline code spans: drop brace bodies and noisy punctuation
  s = s.replace(/`([^`]+)`/g, (_m, code: string) => {
    return (
      " " +
      code
        .replace(/\{[^}]*\}/g, " ")
        .replace(/\(\)/g, " ")
        .replace(/:=/g, " equals ")
        .replace(/!==|!=/g, " not equal ")
        .replace(/===|==/g, " equals ")
        .replace(/=>|->/g, " to ")
        .replace(/[{}[\];]/g, " ") +
      " "
    );
  });

  // Unicode math & arrow symbols
  s = s
    .replace(/<=>|⇔/g, " means ")
    .replace(/=>|⇒/g, " leads to ")
    .replace(/->|→/g, " to ")
    .replace(/⊆/g, " is part of ")
    .replace(/∈/g, " in ")
    .replace(/⊨/g, " satisfies ")
    .replace(/≠/g, " does not equal ")
    .replace(/≥/g, " is at least ")
    .replace(/≤/g, " is at most ")
    .replace(/≈/g, " is approximately ");

  // Strip remaining LaTeX commands, markdown emphasis, and stray braces
  s = s
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[*_~#>{}[\]\\^]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:?!])/g, "$1")
    .trim();

  return s;
}

export interface BrowserVoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

export function pickBestBrowserVoice<T extends BrowserVoiceLike>(
  voices: readonly T[],
  requestedLang = "en-US"
): T | null {
  if (!voices.length) return null;
  const langPrefix = (requestedLang.slice(0, 2) || "en").toLowerCase();
  const exactLang = requestedLang.toLowerCase();

  let best: T | null = null;
  let bestScore = -1000;

  for (const v of voices) {
    const vLang = (v.lang || "").toLowerCase();
    if (!vLang.startsWith(langPrefix)) continue;
    if (isNoveltyVoiceName(v.name)) continue;

    let score = 0;
    const lower = v.name.toLowerCase();

    if (lower.includes("premium") || lower.includes("natural")) score += 260;
    else if (lower.includes("enhanced") || lower.includes("neural")) score += 200;
    else if (lower.includes("siri")) score += 180;
    else if (lower.includes("google us english") || lower.includes("google uk english"))
      score += 170;

    if (lower.includes("ava")) score += 110;
    else if (lower.includes("zoe") || lower.includes("zoë")) score += 105;
    else if (lower.includes("allison")) score += 100;
    else if (lower.includes("aria") || lower.includes("jenny")) score += 98;
    else if (lower.includes("samantha")) score += 95;
    else if (lower.includes("serena")) score += 90;
    else if (lower.includes("daniel")) score += 88;
    else if (lower.includes("karen") || lower.includes("moira")) score += 82;

    if (vLang === exactLang) score += 25;
    else if (vLang === "en-us" || vLang === "en-gb") score += 12;

    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  return best;
}

async function waitForBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return existing;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    setTimeout(finish, 260);
  });
}

let activeAudioElement: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeTtsAbort: AbortController | null = null;
let activeTauriPollTimer: number | null = null;
let activeUtteranceId = 0;

function cleanupAudioElement() {
  if (activeTauriPollTimer !== null && typeof window !== "undefined") {
    window.clearInterval(activeTauriPollTimer);
    activeTauriPollTimer = null;
  }
  if (activeTtsAbort) {
    activeTtsAbort.abort();
    activeTtsAbort = null;
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.src = "";
    } catch {}
    activeAudioElement = null;
  }
  if (activeAudioUrl) {
    try {
      URL.revokeObjectURL(activeAudioUrl);
    } catch {}
    activeAudioUrl = null;
  }
}

export function stopNaturalSpeech(): void {
  activeUtteranceId += 1;
  cleanupAudioElement();
  if (isTauriDesktopRuntime()) {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("speech_stop"))
      .catch(() => {});
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

async function trySpeakWithOpenAI(
  cleanText: string,
  utteranceId: number,
  onEnd?: () => void
): Promise<boolean> {
  const conn = loadAIConnection();
  const isOpenAI =
    conn.provider === "openai" &&
    conn.apiKey.trim().startsWith("sk-") &&
    conn.url.includes("api.openai.com");
  if (!isOpenAI || typeof Audio === "undefined") return false;

  const controller = new AbortController();
  activeTtsAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    let doFetch: typeof fetch = fetch;
    if (isTauriDesktopRuntime()) {
      try {
        const mod = await import("@tauri-apps/plugin-http");
        doFetch = mod.fetch as unknown as typeof fetch;
      } catch {}
    }

    const res = await doFetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conn.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova",
        input: cleanText.slice(0, 3800),
        response_format: "mp3",
      }),
      signal: controller.signal,
    });
    if (!res.ok || utteranceId !== activeUtteranceId) return false;
    const blob = await res.blob();
    if (utteranceId !== activeUtteranceId) return true;

    const url = URL.createObjectURL(blob);
    activeAudioUrl = url;
    const audio = new Audio(url);
    activeAudioElement = audio;
    audio.onended = () => {
      if (utteranceId === activeUtteranceId) {
        cleanupAudioElement();
        onEnd?.();
      }
    };
    audio.onerror = () => {
      if (utteranceId === activeUtteranceId) {
        cleanupAudioElement();
        onEnd?.();
      }
    };
    await audio.play();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    if (activeTtsAbort === controller) activeTtsAbort = null;
  }
}

export function isSpeechOutputSupported(): boolean {
  if (typeof window === "undefined") return false;
  return isTauriDesktopRuntime() || "speechSynthesis" in window;
}

export async function speakNaturalText(
  rawText: string,
  options?: {
    lang?: string;
    onEnd?: () => void;
    onError?: () => void;
  }
): Promise<void> {
  stopNaturalSpeech();
  const cleanText = formatTextForSpeech(rawText);
  if (!cleanText) {
    options?.onEnd?.();
    return;
  }

  const utteranceId = ++activeUtteranceId;
  const lang =
    options?.lang ||
    (typeof navigator !== "undefined" && navigator.language) ||
    "en-US";

  // 1. Studio neural TTS when user has an OpenAI key active
  const playedOpenAI = await trySpeakWithOpenAI(
    cleanText,
    utteranceId,
    options?.onEnd
  );
  if (playedOpenAI || utteranceId !== activeUtteranceId) return;

  // 2. Native macOS AVSpeechSynthesizer (blocks novelty voices like Albert!)
  if (isTauriDesktopRuntime()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("speech_speak", { text: cleanText, lang });
      if (utteranceId !== activeUtteranceId) return;
      let seenSpeaking = false;
      let ticks = 0;
      activeTauriPollTimer = window.setInterval(async () => {
        if (utteranceId !== activeUtteranceId) {
          cleanupAudioElement();
          return;
        }
        ticks += 1;
        try {
          const speaking = await invoke<boolean>("speech_is_speaking");
          if (speaking) {
            seenSpeaking = true;
          } else if (seenSpeaking || ticks > 6) {
            cleanupAudioElement();
            options?.onEnd?.();
          }
        } catch {
          cleanupAudioElement();
          options?.onEnd?.();
        }
      }, 240);
      return;
    } catch {
      // Fall through to browser speechSynthesis if native invoke unavailable
    }
  }

  // 3. Browser speechSynthesis with novelty voice blocklist & ranked natural voices
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const voices = await waitForBrowserVoices();
    if (utteranceId !== activeUtteranceId) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const chosen = pickBestBrowserVoice(voices, lang);
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else {
      utterance.lang = lang;
    }
    utterance.rate = 0.98;
    utterance.pitch = 1.0;
    utterance.onend = () => {
      if (utteranceId === activeUtteranceId) options?.onEnd?.();
    };
    utterance.onerror = () => {
      if (utteranceId === activeUtteranceId) {
        options?.onError?.();
        options?.onEnd?.();
      }
    };
    window.speechSynthesis.speak(utterance);
    return;
  }

  options?.onEnd?.();
}

export async function startNativeVoiceRecording(
  lang?: string
): Promise<VoiceRecordingStatus> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VoiceRecordingStatus>("voice_start_recording", {
    lang: lang || "en-US",
  });
}

export async function pollNativeVoiceRecording(): Promise<VoiceRecordingStatus> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VoiceRecordingStatus>("voice_poll_recording");
}

export async function stopNativeVoiceRecording(): Promise<VoiceRecordingStatus> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VoiceRecordingStatus>("voice_stop_recording");
}

export function canTranscribeRecordedAudioWithAI(): boolean {
  const conn = loadAIConnection();
  return (
    conn.provider === "openai" &&
    conn.apiKey.trim().startsWith("sk-") &&
    conn.url.includes("api.openai.com")
  );
}

export async function transcribeAudioBlobWithOpenAI(
  blob: Blob,
  lang?: string
): Promise<string> {
  const conn = loadAIConnection();
  if (!conn.apiKey.trim()) {
    throw new Error("Configure an OpenAI API key or use LearnForge desktop app for on-device dictation.");
  }
  const ext = blob.type.includes("mp4")
    ? "m4a"
    : blob.type.includes("ogg")
    ? "ogg"
    : "webm";
  const form = new FormData();
  form.append("file", blob, `dictation.${ext}`);
  form.append("model", "whisper-1");
  if (lang && lang.length >= 2) {
    form.append("language", lang.slice(0, 2).toLowerCase());
  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.apiKey.trim()}`,
    },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Audio transcription failed (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}
