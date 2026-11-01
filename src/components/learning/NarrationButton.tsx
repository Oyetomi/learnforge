import React, { useEffect, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { isSpeechOutputSupported, speakNaturalText, stopNaturalSpeech } from "../../services/learning/speech";
import "./narration.css";

/** Reads only the currently displayed explanation, never an unseen answer key. */
export function NarrationButton({ text, label = "Listen", onListen }: { text: string; label?: string; onListen?: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const ownsSpeech = useRef(false);
  useEffect(() => {
    return () => { if (ownsSpeech.current) stopNaturalSpeech(); };
  }, [text]);
  if (!text.trim() || !isSpeechOutputSupported()) return null;
  const toggle = () => {
    if (ownsSpeech.current) { stopNaturalSpeech(); return; }
    setError("");
    // The previous reader's onEnd fires synchronously before this reader starts.
    stopNaturalSpeech(); ownsSpeech.current = true; setState("loading");
    let supportMarked = false;
    void speakNaturalText(text, {
      onLoading: () => setState("loading"), onStart: () => {
        setState("playing");
        if (!supportMarked) { supportMarked = true; onListen?.(); }
      },
      onEnd: () => { ownsSpeech.current = false; setState("idle"); },
      onError: (message) => setError(message || "Audio couldn't play. Try again."),
    });
  };
  return <span className="narration-control">
    <button type="button" className="narration-button" aria-pressed={state !== "idle"}
      aria-label={state === "idle" ? label : "Stop reading aloud"} onClick={toggle}>
      {state === "loading" ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : state === "playing" ?
        <Square size={12} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
      {state === "loading" ? "Preparing audio… · Stop" : state === "playing" ? "Stop audio" : label}
    </button>
    {error && <span className="narration-error" role="alert">{error}</span>}
  </span>;
}
