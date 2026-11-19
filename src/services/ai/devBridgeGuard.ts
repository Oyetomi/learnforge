/**
 * Same-origin check for the development-only ChatGPT/Codex bridge served by
 * the Vite dev server (vite.config.ts). Kept free of Node imports so it can be
 * unit-tested with the frontend suite.
 */
export interface BridgeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

const header = (req: BridgeRequest, name: string): string => {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) || "";
};

/**
 * Accept a dev-bridge request only from the dev server's own origin.
 * Browsers send Sec-Fetch-Site on every fetch and Origin on every POST; a
 * request that names another site in either is rejected. POSTs must also be
 * JSON, which a cross-site page cannot send without a CORS preflight.
 */
export function isSameOriginRequest(req: BridgeRequest): boolean {
  const site = header(req, "sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = header(req, "origin");
  if (origin) {
    try {
      if (new URL(origin).host !== header(req, "host")) return false;
    } catch {
      return false;
    }
  }
  if ((req.method || "GET").toUpperCase() === "POST") {
    if (!header(req, "content-type").toLowerCase().startsWith("application/json")) return false;
  }
  return true;
}
