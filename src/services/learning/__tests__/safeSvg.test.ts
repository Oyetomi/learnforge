import { describe, expect, it } from "vitest";
import { sanitizeSvgMarkup } from "../safeSvg";
import { parsePictogramSpec } from "../../../components/learning/SvgIllustration";

describe("inert generated illustrations", () => {
  it("rebuilds geometry, text, local gradients and a finite viewbox", () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 420 260"><title>Two states</title><desc>One shape changes color.</desc><defs><linearGradient id="paint"><stop offset="0%" stop-color="#60a5fa" /></linearGradient></defs><rect x="10" y="20" width="50" height="30" fill="url(#paint)"/><text x="20" y="90">A &amp; B</text></svg>');
    expect(result?.title).toBe("Two states");
    expect(result?.svg).toContain('viewBox="0 0 420 260"');
    expect(result?.svg).toContain("<rect");
    expect(result?.svg).toContain("A &amp; B");
    expect(result?.svg).toMatch(/fill="url\(#lf-[\w-]+-paint\)"/);
  });
  it.each([
    '<script>alert(1)</script>',
    '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>',
    '<image href="//example.com/tracker.svg"/>',
    '<a href="javascript:alert(1)"><text>link</text></a>',
    '<style>@import "//example.com/style.css";</style>',
    '<set attributeName="href" to="javascript:alert(1)"/>',
    '<animate attributeName="x" dur="1s"/>',
  ])("drops unsupported element subtrees: %s", (payload) => {
    const result = sanitizeSvgMarkup(`<svg><title>Safe</title>${payload}<circle r="10"/></svg>`);
    expect(result?.svg).toContain("<circle");
    expect(result?.svg).not.toMatch(/script|foreignObject|image|javascript|@import|<style|<set|<animate|<a\b/i);
  });
  it("drops event, CSS, href and external url attributes, even entity-encoded", () => {
    const result = sanitizeSvgMarkup('<svg onload="bad()"><rect onclick="bad()" style="fill:url(//x)" fill="url(//x)" stroke="url(&#x68;ttps://x)" href="data:text/html,bad" width="10" height="10"/></svg>');
    expect(result?.svg).not.toMatch(/onload|onclick|style=|href=|data:|https:|\/\/x/);
    expect(result?.svg).toContain('width="10"');
  });
  it("rejects DTDs, instructions, malformed input and excessive complexity", () => {
    expect(sanitizeSvgMarkup('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg><text>&x;</text></svg>')).toBeNull();
    expect(sanitizeSvgMarkup('<?xml-stylesheet href="//x"?><svg></svg>')).toBeNull();
    expect(sanitizeSvgMarkup('<svg><text></svg>')).toBeNull();
    expect(sanitizeSvgMarkup('<svg>' + '<g>'.repeat(30) + '<circle/>' + '</g>'.repeat(30) + '</svg>')).toBeNull();
    expect(sanitizeSvgMarkup('<svg>' + 'x'.repeat(61000) + '</svg>')).toBeNull();
  });
  it("does not accept duplicate pictogram ids or external background colors", () => {
    const spec = { kind: "palette", title: "Two choices", items: [{ id: "a", label: "A", detail: "One", color: "rgb(1,2,3) url(//x)" }, { id: "a", label: "B", detail: "Two" }] };
    expect(parsePictogramSpec(JSON.stringify(spec))).toBeNull();
  });
});
