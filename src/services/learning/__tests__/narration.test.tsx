import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheNarration, cachedNarration, DEFAULT_NARRATION, loadNarrationPreferences, saveNarrationPreferences,
  speechChunks, storeNarrationKey, narrationKeyConfigured, NARRATION_PREFERENCES_KEY } from "../narration";
import { formatTextForSpeech, speakNaturalText, stopNaturalSpeech } from "../speech";
import { NarrationButton } from "../../../components/learning/NarrationButton";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
let saved: Map<string, string>, audioCreated: number;
beforeEach(() => {
  saved = new Map(); audioCreated = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value) });
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:authored-audio");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("Audio", class {
    onended?: () => void; onerror?: () => void; src = "";
    constructor(_: string) { audioCreated++; }
    pause() {}
    async play() { queueMicrotask(() => this.onended?.()); }
  });
  invoke.mockReset();
  invoke.mockImplementation(async (command: string) => command === "narration_key_status" ? true : command === "narration_generate" ? [1, 2, 3] : undefined);
});
afterEach(async () => { stopNaturalSpeech(); await Promise.resolve(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("narration privacy and boundaries", () => {
  it("sends credentials only to the native Keychain command, never preferences", async () => {
    const fake = "sk_authored_test_key_not_a_credential";
    await storeNarrationKey(fake);
    expect(invoke).toHaveBeenCalledWith("narration_store_key", { key: fake });
    saveNarrationPreferences({ ...DEFAULT_NARRATION, apiKey: fake } as typeof DEFAULT_NARRATION);
    expect([...saved.values()].join("")).not.toContain(fake);
    expect(await narrationKeyConfigured()).toBe(true);
    expect(loadNarrationPreferences()).toEqual(DEFAULT_NARRATION);
  });
  it("does not offer native key storage in a browser and rejects malformed saved preferences", async () => {
    vi.stubGlobal("window", {});
    await expect(storeNarrationKey("authored")).rejects.toThrow("Mac app");
    expect(await narrationKeyConfigured()).toBe(false);
    saved.set(NARRATION_PREFERENCES_KEY, JSON.stringify({ provider: "unknown", voiceId: "../host", modelId: "unrecognized" }));
    expect(loadNarrationPreferences()).toEqual(DEFAULT_NARRATION);
  });
  it("omits pending answer keys, raw code and private source citation metadata from narration", () => {
    const spoken = formatTextForSpeech('One visible idea.\n```go\nprivateImplementation()\n```\n```forge-check\n{"expectedAnswer":"UNSEEN ANSWER"}\n```');
    expect(spoken).toBe("One visible idea.");
    expect(spoken).not.toContain("UNSEEN");
  });
  it("preserves long text and Unicode across bounded chunks without silent truncation", () => {
    const text = ("A complete sentence about fractions. " + "🙂 ".repeat(12)).repeat(80).trim();
    const chunks = speechChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 1400)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
    const cjk = "文字🙂".repeat(1400);
    expect(speechChunks(cjk).join("")).toBe(cjk);
    expect(speechChunks("Short explanation", 0)).toEqual(["Short explanation"]);
  });
});

describe("on-demand playback", () => {
  it("does not generate audio just by rendering a Listen control", () => {
    const html = renderToStaticMarkup(<NarrationButton text="An authored explanation" label="Listen to lesson" />);
    expect(html).toContain("Listen to lesson");
    expect(invoke).not.toHaveBeenCalled();
    expect(audioCreated).toBe(0);
  });
  it("plays every chunk in order, then reuses matching audio and invalidates it when the voice changes", async () => {
    const text = "A unique authored example explains the meaning of each fraction. ".repeat(60);
    const end = vi.fn();
    await speakNaturalText(text, { onEnd: end });
    const generated = invoke.mock.calls.filter(([command]) => command === "narration_generate");
    expect(generated.map(([, payload]) => payload.text)).toEqual([...new Set(speechChunks(text.trim()))]);
    expect(end).toHaveBeenCalledTimes(1);
    expect(audioCreated).toBe(speechChunks(text.trim()).length);
    invoke.mockClear();
    await speakNaturalText(text);
    expect(invoke.mock.calls.filter(([c]) => c === "narration_generate")).toHaveLength(0);
    saveNarrationPreferences({ ...DEFAULT_NARRATION, voiceId: "different_voice" });
    await speakNaturalText(text);
    expect(invoke.mock.calls.filter(([c]) => c === "narration_generate")).toHaveLength(generated.length);
  });
  it("stops during generation without starting playback or requesting later chunks", async () => {
    let finish!: (bytes: number[]) => void;
    invoke.mockImplementation((command: string) => command === "narration_key_status" ? Promise.resolve(true) :
      command === "narration_generate" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve());
    const speaking = speakNaturalText("Cancel this authored explanation. ".repeat(100));
    await vi.waitFor(() => expect(finish).toBeDefined());
    stopNaturalSpeech(); finish([1, 2, 3]); await speaking;
    await vi.waitFor(() => expect(invoke.mock.calls.some(([c]) => c === "narration_cancel")).toBe(true));
    expect(audioCreated).toBe(0);
    expect(invoke.mock.calls.filter(([c]) => c === "narration_generate")).toHaveLength(1);
  });
  it("reports a provider failure without sending the lesson to a different cloud provider", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    invoke.mockImplementation(async (command: string) => {
      if (command === "narration_key_status") return true;
      if (command === "narration_generate") throw "ElevenLabs credits unavailable.";
    });
    const error = vi.fn(), end = vi.fn();
    await speakNaturalText("A unique failure test", { onError: error, onEnd: end });
    expect(error).toHaveBeenCalledWith("ElevenLabs credits unavailable.");
    expect(end).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(audioCreated).toBe(0);
  });
  it("does not contact a cloud narration provider when the plugin is disabled", async () => {
    saveNarrationPreferences({ ...DEFAULT_NARRATION, provider: "device" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await speakNaturalText("Use only this device for this authored explanation.");
    expect(invoke.mock.calls.some(([command]) => command === "narration_key_status" || command === "narration_generate")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds the in-memory cache instead of retaining an unlimited lesson history", () => {
    cacheNarration("old clip", new Uint8Array(8_000_000));
    cacheNarration("new clip", new Uint8Array(9_000_000));
    expect(cachedNarration("old clip")).toBeUndefined();
    expect(cachedNarration("new clip")?.byteLength).toBe(9_000_000);
  });
});
