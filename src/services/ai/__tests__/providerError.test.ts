import { describe, expect, it } from "vitest";
import { describeProviderError } from "../connection";

// The proxy's reply when Gemini's account quota runs out (nested JSON in a 500).
const cloudCodeQuota = JSON.stringify({
  error: {
    message: `CloudCode API error (429): ${JSON.stringify({
      error: {
        code: 429,
        message: "Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 1h32m2s.",
        status: "RESOURCE_EXHAUSTED",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "QUOTA_EXHAUSTED", metadata: { model: "gemini-4-neon-xhigh", quotaResetDelay: "1h32m2.274647775s" } }],
      },
    }, null, 2)}`,
    type: "internal_error",
  },
});

describe("readable provider errors", () => {
  it("names a usage limit, the model and when it resets, even inside a 500", () => {
    expect(describeProviderError(500, cloudCodeQuota)).toBe(
      "Usage limit reached for gemini-4-neon-xhigh. It resets in 1h32m2s. Choose another model in Settings, or try again later."
    );
  });
  it("uses the reset delay from metadata when the message has none", () => {
    const body = JSON.stringify({ error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED", details: [{ metadata: { quotaResetDelay: "12m5.5s" } }] } });
    expect(describeProviderError(429, body, "m")).toBe("Usage limit reached for m. It resets in 12m5s. Choose another model in Settings, or try again later.");
  });
  it("keeps the innermost message for other errors, without the JSON", () => {
    const body = JSON.stringify({ error: { message: "Gemini Web session is not authenticated. Sign in at gemini.google.com.", type: "auth" } });
    expect(describeProviderError(401, body)).toBe("HTTP 401: Gemini Web session is not authenticated. Sign in at gemini.google.com.");
    expect(describeProviderError(502, "Bad gateway")).toBe("HTTP 502: Bad gateway");
    expect(describeProviderError(500, "")).toBe("HTTP 500");
  });
});
