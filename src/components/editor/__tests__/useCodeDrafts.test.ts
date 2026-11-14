import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCodeDrafts } from "../useCodeDrafts";

afterEach(() => vi.unstubAllGlobals());
const stubStored = (value: string | null) =>
  vi.stubGlobal("localStorage", { getItem: () => value, setItem: () => {} });

describe("loadCodeDrafts", () => {
  it("keeps only string drafts from a stored object", () => {
    stubStored(JSON.stringify({ a: "fn main() {}", b: 3, c: null }));
    expect(loadCodeDrafts()).toEqual({ a: "fn main() {}" });
  });
  it("starts empty for missing, malformed or non-object data", () => {
    for (const value of [null, "not json", "[1,2]", "\"text\""]) {
      stubStored(value);
      expect(loadCodeDrafts()).toEqual({});
    }
  });
});
