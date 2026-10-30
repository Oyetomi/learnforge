/**
 * Lazy offline vendor loader for `CanvasSandbox`.
 *
 * Keeps LearnForge's startup bundle lean while giving zero-origin
 * `sandbox="allow-scripts"` simulations (`connect-src 'none'`) 100% offline
 * access to:
 *   - `window.THREE` + `window.setupForge3D` (Three.js 3D WebGL scenes)
 *   - `window.d3` (D3.js v7 scales, shapes, force graphs, transitions)
 *   - `window.rough` (Rough.js expressive sketched geometry)
 *   - `window.katex` (live 60fps dynamic KaTeX formula rendering)
 */

export interface DetectedCanvasVendors {
  katex: boolean;
  rough: boolean;
  d3: boolean;
  three: boolean;
  any: boolean;
}

export function detectCanvasVendors(js: string): DetectedCanvasVendors {
  const katex = /\bkatex\b/.test(js);
  const rough = /\brough\b/.test(js);
  const d3 = /\bd3\b/.test(js);
  const three = /\b(?:THREE|setupForge3D)\b/.test(js);
  return {
    katex,
    rough,
    d3,
    three,
    any: katex || rough || d3 || three,
  };
}

const vendorCache: Partial<Record<"katex" | "rough" | "d3" | "three", string>> =
  {};

export async function loadCanvasVendorScripts(js: string): Promise<string[]> {
  const needed = detectCanvasVendors(js);
  if (!needed.any) return [];

  const scripts: string[] = [];

  if (needed.katex) {
    if (!vendorCache.katex) {
      const mod = await import("./vendor/katexSandbox.raw.js?raw");
      vendorCache.katex = mod.default;
    }
    scripts.push(vendorCache.katex);
  }

  if (needed.rough) {
    if (!vendorCache.rough) {
      const mod = await import("./vendor/roughSandbox.raw.js?raw");
      vendorCache.rough = mod.default;
    }
    scripts.push(vendorCache.rough);
  }

  if (needed.d3) {
    if (!vendorCache.d3) {
      const mod = await import("./vendor/d3Sandbox.raw.js?raw");
      vendorCache.d3 = mod.default;
    }
    scripts.push(vendorCache.d3);
  }

  if (needed.three) {
    if (!vendorCache.three) {
      const mod = await import("./vendor/threeSandbox.raw.js?raw");
      vendorCache.three = mod.default;
    }
    scripts.push(vendorCache.three);
  }

  return scripts;
}
