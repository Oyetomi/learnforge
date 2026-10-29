import {
  presetFor,
  SUBSCRIPTION_BRIDGE_NOTICE,
  type AIConnection,
} from "../../services/ai/connection";

/** A changed connection should be usable before replacing the saved one. */
export function connectionDraftError(
  draft: AIConnection,
  bridgeAvailable: boolean
): string | null {
  if (draft.provider === "chatgpt-codex")
    return bridgeAvailable ? null : SUBSCRIPTION_BRIDGE_NOTICE;
  try {
    if (!["http:", "https:"].includes(new URL(draft.url).protocol))
      throw new Error();
  } catch {
    return "Enter a valid HTTP or HTTPS endpoint before saving this connection.";
  }
  if (!draft.model.trim())
    return "Enter or choose a main model before saving this connection.";
  if (presetFor(draft.provider).needsKey && !draft.apiKey.trim())
    return "Add the API key for this provider before saving the connection.";
  return null;
}
