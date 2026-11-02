import { pollNativeVoiceRecording, startNativeVoiceRecording, stopNativeVoiceRecording, type VoiceRecordingStatus } from "./speech";

interface Bridge {
  start(lang: string): Promise<VoiceRecordingStatus>;
  poll(): Promise<VoiceRecordingStatus>;
  stop(): Promise<VoiceRecordingStatus>;
}
interface Events {
  status(value: VoiceRecordingStatus): void;
  transcript(text: string): void;
  error(message: string): void;
  end(): void;
}
const bridge: Bridge = { start: startNativeVoiceRecording, poll: pollNativeVoiceRecording, stop: stopNativeVoiceRecording };
let activeOwner: (() => void) | undefined;
const EMPTY = "No speech was recognized. Check your microphone input and try again.";

/** One capture, one insertion. Finish drains recognition instead of discarding final words. */
export function createNativeDictation(events: Events, api: Bridge = bridge) {
  let disposed = false, ended = false, finishing = false, cancelled = false, lastText = "";
  let lastPhase: VoiceRecordingStatus["phase"];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(timer); clearTimeout(deadline); };
  const complete = (error?: string) => {
    if (disposed || ended) return;
    ended = true; clear();
    if (activeOwner === supersede) activeOwner = undefined;
    if (lastText.trim()) events.transcript(lastText.trim());
    if (error) events.error(error);
    events.end();
  };
  const supersede = () => complete("Dictation moved to another field. Any recognized words were kept.");
  const accept = (status: VoiceRecordingStatus) => {
    if (disposed || ended) return;
    if (status.transcript.trim()) lastText = status.transcript;
    lastPhase = status.phase || (status.active ? "listening" : "idle");
    if (status.active && !status.isFinal && !status.error) events.status(finishing ? { ...status, phase: "finishing" } : status);
    if (status.error || !status.active || status.isFinal) {
      complete(status.error || (!lastText.trim() && !cancelled ? EMPTY : undefined));
    }
  };
  const poll = async () => {
    try { accept(await api.poll()); }
    catch { if (disposed || ended) return; complete("Dictation lost its connection to macOS. Try again. Any recognized words were kept."); void api.stop().catch(() => {}); }
    if (!disposed && !ended) timer = setTimeout(() => void poll(), 150);
  };
  return {
    async start(lang: string) {
      if (disposed || ended) return;
      activeOwner?.();
      activeOwner = supersede;
      deadline = setTimeout(() => {
        complete("Dictation took too long. Check microphone and Speech Recognition permissions, then try again.");
        void api.stop().catch(() => {});
      }, 90_000);
      try {
        accept(await api.start(lang));
        if (!disposed && !ended) timer = setTimeout(() => void poll(), 150);
      } catch (error) { complete(typeof error === "string" ? error : "Could not start macOS dictation. Check microphone permissions and try again."); }
    },
    async finish() {
      if (disposed || ended || finishing) return;
      finishing = true;
      cancelled = lastPhase === "starting" || lastPhase === undefined;
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        complete(lastText.trim() || cancelled ? undefined : EMPTY);
        void api.stop().catch(() => {});
      }, 8_000);
      try { accept(await api.stop()); }
      catch { complete("Couldn’t finish dictation. Any recognized words were kept. Try again."); }
      // Polling continues until the recognizer reports its final result.
    },
    dispose() {
      disposed = true; clear();
      if (activeOwner === supersede) activeOwner = undefined;
      if (!ended) void api.stop().catch(() => {});
    },
  };
}
