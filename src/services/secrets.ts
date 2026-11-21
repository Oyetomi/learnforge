/**
 * Provider credentials in macOS Keychain (Mac app only).
 *
 * Callers keep a synchronous API: keys are read from Keychain once at startup
 * into memory, and saves update memory immediately and Keychain in the
 * background. Until a credential is hydrated — in the browser, on other
 * platforms, or when Keychain access is refused — callers keep using their
 * existing local-storage value, so nothing is lost.
 */

export type SecretName = "ai-connection" | "exa";

/** The plaintext copy a caller kept in local storage before Keychain. */
export interface LegacySecretSlot {
  read(): string;
  strip(): void;
}

const cache = new Map<SecretName, string>();
const hydrated = new Set<SecretName>();
const writeQueue = new Map<SecretName, Promise<void>>();
let availability: Promise<boolean> | null = null;

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

function keychainAvailable(): Promise<boolean> {
  if (!isTauri()) return Promise.resolve(false);
  availability ??= invoke<boolean>("secret_store_available").catch(() => false);
  return availability;
}

/** True once `name` is held in Keychain and its in-memory copy is current. */
export function keychainHolds(name: SecretName): boolean {
  return hydrated.has(name);
}

export function cachedSecret(name: SecretName): string {
  return cache.get(name) ?? "";
}

/**
 * Load `name` from Keychain, moving any plaintext copy into Keychain first.
 * Never throws: on failure the caller stays on local storage.
 */
export async function hydrateSecret(
  name: SecretName,
  legacy: LegacySecretSlot
): Promise<boolean> {
  try {
    if (!(await keychainAvailable())) return false;
    let value = (await invoke<string | null>("secret_get", { name })) ?? "";
    // A save can land in local storage while Keychain is being read; retry
    // so the newest plaintext value is the one that moves.
    for (let attempt = 0; attempt < 3; attempt++) {
      const plain = legacy.read().trim();
      if (!plain) break;
      await invoke("secret_set", { name, value: plain });
      value = plain;
      if (legacy.read().trim() === plain) {
        legacy.strip();
        break;
      }
    }
    cache.set(name, value);
    hydrated.add(name);
    return true;
  } catch (err) {
    console.warn(`LearnForge: ${name} credential stays in local storage.`, err);
    return false;
  }
}

/**
 * Update the in-memory copy now and Keychain in the background. If the
 * Keychain write fails, `fallback` restores the plaintext copy so the key is
 * not lost; the next launch tries the move again.
 */
export function storeSecret(name: SecretName, value: string, fallback: () => void): void {
  const trimmed = value.trim();
  cache.set(name, trimmed);
  const previous = writeQueue.get(name) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => invoke("secret_set", { name, value: trimmed }))
    .then(() => {})
    .catch((err) => {
      console.warn(`LearnForge: could not save ${name} credential in Keychain.`, err);
      if (cache.get(name) === trimmed) {
        try {
          fallback();
        } catch {
          /* Ignore storage fallback failure. */
        }
      }
    });
  writeQueue.set(name, next);
}

/** Test hook: forget hydration state between cases. */
export function resetSecretsForTests(): void {
  cache.clear();
  hydrated.clear();
  writeQueue.clear();
  availability = null;
}
