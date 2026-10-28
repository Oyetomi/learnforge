/** Use Tauri's scoped HTTP client in the desktop app, browser fetch elsewhere. */
export async function executionFetch(url: string, init?: RequestInit): Promise<Response> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { fetch: nativeFetch } = await import('@tauri-apps/plugin-http');
    return nativeFetch(url, init);
  }
  return fetch(url, init);
}
