import { describe, expect, it } from "vitest";
import { connectionDraftError } from "../validation";
import { connectionFromPreset } from "../../../services/ai/connection";

describe("connection settings validation", () => {
  it("accepts a local endpoint without an API key", () => {
    expect(
      connectionDraftError(connectionFromPreset("proxy"), false)
    ).toBeNull();
    expect(
      connectionDraftError(
        {
          ...connectionFromPreset("custom"),
          url: "http://127.0.0.1:8080/v1/chat/completions",
          model: "local-model",
        },
        false
      )
    ).toBeNull();
  });
  it("blocks malformed or unsupported endpoint protocols before replacing saved settings", () => {
    for (const url of ["", "localhost:8080", "file:///tmp/provider"])
      expect(
        connectionDraftError({ ...connectionFromPreset("proxy"), url }, false)
      ).toContain("HTTP or HTTPS endpoint");
  });
  it("asks for missing required credentials and a nonblank main model", () => {
    expect(
      connectionDraftError(connectionFromPreset("openai"), false)
    ).toContain("API key");
    expect(
      connectionDraftError(
        { ...connectionFromPreset("proxy"), model: "  " },
        false
      )
    ).toContain("main model");
  });
  it("keeps a dev bridge from appearing usable in a packaged app", () => {
    expect(
      connectionDraftError(connectionFromPreset("chatgpt-codex"), false)
    ).not.toBeNull();
    expect(
      connectionDraftError(connectionFromPreset("chatgpt-codex"), true)
    ).toBeNull();
  });
});
