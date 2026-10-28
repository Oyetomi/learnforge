import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import {
  contextLevel,
  contextWindowFor,
  rememberContextWindow,
} from "../connection";

const store = new Map<string, string>();

describe("context window telemetry", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses static sizes for known model families", () => {
    expect(contextWindowFor("gpt-6.1-sol")).toBe(500_000);
    expect(contextWindowFor("gpt-6-luna")).toBe(272_000);
    expect(contextWindowFor("claude-opus-5-5")).toBe(200_000);
    expect(contextWindowFor("google/gemini-4-argon")).toBe(1_000_000);
    expect(contextWindowFor("some-unknown-model")).toBe(128_000);
  });

  it("prefers live metadata when remembered", () => {
    rememberContextWindow("gpt-6-astra", 300_000);
    expect(contextWindowFor("gpt-6-astra")).toBe(300_000);
  });

  it("bands ring colour at 50% and 80%", () => {
    expect(contextLevel(0.1)).toBe("low");
    expect(contextLevel(0.5)).toBe("mid");
    expect(contextLevel(0.8)).toBe("mid");
    expect(contextLevel(0.81)).toBe("high");
  });
});
