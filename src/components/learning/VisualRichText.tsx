import React from "react";
import { renderToString } from "katex";
import "katex/dist/katex.min.css";
import { MATH_RENDER_OPTIONS } from "../../services/learning/math";
import { stripInternalSourceCitations } from "../../services/learning/grounding";
import { highlightSource } from "../chat/CodeBlock";

interface VisualRichTextProps {
  text: string;
  language?: string;
  /** When true, detects standalone code signatures in labels (e.g. `type Scorer interface { ... }`) and applies syntax highlighting. */
  detectCodeLabel?: boolean;
  className?: string;
}

const TOKEN_RE =
  /(\$\$[\s\S]+?\$\$|\$(?!\s)(?:\\.|[^$\\\r\n])+?(?<!\s)\$|`[^`\r\n]+`)/g;

const CODE_SIGNATURE_RE =
  /^(?:type\s+\w+|func\s*[\w(]|fn\s+\w+|struct\s+\w+|interface\s+\w+|impl\b|class\s+\w+|def\s+\w+|(?:const|let|var)\s+\w+\s*=|SELECT\s+|CREATE\s+TABLE)/;

function looksLikeStandaloneCode(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("$") || t.includes("`")) return false;
  if (CODE_SIGNATURE_RE.test(t)) return true;
  if (/[\w)\]]\s*\{[\s\S]*\}\s*$/.test(t) && /[();:=<>]/.test(t)) return true;
  return false;
}

function renderKatexSafe(tex: string, displayMode: boolean): string | null {
  const cleaned = tex.trim();
  if (!cleaned || cleaned.length > 2000) return null;
  // Avoid treating currency ranges like "$10 and $20" as LaTeX math.
  if (!displayMode && /^\d+(?:[.,]\d+)?(?:\s|$)/.test(cleaned)) return null;
  try {
    return renderToString(cleaned, {
      ...MATH_RENDER_OPTIONS,
      displayMode,
      throwOnError: true,
    });
  } catch {
    return null;
  }
}

/**
 * Safe inline/display KaTeX + syntax-highlighted inline code renderer for
 * `VisualExample` titles, summaries, diagram nodes, captions, and takeaways.
 * Plain text segments remain standard React text nodes (never raw HTML),
 * preserving strict XSS escaping on arbitrary strings.
 */
export function VisualRichText({
  text: rawText,
  language,
  detectCodeLabel = false,
  className,
}: VisualRichTextProps) {
  const text = stripInternalSourceCitations(rawText);
  if (!text) return null;

  if (detectCodeLabel && looksLikeStandaloneCode(text)) {
    const highlighted = highlightSource(text, language);
    if (highlighted !== null) {
      return (
        <code
          className={`visual-code-chip ${className || ""}`.trim()}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      );
    }
    return (
      <code className={`visual-code-chip ${className || ""}`.trim()}>
        {text}
      </code>
    );
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("$$") && token.endsWith("$$")) {
      const html = renderKatexSafe(token.slice(2, -2), true);
      if (html) {
        parts.push(
          <span
            key={match.index}
            className="visual-math-display"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith("$") && token.endsWith("$")) {
      const html = renderKatexSafe(token.slice(1, -1), false);
      if (html) {
        parts.push(
          <span
            key={match.index}
            className="visual-math-inline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith("`") && token.endsWith("`")) {
      const inner = token.slice(1, -1);
      const highlighted = highlightSource(inner, language);
      parts.push(
        highlighted !== null ? (
          <code
            key={match.index}
            className="visual-inline-code"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code key={match.index} className="visual-inline-code">
            {inner}
          </code>
        )
      );
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex === 0) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return className ? (
    <span className={className}>{parts}</span>
  ) : (
    <>{parts}</>
  );
}
