import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const vendorDir = path.join(rootDir, "src", "services", "learning", "vendor");
const force = process.argv.includes("--force");

fs.mkdirSync(vendorDir, { recursive: true });

const copyTargets = [
  {
    src: path.join(rootDir, "node_modules", "katex", "dist", "katex.min.js"),
    dest: path.join(vendorDir, "katexSandbox.raw.js"),
  },
  {
    src: path.join(rootDir, "node_modules", "roughjs", "bundled", "rough.js"),
    dest: path.join(vendorDir, "roughSandbox.raw.js"),
  },
  {
    src: path.join(rootDir, "node_modules", "d3", "dist", "d3.min.js"),
    dest: path.join(vendorDir, "d3Sandbox.raw.js"),
  },
];

for (const { src, dest } of copyTargets) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required vendor asset: ${src}`);
  }
  const srcStat = fs.statSync(src);
  const needsCopy =
    force ||
    !fs.existsSync(dest) ||
    fs.statSync(dest).size !== srcStat.size;
  if (needsCopy) {
    fs.copyFileSync(src, dest);
  }
}

// The opaque sandbox cannot resolve KaTeX's relative fonts/ URLs. Keep every
// supplied alphabet, weight and delimiter size, using WOFF2 data URLs allowed
// by its font-src data: CSP. This also makes standalone exports fully offline.
const katexDir = path.join(rootDir, "node_modules", "katex");
const katexCss = fs.readFileSync(path.join(katexDir, "dist", "katex.min.css"), "utf8");
const katexLicense = fs.readFileSync(path.join(katexDir, "LICENSE"), "utf8");
const fontFaces = katexCss.match(/@font-face\s*\{[^}]*\}/g) || [];
if (fontFaces.length === 0) throw new Error("KaTeX CSS has no bundled font faces");
const offlineKatexCss = katexCss.replace(/@font-face\s*\{[^}]*\}/g, (fontFace) => {
  const fontUrl = /url\(["']?([^\s)"']+\.woff2)["']?\)/.exec(fontFace)?.[1];
  if (!fontUrl || !/^fonts\/KaTeX_[\w-]+\.woff2$/.test(fontUrl)) {
    throw new Error("KaTeX font face does not contain an expected local WOFF2 asset");
  }
  const font = fs.readFileSync(path.join(katexDir, "dist", fontUrl));
  return fontFace.replace(/src\s*:[^;}]*(;|(?=\}))/,
    `src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2");`);
});
// Retain the upstream notice in the copied CSS and in every exported figure.
const preparedKatexCss = `/*! KaTeX CSS and bundled fonts\n${katexLicense.replace(/\*\//g, "* /")}*/\n${offlineKatexCss}`;
const katexCssDest = path.join(vendorDir, "katexSandbox.raw.css");
if (force || !fs.existsSync(katexCssDest) || fs.readFileSync(katexCssDest, "utf8") !== preparedKatexCss) {
  fs.writeFileSync(katexCssDest, preparedKatexCss);
}

const threeDest = path.join(vendorDir, "threeSandbox.raw.js");
const threePkg = path.join(rootDir, "node_modules", "three", "package.json");
const threeNeedsBuild =
  force ||
  !fs.existsSync(threeDest) ||
  fs.statSync(threeDest).mtimeMs < fs.statSync(threePkg).mtimeMs;

if (threeNeedsBuild) {
  await esbuild.build({
    stdin: {
      contents: 'import * as THREE from "three"; window.THREE = THREE;',
      resolveDir: rootDir,
      loader: "js",
    },
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    outfile: threeDest,
  });
}

// PDF text extraction needs bundled CMaps and standard fonts, including offline
// desktop imports. These assets never come from a third-party CDN.
const pdfDir = path.join(rootDir, "node_modules", "pdfjs-dist");
const pdfPublic = path.join(rootDir, "public", "vendor", "pdfjs");
for (const dir of ["cmaps", "standard_fonts"]) {
  const dest = path.join(pdfPublic, dir);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(path.join(pdfDir, dir))) {
    const source = path.join(pdfDir, dir, name), target = path.join(dest, name);
    if (fs.statSync(source).isFile() && (force || !fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size)) fs.copyFileSync(source, target);
  }
}
fs.copyFileSync(path.join(pdfDir, "LICENSE"), path.join(pdfPublic, "LICENSE"));
