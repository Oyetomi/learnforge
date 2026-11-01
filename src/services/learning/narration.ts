export interface NarrationPreferences {
  provider: "automatic" | "device" | "elevenlabs";
  voiceId: string;
  modelId: "eleven_flash_v2_5" | "eleven_multilingual_v2";
}
export const DEFAULT_NARRATION: NarrationPreferences = {
  provider: "automatic", voiceId: "JBFqnCBsd6RMkjVDRZzb", modelId: "eleven_flash_v2_5",
};
export const NARRATION_PREFERENCES_KEY = "learnforge:narration";
export const nativeNarrationAvailable = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export function loadNarrationPreferences(): NarrationPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(NARRATION_PREFERENCES_KEY) || "null");
    return {
      provider: ["automatic", "device", "elevenlabs"].includes(saved?.provider) ? saved.provider : "automatic",
      voiceId: /^[a-zA-Z0-9_-]{1,100}$/.test(saved?.voiceId || "") ? saved.voiceId : DEFAULT_NARRATION.voiceId,
      modelId: saved?.modelId === "eleven_multilingual_v2" ? saved.modelId : DEFAULT_NARRATION.modelId,
    };
  } catch { return { ...DEFAULT_NARRATION }; }
}
export function saveNarrationPreferences(value: NarrationPreferences) {
  // Whitelist fields: credentials must never enter localStorage or lesson exports.
  localStorage.setItem(NARRATION_PREFERENCES_KEY, JSON.stringify({ provider: value.provider, voiceId: value.voiceId, modelId: value.modelId }));
}
export async function narrationKeyConfigured(): Promise<boolean> {
  if (!nativeNarrationAvailable()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("narration_key_status");
}
export async function storeNarrationKey(key: string) {
  if (!nativeNarrationAvailable()) throw new Error("Connect ElevenLabs in the Mac app.");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("narration_store_key", { key: key.trim() });
}
export async function loadNarrationVoices(key?: string): Promise<{ id: string; name: string }[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("narration_voices", { apiKey: key?.trim() || null });
}

/** Preserve all prose, making bounded requests at sentence/word boundaries. */
export function speechChunks(text: string, limit = 1400): string[] {
  limit = Math.max(100, Math.floor(limit) || 1400);
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const head = rest.slice(0, limit);
    const sentence = [...head.matchAll(/[.!?。！？](?:\s|$)/g)].pop();
    let cut = sentence && sentence.index! > limit / 3 ? sentence.index! + sentence[0].length : head.lastIndexOf(" ");
    if (cut < limit / 3) cut = limit;
    // Never split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(rest[cut - 1])) cut--;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

const clips = new Map<string, Uint8Array>();
let clipBytes = 0;
export function cachedNarration(key: string): Uint8Array | undefined {
  const value = clips.get(key);
  if (value) { clips.delete(key); clips.set(key, value); }
  return value;
}
export function cacheNarration(key: string, bytes: Uint8Array) {
  if (bytes.byteLength > 16_000_000) return;
  const old = clips.get(key);
  if (old) { clipBytes -= old.byteLength; clips.delete(key); }
  clips.set(key, bytes); clipBytes += bytes.byteLength;
  while (clipBytes > 16_000_000 || clips.size > 12) {
    const oldest = clips.keys().next().value!;
    clipBytes -= clips.get(oldest)!.byteLength; clips.delete(oldest);
  }
}
