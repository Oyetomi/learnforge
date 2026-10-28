import { DOMImplementation, DOMParser, XMLSerializer, type Element, type Node } from "@xmldom/xmldom";

const NS = "http://www.w3.org/2000/svg";
const tags = new Set(["svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "linearGradient", "radialGradient", "stop", "clipPath"]);
const numeric = new Set(["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "dx", "dy", "stroke-width", "stroke-miterlimit", "stroke-dashoffset", "font-size", "opacity", "fill-opacity", "stroke-opacity", "stop-opacity", "offset"]);
const enums: Record<string, string[]> = {
  "text-anchor": ["start", "middle", "end"],
  "dominant-baseline": ["auto", "middle", "central", "hanging", "alphabetic"],
  "stroke-linecap": ["butt", "round", "square"], "stroke-linejoin": ["miter", "round", "bevel"],
  "fill-rule": ["nonzero", "evenodd"], "clip-rule": ["nonzero", "evenodd"],
  "font-weight": ["normal", "bold", "400", "500", "600", "700"],
  "font-family": ["sans-serif", "serif", "monospace", "JetBrains Mono"],
  "gradientUnits": ["userSpaceOnUse", "objectBoundingBox"],
};
const idPattern = /^[A-Za-z][\w-]{0,63}$/;
const colorPattern = /^(?:#[\da-f]{3,8}|[a-z]{1,24}|(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\))$/i;
const numberPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%?$/i;

/** Rebuild a small, inert SVG language from XML nodes; never insert model markup as-is. */
export function sanitizeSvgMarkup(raw: string): { svg: string; title: string; description: string } | null {
  if (raw.length > 60000 || /<!DOCTYPE|<!ENTITY|<\?/i.test(raw)) return null;
  const match = /<svg\b[\s\S]*<\/svg>/i.exec(raw);
  if (!match) return null;
  try {
    const parsed = new DOMParser({ onError: () => { throw new Error("Invalid SVG"); } }).parseFromString(match[0], "image/svg+xml");
    const original = parsed.documentElement;
    if (!original || original.localName !== "svg" || (original.namespaceURI && original.namespaceURI !== NS)) return null;
    const output = new DOMImplementation().createDocument(NS, "svg", null);
    const root = output.documentElement!;
    root.setAttribute("xmlns", NS);
    let hash = 2166136261;
    for (const c of raw) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    const prefix = `lf-${hash.toString(36)}-`;
    let count = 0;
    const copyAttributes = (input: Element, target: Element) => {
      for (let i = 0; i < input.attributes.length; i++) {
        const attr = input.attributes.item(i)!;
        const key = attr.name, value = attr.value.trim();
        if (attr.namespaceURI || value.length > 8000) continue;
        let allowed: string | null = null;
        if (key === "id" && idPattern.test(value)) allowed = prefix + value;
        else if (numeric.has(key) && numberPattern.test(value) && Number.isFinite(Number(value.replace(/%$/, ""))) && Math.abs(parseFloat(value)) <= 100000) allowed = value;
        else if (["fill", "stroke", "stop-color"].includes(key)) {
          const local = /^url\(#([A-Za-z][\w-]{0,63})\)$/.exec(value);
          if (local) allowed = `url(#${prefix}${local[1]})`;
          else if (colorPattern.test(value)) allowed = value;
        } else if (key === "clip-path") {
          const local = /^url\(#([A-Za-z][\w-]{0,63})\)$/.exec(value);
          if (local) allowed = `url(#${prefix}${local[1]})`;
        } else if (key === "d" && /^[MmZzLlHhVvCcSsQqTtAa\d\s.,eE+-]+$/.test(value)) allowed = value;
        else if (["points", "stroke-dasharray"].includes(key) && /^[\d\s.,eE+-]+$/.test(value)) allowed = value;
        else if (["transform", "gradientTransform"].includes(key) && /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d\s.,eE+-]+\)\s*)+$/.test(value)) allowed = value;
        else if (enums[key]?.includes(value)) allowed = value;
        if (allowed !== null) target.setAttribute(key, allowed);
      }
    };
    const visit = (node: Node, parent: Element, depth: number) => {
      if (++count > 600 || depth > 24) throw new Error("SVG too complex");
      if (node.nodeType === 3 || node.nodeType === 4) {
        parent.appendChild(output.createTextNode(node.nodeValue || ""));
      } else if (node.nodeType === 1) {
        const element = node as Element;
        if (!tags.has(element.localName || "") || (element.namespaceURI && element.namespaceURI !== NS) || element.localName === "svg") return;
        const clean = output.createElementNS(NS, element.localName!);
        copyAttributes(element, clean);
        parent.appendChild(clean);
        for (let child = element.firstChild; child; child = child.nextSibling) visit(child, clean, depth + 1);
      }
    };
    copyAttributes(original, root);
    const box = original.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
    const size = (key: string, fallback: number) => {
      const value = Number(original.getAttribute(key));
      return value > 0 && value <= 10000 ? value : fallback;
    };
    root.setAttribute("viewBox", box?.length === 4 && box.every(Number.isFinite) && box.every((n) => Math.abs(n) <= 100000) && box[2] > 0 && box[3] > 0
      ? box.join(" ") : `0 0 ${size("width", 420)} ${size("height", 260)}`);
    for (let child = original.firstChild; child; child = child.nextSibling) visit(child, root, 1);
    const title = root.getElementsByTagName("title").item(0)?.textContent?.trim().slice(0, 120) || "Illustration";
    const desc = root.getElementsByTagName("desc").item(0);
    const description = desc?.textContent?.trim().slice(0, 1000) || "No text description was provided. Ask for a text explanation.";
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", title);
    if (desc) { desc.setAttribute("id", `${prefix}description`); root.setAttribute("aria-describedby", `${prefix}description`); }
    return { svg: new XMLSerializer().serializeToString(root), title, description };
  } catch { return null; }
}
