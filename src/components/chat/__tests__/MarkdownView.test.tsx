import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "../MarkdownView";
import { DerivationLadder } from "../DerivationLadder";
import { MATH_SIMPLIFY_LADDER } from "./fixtures/math-ladder";
import { expandMultimodalMessageContent } from "../../../services/ai/prompts";

describe("rich learning content", () => {
  it("renders a ladder as semantic steps without nesting a section inside preformatted text", () => {
    const content =
      "```ladder\ntitle: Queue handoff\ninitial: Queue empty\nstep: 1\nrule: Add a value\nstate: [Queue has a value]:blue\nresult: Receiver can proceed\n```";
    const html = renderToStaticMarkup(<MarkdownView content={content} />);
    expect(html).toContain("Queue handoff");
    expect(html).toContain("<ol");
    expect(html).toContain("Add a value");
    expect(html).toContain("Receiver can proceed");
    expect(html).not.toMatch(/<pre[^>]*>\s*<section/);
  });
  it("keeps ordinary code blocks preformatted without nesting their toolbar in a pre element", () => {
    const html = renderToStaticMarkup(
      <MarkdownView content={'```go\nfmt.Println("hello")\n```'} />
    );
    expect(html).toContain("<pre");
    expect(html).toContain("fmt.Println");
    expect(html).not.toMatch(/<pre[^>]*>\s*<div/);
  });
  it("renders only the current mathematical transformation with accessible navigation", () => {
    const html = renderToStaticMarkup(
      <DerivationLadder {...MATH_SIMPLIFY_LADDER} />
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain("<math");
    expect(html).toContain("guided-derivation");
    expect(html).toContain("Next step");
    expect(html).not.toContain("Divide the numerator by the denominator");
    expect(html).toContain("Write the division as a fraction");
    expect(MATH_SIMPLIFY_LADDER.initialState).toContain("bigl[");
  });
});

describe("code reading", () => {
  it("highlights Go keywords, function names and strings with real tokens", () => {
    const html = renderToStaticMarkup(
      <MarkdownView
        content={
          '```go\nfunc TestNewAuditor(t *testing.T) {\n  a := NewAuditor("billing")\n  if a == nil { t.Fatal("missing") }\n}\n```'
        }
      />
    );
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-title");
    expect(html).toContain("hljs-string");
    expect(html).not.toContain("Send to Editor");
    expect(html).toContain("snippet-toolbar");
    expect(html).toContain("snippet-gutter");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Code example");
  });
  it("keeps unlabelled single-line fences as blocks, with the course language as a hint", () => {
    const html = renderToStaticMarkup(
      <MarkdownView languageHint="rust" content={"```\nlet count = 3;\n```"} />
    );
    expect(html).toContain("language-rust");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("<pre");
    const inline = renderToStaticMarkup(
      <MarkdownView content={"Use `count` here."} />
    );
    expect(inline).toContain("inline-code");
    expect(inline).not.toContain("<figure");
  });
  it("escapes HTML-like source code and falls back safely for unsupported languages", () => {
    for (const language of ["javascript", "unknown-language"]) {
      const html = renderToStaticMarkup(
        <MarkdownView
          content={"```" + language + '\n<script>alert("x")</script>\n```'}
        />
      );
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;");
    }
  });
});

describe("universal visuals and multi-discipline illustrations", () => {
  it("renders fenced svg blocks as sanitized vector illustration cards", () => {
    const svgMarkdown = [
      "```svg",
      '<svg viewBox="0 0 200 120" onload="alert(1)"><title>Go Gopher Mascot</title><script>evil()</script><circle cx="100" cy="60" r="40" fill="#60a5fa" onclick="steal()" /></svg>',
      "```",
    ].join("\n");
    const html = renderToStaticMarkup(<MarkdownView content={svgMarkdown} />);
    expect(html).toContain("svg-illustration-card");
    expect(html).toContain("Go Gopher Mascot");
    expect(html).toContain("<svg");
    expect(html).toContain('fill="#60a5fa"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onload=");
    expect(html).not.toContain("onclick=");
  });

  it("renders interactive pictogram blocks for palette, quadrant, and hotspots", () => {
    const paletteMd = [
      "```pictogram",
      JSON.stringify({
        kind: "palette",
        title: "Editorial Warmth Hierarchy",
        summary: "Contrast warm surface accents with deep slate.",
        items: [
          {
            id: "primary",
            label: "Warm Amber",
            color: "#e5aa72",
            detail: "Used for primary interactive calls to action.",
          },
          {
            id: "canvas",
            label: "Obsidian Slate",
            color: "#13171d",
            detail: "Reduces eye strain for long reading sessions.",
          },
        ],
      }),
      "```",
    ].join("\n");
    const html = renderToStaticMarkup(<MarkdownView content={paletteMd} />);
    expect(html).toContain("pictogram-card");
    expect(html).toContain("Editorial Warmth Hierarchy");
    expect(html).toContain("Warm Amber");
    expect(html).toContain("Used for primary interactive calls to action.");
  });

  it("converts embedded data:image attachments into OpenAI multimodal parts while keeping plain text intact", () => {
    expect(expandMultimodalMessageContent("Just a text question")).toBe(
      "Just a text question"
    );
    const withImage = expandMultimodalMessageContent(
      "Critique this wireframe\n\n![wireframe.png](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)"
    );
    expect(Array.isArray(withImage)).toBe(true);
    expect(withImage).toEqual([
      { type: "text", text: "Critique this wireframe" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" },
      },
    ]);
  });
});
