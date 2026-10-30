import React, { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import {
  canTranscribeRecordedAudioWithAI,
  isTauriDesktopRuntime,
  pollNativeVoiceRecording,
  startNativeVoiceRecording,
  stopNativeVoiceRecording,
  transcribeAudioBlobWithOpenAI,
} from "../../services/learning/speech";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function canUseMediaRecorder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator?.mediaDevices?.getUserMedia)
  );
}

interface VoiceDictationButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

/**
 * Multi-engine voice recording & dictation control:
 *  - Desktop (`LearnForge.app`): Native macOS `AVAudioEngine` + `SFSpeechRecognizer`
 *    with on-device neural dictation, automatic punctuation, and live mic metering.
 *  - Web Browsers: Streaming Web Speech (`interimResults: true`) with automatic
 *    `MediaRecorder` fallback when Web Speech is unavailable or blocked.
 *  - SSR-safe: stays hidden during `renderToStaticMarkup` and mounts cleanly on client.
 */
export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  onTranscript,
  disabled = false,
  label = "Dictate your thinking",
  compact = false,
}) => {
  const [clientReady, setClientReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [livePreview, setLivePreview] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const modeRef = useRef<"none" | "tauri" | "webspeech" | "mediarecorder">(
    "none"
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const uncommittedInterimRef = useRef("");
  const pollTimerRef = useRef<number | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const nativeTranscriptRef = useRef("");

  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const showError = (msg: string) => {
    setErrorMsg(msg);
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setErrorMsg("");
      errorTimerRef.current = null;
    }, 6500);
  };

  const cleanupTimersAndStreams = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    const hasSupport =
      isTauriDesktopRuntime() ||
      Boolean(getSpeechRecognitionCtor()) ||
      canUseMediaRecorder();
    setClientReady(hasSupport);

    return () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
      }
      cleanupTimersAndStreams();
      if (modeRef.current === "tauri") {
        void stopNativeVoiceRecording().catch(() => {});
      }
      try {
        recognitionRef.current?.abort();
      } catch {}
      recognitionRef.current = null;
      modeRef.current = "none";
    };
  }, []);

  if (!clientReady) return null;

  const currentLang = () =>
    (typeof navigator !== "undefined" && navigator.language) || "en-US";

  const startMediaRecorderFallback = async () => {
    if (!canUseMediaRecorder()) {
      showError(
        "Voice recording is unavailable in this browser. Open LearnForge.app for native macOS dictation."
      );
      setListening(false);
      return;
    }
    if (!canTranscribeRecordedAudioWithAI()) {
      showError(
        "This browser disables Web Speech dictation. Use LearnForge.app for free on-device macOS dictation, or connect an OpenAI API key."
      );
      setListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      modeRef.current = "mediarecorder";

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];
        cleanupTimersAndStreams();
        setListening(false);
        setAudioLevel(0);
        setLivePreview("");
        modeRef.current = "none";

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 200) return;

        setTranscribing(true);
        try {
          const text = await transcribeAudioBlobWithOpenAI(blob, currentLang());
          if (text) {
            callbackRef.current(text);
          }
        } catch (err) {
          showError(
            err instanceof Error
              ? err.message
              : "Could not transcribe recorded audio."
          );
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start(250);
      setListening(true);
      setLivePreview("Recording audio…");
    } catch {
      cleanupTimersAndStreams();
      setListening(false);
      modeRef.current = "none";
      showError(
        "Microphone access was blocked. Allow microphone permission for this site or use LearnForge.app."
      );
    }
  };

  const startTauriNativeDictation = async () => {
    setErrorMsg("");
    setLivePreview("");
    nativeTranscriptRef.current = "";
    modeRef.current = "tauri";

    try {
      const initial = await startNativeVoiceRecording(currentLang());
      if (initial.error) {
        modeRef.current = "none";
        setListening(false);
        showError(initial.error);
        return;
      }
      setListening(true);
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const status = await pollNativeVoiceRecording();
          setAudioLevel(status.level || 0);
          if (status.transcript) {
            nativeTranscriptRef.current = status.transcript;
            setLivePreview(status.transcript);
          }
          if (status.error) {
            cleanupTimersAndStreams();
            modeRef.current = "none";
            setListening(false);
            setAudioLevel(0);
            const captured = nativeTranscriptRef.current.trim();
            nativeTranscriptRef.current = "";
            setLivePreview("");
            if (captured) {
              callbackRef.current(captured);
            } else {
              showError(status.error);
            }
            return;
          }
          if (!status.active) {
            cleanupTimersAndStreams();
            modeRef.current = "none";
            setListening(false);
            setAudioLevel(0);
            const captured = (
              status.transcript || nativeTranscriptRef.current
            ).trim();
            nativeTranscriptRef.current = "";
            setLivePreview("");
            if (captured) {
              callbackRef.current(captured);
            }
          }
        } catch {
          cleanupTimersAndStreams();
          modeRef.current = "none";
          setListening(false);
        }
      }, 150);
    } catch (err) {
      modeRef.current = "none";
      setListening(false);
      showError(
        err instanceof Error
          ? err.message
          : "Could not start macOS microphone dictation."
      );
    }
  };

  const stopActiveDictation = async () => {
    const activeMode = modeRef.current;
    modeRef.current = "none";

    if (activeMode === "tauri") {
      cleanupTimersAndStreams();
      setListening(false);
      setAudioLevel(0);
      try {
        const finalStatus = await stopNativeVoiceRecording();
        const text = (
          finalStatus.transcript || nativeTranscriptRef.current
        ).trim();
        nativeTranscriptRef.current = "";
        setLivePreview("");
        if (text) {
          callbackRef.current(text);
        } else if (finalStatus.error) {
          showError(finalStatus.error);
        }
      } catch {
        const fallbackText = nativeTranscriptRef.current.trim();
        nativeTranscriptRef.current = "";
        setLivePreview("");
        if (fallbackText) callbackRef.current(fallbackText);
      }
      return;
    }

    if (activeMode === "mediarecorder" && mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        cleanupTimersAndStreams();
        setListening(false);
      }
      return;
    }

    if (activeMode === "webspeech" && recognitionRef.current) {
      const pending = uncommittedInterimRef.current.trim();
      uncommittedInterimRef.current = "";
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
      setListening(false);
      setLivePreview("");
      if (pending) {
        callbackRef.current(pending);
      }
    }
  };

  const toggleListening = () => {
    if (disabled || transcribing) return;
    if (listening) {
      void stopActiveDictation();
      return;
    }

    setErrorMsg("");

    // 1. Desktop App: always use native macOS AVAudioEngine + SFSpeechRecognizer
    if (isTauriDesktopRuntime()) {
      void startTauriNativeDictation();
      return;
    }

    // 2. Web Browser: try streaming Web Speech first, auto-fallback to MediaRecorder
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      void startMediaRecorderFallback();
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = currentLang();
      uncommittedInterimRef.current = "";
      modeRef.current = "webspeech";

      recognition.onresult = (event) => {
        const finalChunks: string[] = [];
        const interimChunks: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item?.[0]?.transcript?.trim() || "";
          if (!text) continue;
          if (item.isFinal) {
            finalChunks.push(text);
          } else {
            interimChunks.push(text);
          }
        }
        if (finalChunks.length > 0) {
          uncommittedInterimRef.current = "";
          callbackRef.current(finalChunks.join(" "));
        }
        const interimText = interimChunks.join(" ");
        uncommittedInterimRef.current = interimText;
        setLivePreview(interimText);
      };

      recognition.onerror = (ev) => {
        const code = ev?.error || "";
        recognitionRef.current = null;
        uncommittedInterimRef.current = "";
        setLivePreview("");

        if (code === "network" || code === "service-not-allowed") {
          // Brave / Chromium fork / Safari without cloud speech -> fallback to MediaRecorder
          void startMediaRecorderFallback();
          return;
        }
        modeRef.current = "none";
        setListening(false);
        if (code === "not-allowed") {
          showError(
            "Microphone permission was denied. Allow microphone access in your browser settings."
          );
        } else if (code && code !== "aborted" && code !== "no-speech") {
          showError(`Voice dictation stopped (${code}).`);
        }
      };

      recognition.onend = () => {
        if (modeRef.current !== "webspeech") return;
        const pending = uncommittedInterimRef.current.trim();
        uncommittedInterimRef.current = "";
        recognitionRef.current = null;
        modeRef.current = "none";
        setListening(false);
        setLivePreview("");
        if (pending) {
          callbackRef.current(pending);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      void startMediaRecorderFallback();
    }
  };

  return (
    <span className="voice-dictation-wrap">
      <button
        type="button"
        className={`voice-dictation-button ${listening ? "is-listening" : ""} ${
          compact ? "is-compact" : ""
        }`}
        onClick={toggleListening}
        disabled={disabled || transcribing}
        aria-pressed={listening}
        aria-label={
          transcribing
            ? "Transcribing voice"
            : listening
            ? "Stop voice recording"
            : label
        }
        title={
          listening
            ? livePreview
              ? `Recording: "${livePreview}" — click to insert`
              : "Recording voice — click to stop and insert"
            : label
        }
      >
        {transcribing ? (
          <Loader2 size={13} className="animate-spin" />
        ) : listening ? (
          <>
            <span
              className="voice-recording-dot"
              style={{
                transform: `scale(${1 + Math.min(0.45, audioLevel * 0.6)})`,
              }}
              aria-hidden="true"
            />
            <Square size={10} fill="currentColor" />
          </>
        ) : (
          <Mic size={13} />
        )}
        {(!compact || listening || transcribing) && (
          <span>
            {transcribing
              ? "Transcribing…"
              : listening
              ? compact
                ? "Stop"
                : "Stop & insert"
              : "Dictate"}
          </span>
        )}
      </button>
      {listening && livePreview && (
        <span className="voice-live-popover" role="status" aria-live="polite">
          {livePreview}
        </span>
      )}
      {errorMsg && (
        <span className="voice-error-popover" role="alert">
          {errorMsg}
        </span>
      )}
    </span>
  );
};
