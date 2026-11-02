import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNativeDictation } from "../nativeDictation";
import type { VoiceRecordingStatus } from "../speech";
const status = (patch: Partial<VoiceRecordingStatus> = {}): VoiceRecordingStatus => ({ active: true, phase: "listening", transcript: "", isFinal: false, level: .2, error: "", ...patch });
function setup() {
  const api = { start: vi.fn().mockResolvedValue(status()), stop: vi.fn().mockResolvedValue(status({phase:"finishing"})), poll: vi.fn().mockResolvedValue(status()) };
  const events = { status: vi.fn(), transcript: vi.fn(), error: vi.fn(), end: vi.fn() };
  return {api, events, session: createNativeDictation(events, api)};
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe("native dictation completion", () => {
  it("waits for words that arrive after Finish instead of returning an empty recording", async () => {
    const {api,events,session} = setup();
    await session.start("en-GB"); await session.finish();
    expect(events.transcript).not.toHaveBeenCalled();
    api.poll.mockResolvedValue(status({active:false,isFinal:true,phase:"idle",transcript:"Words that arrived after stopping."}));
    await vi.advanceTimersByTimeAsync(150);
    expect(events.transcript).toHaveBeenCalledExactlyOnceWith("Words that arrived after stopping.");
    expect(events.end).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(events.transcript).toHaveBeenCalledTimes(1);
    expect(events.error).not.toHaveBeenCalled();
  });
  it("keeps the finishing state if an earlier poll arrives after Finish", async () => {
    const {api,events,session} = setup();
    await session.start("en-US"); await session.finish();
    api.poll.mockResolvedValue(status({phase:"listening",transcript:"Earlier partial"}));
    await vi.advanceTimersByTimeAsync(150);
    expect(events.status.mock.calls.at(-1)?.[0].phase).toBe("finishing");
    expect(events.transcript).not.toHaveBeenCalled();
  });
  it("retains partial words if finalization times out", async () => {
    const {api,events,session} = setup();
    api.start.mockResolvedValue(status({transcript:"Partial words"}));
    await session.start("en-US"); await session.finish();
    await vi.advanceTimersByTimeAsync(8000);
    expect(events.transcript).toHaveBeenCalledExactlyOnceWith("Partial words");
    expect(events.end).toHaveBeenCalledTimes(1);
    expect(events.error).not.toHaveBeenCalled();
  });
  it("uses the final corrected phrase instead of appending partial and final copies", async () => {
    const {api,events,session} = setup();
    api.start.mockResolvedValue(status({transcript:"Two group"}));
    await session.start("en-US"); await session.finish();
    api.poll.mockResolvedValue(status({active:false,isFinal:true,phase:"idle",transcript:"Two groups of three."}));
    await vi.advanceTimersByTimeAsync(150);
    expect(events.transcript).toHaveBeenCalledExactlyOnceWith("Two groups of three.");
  });
  it("makes an empty finish recoverable with a microphone error", async () => {
    const {events,session} = setup();
    await session.start("en-US"); await session.finish();
    await vi.advanceTimersByTimeAsync(8000);
    expect(events.transcript).not.toHaveBeenCalled();
    expect(events.error).toHaveBeenCalledWith(expect.stringContaining("No speech was recognized"));
    expect(events.end).toHaveBeenCalledTimes(1);
  });
  it("cancels permission setup without an empty-recording error", async () => {
    const {api,events,session} = setup();
    api.start.mockResolvedValue(status({phase:"starting"}));
    api.stop.mockResolvedValue(status({active:false,isFinal:true,phase:"idle"}));
    await session.start("en-US"); await session.finish();
    expect(events.error).not.toHaveBeenCalled();
    expect(events.end).toHaveBeenCalledTimes(1);
  });
  it("preserves captured words and shows an error when polling fails", async () => {
    const {api,events,session} = setup();
    api.start.mockResolvedValue(status({transcript:"Keep these words"}));
    api.poll.mockRejectedValue(new Error("bridge offline"));
    await session.start("en-US"); await vi.advanceTimersByTimeAsync(150);
    expect(events.transcript).toHaveBeenCalledWith("Keep these words");
    expect(events.error).toHaveBeenCalledWith(expect.stringContaining("lost its connection"));
    expect(api.stop).toHaveBeenCalledTimes(1);
  });
  it("ignores results after navigating away, without inserting into another answer", async () => {
    const {api,events,session} = setup();
    let resolve!: (value: VoiceRecordingStatus) => void;
    api.poll.mockImplementation(() => new Promise(r => {resolve=r;}));
    await session.start("en-US"); await vi.advanceTimersByTimeAsync(150);
    session.dispose(); resolve(status({active:false,isFinal:true,transcript:"Old answer"}));
    await vi.advanceTimersByTimeAsync(150);
    expect(events.transcript).not.toHaveBeenCalled();
    expect(events.end).not.toHaveBeenCalled();
  });
  it("routes the native microphone to one field at a time", async () => {
    const first = setup(), second = setup();
    await first.session.start("en-US");
    await second.session.start("en-US");
    expect(first.events.end).toHaveBeenCalledTimes(1);
    first.api.poll.mockResolvedValue(status({active:false,isFinal:true,transcript:"Other field"}));
    second.api.poll.mockResolvedValue(status({active:false,isFinal:true,transcript:"The current field"}));
    await vi.advanceTimersByTimeAsync(150);
    expect(first.events.transcript).not.toHaveBeenCalled();
    expect(second.events.transcript).toHaveBeenCalledExactlyOnceWith("The current field");
  });
  it("reports a permission failure immediately without claiming to be listening", async () => {
    const {api,events,session} = setup();
    api.start.mockResolvedValue(status({active:false,error:"Microphone permission denied"}));
    await session.start("en-US");
    expect(events.status).not.toHaveBeenCalled();
    expect(events.error).toHaveBeenCalledWith("Microphone permission denied");
    expect(events.end).toHaveBeenCalledTimes(1);
  });
});
