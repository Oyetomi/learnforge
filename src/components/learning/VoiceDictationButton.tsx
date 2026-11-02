import React, { useEffect, useId, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import {
  canTranscribeRecordedAudioWithAI,
  isTauriDesktopRuntime,
  transcribeAudioBlobWithOpenAI,
} from "../../services/learning/speech";

import { createNativeDictation } from "../../services/learning/nativeDictation";

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
  const statusId = useId();
  const [clientReady, setClientReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [livePreview, setLivePreview] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const modeRef = useRef<"none" | "tauri" | "webspeech" | "mediarecorder">(
    "none"
  );
  const webFinishTimer = useRef<ReturnType<typeof setTimeout> | undefined>();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const uncommittedInterimRef = useRef("");
  const nativeSessionRef = useRef<ReturnType<typeof createNativeDictation> | null>(null);
  const mounted = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);


  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const showError = (msg: string) => { if (mounted.current) { setErrorMsg(msg); setStatusMsg(""); } };

  const cleanupTimersAndStreams = () => {
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
    mounted.current = true;
    const hasSupport =
      isTauriDesktopRuntime() ||
      Boolean(getSpeechRecognitionCtor()) ||
      canUseMediaRecorder();
    setClientReady(hasSupport);

    return () => {
      mounted.current = false;
      clearTimeout(webFinishTimer.current);
      nativeSessionRef.current?.dispose();
      nativeSessionRef.current = null;
      cleanupTimersAndStreams();
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
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
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

        if (!mounted.current) return;
        if (chunks.length === 0) { showError("No audio was captured. Check your microphone and try again."); return; }
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 200) { showError("The recording was too short. Try speaking for a little longer."); return; }

        setTranscribing(true);
        try {
          const text = await transcribeAudioBlobWithOpenAI(blob, currentLang());
          if (!mounted.current) return;
          if (text) { callbackRef.current(text); setStatusMsg("Dictation added. Review the text before submitting."); }
          else showError("No speech was recognized. Check your microphone input and try again.");
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
    setErrorMsg(""); setStatusMsg(""); setLivePreview(""); setStarting(true);
    modeRef.current = "tauri";
    nativeSessionRef.current = createNativeDictation({
      status: status => {
        setStarting(status.phase === "starting");
        setListening(status.active);
        setTranscribing(status.phase === "finishing");
        setAudioLevel(status.level || 0);
        setLivePreview(status.transcript);
        setStatusMsg(status.phase === "starting" ? "Preparing microphone… Allow access if macOS asks." :
          status.phase === "finishing" ? "Finishing your words…" :
          "Listening. Speak, then choose Finish to add the text. It won’t submit the field.");
      },
      transcript: text => { callbackRef.current(text); setStatusMsg("Dictation added. Review the text before submitting."); },
      error: showError,
      end: () => {
        modeRef.current = "none"; setStarting(false); setListening(false); setTranscribing(false);
        setAudioLevel(0); setLivePreview("");
      },
    });
    await nativeSessionRef.current.start(currentLang());
  };

  const stopActiveDictation = async () => {
    const activeMode = modeRef.current;
    if (activeMode === "tauri") {
      setStarting(false); setTranscribing(true); setStatusMsg(starting ? "Dictation cancelled." : "Finishing your words…");
      await nativeSessionRef.current?.finish();
      return;
    }
    if (activeMode !== "webspeech") modeRef.current = "none";

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
      setTranscribing(true); setListening(false); setStatusMsg("Finishing your words…");
      const recognition = recognitionRef.current;
      try { recognition.stop(); } catch { recognition.onend?.(); }
      webFinishTimer.current = setTimeout(() => {
        if (modeRef.current !== "webspeech") return;
        recognition.onend?.();
        try { recognition.abort(); } catch {}
      }, 4000);
    }
  };

  const toggleListening = () => {
    if (disabled || transcribing) return;
    if (listening || starting) {
      void stopActiveDictation();
      return;
    }

    setErrorMsg(""); setStatusMsg("");

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
        if (modeRef.current !== "webspeech") return;
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
        if (!mounted.current || modeRef.current !== "webspeech") return;
        clearTimeout(webFinishTimer.current);
        setTranscribing(false);
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
        } else if (code === "no-speech") {
          showError("No speech was recognized. Check your microphone input and try again.");
        } else if (code && code !== "aborted") {
          showError(`Voice dictation stopped (${code}).`);
        }
      };

      recognition.onend = () => {
        if (modeRef.current !== "webspeech") return;
        clearTimeout(webFinishTimer.current); setTranscribing(false); setStatusMsg("");
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
    <span className={`voice-dictation-wrap ${compact ? "is-compact" : ""}`}>
      <button
        type="button"
        className={`voice-dictation-button ${listening ? "is-listening" : ""} ${
          compact ? "is-compact" : ""
        }`}
        onClick={toggleListening}
        disabled={disabled || transcribing}
        aria-pressed={listening || starting}
        aria-describedby={(starting || listening || transcribing || statusMsg || errorMsg) ? statusId : undefined}
        aria-label={
          transcribing
            ? "Finishing dictation"
            : starting ? "Cancel microphone setup"
            : listening
            ? "Finish dictation and add text"
            : label
        }
        title={listening ? "Finish dictation and add the text to this field" : label}
      >
        {transcribing || starting ? (
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
        {(!compact || listening || starting || transcribing) && (
          <span>
            {transcribing
              ? "Finishing…"
              : starting ? "Cancel"
              : listening ? "Finish"
              : errorMsg ? "Try dictation again" : "Dictate"}
          </span>
        )}
      </button>
      {(starting || listening || transcribing || statusMsg) && !errorMsg && (
        <span id={statusId} className="voice-dictation-status" role="status" aria-live="polite">
          {livePreview ? <><span className="voice-dictation-preview">{livePreview}</span><br /></> : null}
          {statusMsg || "Listening. Speak, then choose Finish to add the text."}
          {listening && !starting && !transcribing && modeRef.current === "tauri" &&
            <meter className="voice-input-meter" min={0} max={1} value={audioLevel} aria-label="Microphone input level" />}
        </span>
      )}
      {errorMsg && <span id={statusId} className="voice-dictation-error" role="alert">{errorMsg}</span>}
    </span>
  );
};
