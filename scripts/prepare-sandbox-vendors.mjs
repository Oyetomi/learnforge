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
    src: path.join(rootDir, "node_modules", "katex", "dist", "katex.min.css"),
    dest: path.join(vendorDir, "katexSandbox.raw.css"),
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
