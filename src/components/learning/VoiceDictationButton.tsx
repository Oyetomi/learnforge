import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

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

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
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

interface VoiceDictationButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

/**
 * Progressive-enhancement microphone dictation button using the Web Speech API.
 * Hidden during SSR and on runtimes without SpeechRecognition so static markup
 * and non-speech environments stay completely clean.
 */
export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  onTranscript,
  disabled = false,
  label = "Dictate your thinking",
  compact = false,
}) => {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
      recognitionRef.current = null;
    };
  }, []);

  if (!supported) return null;

  const toggleListening = () => {
    if (disabled) return;
    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang =
        (typeof navigator !== "undefined" && navigator.language) || "en-US";
      recognition.onresult = (event) => {
        const chunks: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item?.isFinal && item[0]?.transcript?.trim()) {
            chunks.push(item[0].transcript.trim());
          }
        }
        if (chunks.length > 0) {
          callbackRef.current(chunks.join(" "));
        }
      };
      recognition.onerror = () => {
        setListening(false);
      };
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      className={`voice-dictation-button ${listening ? "is-listening" : ""} ${
        compact ? "is-compact" : ""
      }`}
      onClick={toggleListening}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop voice dictation" : label}
      title={listening ? "Stop voice dictation" : label}
    >
      {listening ? <MicOff size={13} /> : <Mic size={13} />}
      {!compact && <span>{listening ? "Listening…" : "Dictate"}</span>}
    </button>
  );
};
