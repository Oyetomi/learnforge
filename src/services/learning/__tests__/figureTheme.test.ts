import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFigureTheme, saveFigureTheme } from "../figureTheme";
afterEach(() => vi.unstubAllGlobals());
describe("paper appearance preference", () => {
  it("defaults to dark, remembers an explicit light choice, and tolerates unavailable storage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    expect(loadFigureTheme()).toBe("dark");
    saveFigureTheme("light"); expect(loadFigureTheme()).toBe("light");
    saveFigureTheme("dark"); expect(loadFigureTheme()).toBe("dark");
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("unavailable"); }, setItem: () => { throw new Error("unavailable"); } });
    expect(loadFigureTheme()).toBe("dark");
    expect(() => saveFigureTheme("light")).not.toThrow();
  });
});
