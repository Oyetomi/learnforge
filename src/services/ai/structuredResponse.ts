/** Decode complete JSON replies without repairing or inventing assessment fields. */
export class StructuredResponseError extends Error {
  constructor(readonly reason: "empty" | "truncated" | "refused" | "malformed") {
    super({
      empty: "The tutor returned no usable content. Retry preparation.",
      truncated: "The tutor response was cut off before it finished. Retry preparation.",
      refused: "The provider could not complete this request. Try again or check your AI connection.",
      malformed: "The tutor returned an unreadable response. Retry preparation.",
    }[reason]);
    this.name = "StructuredResponseError";
  }
}

export function readChatText(envelope: unknown): string {
  const choice = (envelope as { choices?: { finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }[] })?.choices?.[0];
  if (choice?.finish_reason === "length" || choice?.finish_reason === "max_tokens")
    throw new StructuredResponseError("truncated");
  if (choice?.finish_reason === "content_filter" || choice?.message?.refusal)
    throw new StructuredResponseError("refused");
  const content = choice?.message?.content;
  const text = (typeof content === "string" ? content : Array.isArray(content)
    ? content.filter(part => part && (part.type === "text" || part.type === "output_text") && typeof part.text === "string").map(part => part.text).join("")
    : "").trim();
  if (!text) throw new StructuredResponseError("empty");
  return text;
}

export function parseChatJson(envelope: unknown, allowedFences = ["json"]): unknown {
  const text = readChatText(envelope);
  // Match the complete outer fence only. Never extract an arbitrary {...} from prose,
  // concatenate alternative answers, or fabricate fields from truncated JSON.
  const fence = /^```([\w-]*)[ \t]*\r?\n([\s\S]*)\r?\n```[ \t]*$/.exec(text);
  if (fence && (allowedFences.includes(fence[1].toLowerCase()) || !fence[1])) {
    try { return JSON.parse(fence[2]); } catch { throw new StructuredResponseError("malformed"); }
  }
  try { return JSON.parse(text); } catch { throw new StructuredResponseError("malformed"); }
}
