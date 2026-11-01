import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildCanvasSimSrcDoc,
  buildStandaloneCanvasHtml,
  CANVAS_INNER_CSP,
} from "../canvasSim";

// Vitest stubs CSS imports by default, including ?raw CSS. Read the prepared
// asset in this focused integration test so it exercises the real srcDoc CSS.
vi.mock("../vendor/katexSandbox.raw.css?raw", async () => {
  const { readFileSync } = await import("node:fs");
  return { default: readFileSync("src/services/learning/vendor/katexSandbox.raw.css", "utf8") };
});

const katexDist = path.resolve("node_modules/katex/dist");
const upstreamCss = fs.readFileSync(path.join(katexDist, "katex.min.css"), "utf8");
const preparedCss = fs.readFileSync(
  path.resolve("src/services/learning/vendor/katexSandbox.raw.css"),
  "utf8"
);
const fontFacePattern = /@font-face\s*\{[^}]*\}/g;

describe("offline sandbox math fonts", () => {
  it("preserves every upstream font face with the matching local WOFF2 data", () => {
    const upstreamFaces = upstreamCss.match(fontFacePattern)!;
    const preparedFaces = preparedCss.match(fontFacePattern)!;
    expect(preparedFaces).toHaveLength(upstreamFaces.length);

    for (const [index, upstreamFace] of upstreamFaces.entries()) {
      const fontPath = /url\(["']?([^\s)"']+\.woff2)["']?\)/.exec(upstreamFace)![1];
      const font = fs.readFileSync(path.join(katexDist, fontPath));
      const embedded = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/.exec(preparedFaces[index])!;
      expect(embedded).not.toBeNull();
      expect(Buffer.from(embedded[1], "base64")).toEqual(font);
      // Keep the font family, weight, style and display policy from KaTeX.
      for (const property of ["font-family", "font-style", "font-weight", "font-display"]) {
        const declaration = new RegExp(`${property}:[^;}]+`);
        expect(preparedFaces[index].match(declaration)?.[0]).toBe(upstreamFace.match(declaration)?.[0]);
      }
    }

    const urls = [...preparedCss.matchAll(/url\(([^)]+)\)/g)].map(match => match[1]);
    expect(urls).toHaveLength(upstreamFaces.length);
    expect(urls.every(url => url.startsWith("data:font/woff2;base64,"))).toBe(true);
    expect(preparedCss).toContain("Copyright (c) 2013-2020 Khan Academy and other contributors");
    expect(preparedCss).toContain("The MIT License (MIT)");
  });

  it("keeps KaTeX's fraction, script, delimiter and alphabet layout rules intact", () => {
    const layoutCss = (css: string) => css.slice(css.indexOf("@font-face")).replace(fontFacePattern, "");
    expect(layoutCss(preparedCss)).toBe(layoutCss(upstreamCss));
    for (const family of ["KaTeX_Main", "KaTeX_Math", "KaTeX_AMS", "KaTeX_Caligraphic", "KaTeX_Fraktur", "KaTeX_Script", "KaTeX_Size4"]) {
      expect(preparedCss).toContain(family);
    }
  });

  it("ships fonts and typeset math in both sandbox and offline export without system-font overrides", () => {
    const spec = {
      html: '<div class="formula-bar">$$\\frac{x_i^2}{\\sqrt{\\alpha}} + \\mathbb{R} + \\mathcal{F} + \\mathfrak{g} + \\mathbf{v} + \\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$</div><button>Change value</button>',
      js: "",
    };
    for (const html of [buildCanvasSimSrcDoc(spec, "math-test"), buildStandaloneCanvasHtml("Math figure", spec)]) {
      expect(html).toContain(CANVAS_INNER_CSP);
      expect(html).toContain("font-src data:");
      const embeddedCss = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
      expect(embeddedCss.startsWith(preparedCss)).toBe(true);
      expect(html).toMatch(/\.katex\{font:normal 1\.21em KaTeX_Main/);
      expect(html).not.toMatch(/\.katex\s*\{\s*font-family:/);
      for (const className of ["mfrac", "msupsub", "mathbb", "mathcal", "mathfrak", "mathbf", "mtable", "delimsizing"]) {
        expect(html).toContain(className);
      }
      expect(html).toContain('encoding="application/x-tex"');
      expect(html).not.toContain('class="katex-error"');
    }
  });
});
