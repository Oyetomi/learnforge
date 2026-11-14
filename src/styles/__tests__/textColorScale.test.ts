import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Neutral text greys belong to the six-step scale in styles/foundation.css
 * (--c-text-quiet … --c-text-heading), so a future light theme only has to
 * redefine those tokens. This guards against new hard-coded near-duplicates.
 * Tinted text (success green, warm accents, purple) is deliberately allowed.
 */
const SCALE = ["9ca7b5", "b8c0cc", "c7d2df", "dfe7f0", "edf0f4"];
const SRC = join(__dirname, "..", "..");
const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : cssFiles(path);
    return path.endsWith(".css") ? [path] : [];
  });
}

function coveredByScale(hex: string): boolean {
  const c = rgb(hex);
  const [r, g, b] = c;
  const neutral =
    Math.max(...c) - Math.min(...c) <= 40 && Math.min(...c) >= 0x70 && g <= b + 4 && r <= g + 4 && b - g <= 22;
  return neutral && SCALE.some((step) => Math.max(...rgb(step).map((v, i) => Math.abs(v - c[i]))) <= 18);
}

describe("text colour scale", () => {
  it("has no hard-coded neutral text greys that a scale step already covers", () => {
    const offenders: string[] = [];
    for (const file of cssFiles(SRC)) {
      const css = readFileSync(file, "utf8");
      for (const match of css.matchAll(/(?<![-\w])color\s*:\s*#([0-9a-fA-F]{6})\b/g)) {
        if (coveredByScale(match[1].toLowerCase()))
          offenders.push(`${relative(SRC, file)}: #${match[1]} → use a --c-text-* token`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
