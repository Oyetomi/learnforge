import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Code2 } from "lucide-react";
import { LanguageLogo, languageName } from "../common/LanguageLogo";
import hljs from "highlight.js/lib/core";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import cpp from "highlight.js/lib/languages/cpp";
import xml from "highlight.js/lib/languages/xml";

for (const [name, grammar] of Object.entries({
  go,
  rust,
  python,
  javascript,
  typescript,
  json,
  bash,
  css,
  sql,
  cpp,
  xml,
}))
  hljs.registerLanguage(name, grammar);
const aliases: Record<string, string> = {
  golang: "go",
  rs: "rust",
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  c: "cpp",
  "c++": "cpp",
  html: "xml",
  svg: "xml",
};
const labels: Record<string, string> = {
  go: "Go",
  rust: "Rust",
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  bash: "Shell",
  css: "CSS",
  sql: "SQL",
  cpp: "C++",
  xml: "HTML / XML",
};

export function highlightSource(code: string, language = "") {
  const normalized = language.toLowerCase();
  const grammar = aliases[normalized] || normalized;
  return hljs.getLanguage(grammar)
    ? hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value
    : null;
}

export const CodeBlock: React.FC<{
  code: string;
  language?: string;
  title?: string;
  onApplyCode?: (code: string) => void;
}> = ({ code, language = "", title = "Code example", onApplyCode }) => {
  const normalized = language.toLowerCase();
  const grammar = aliases[normalized] || normalized;
  const highlighted = useMemo(
    () => highlightSource(code, grammar),
    [code, grammar]
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    timer.current = setTimeout(() => setCopyState("idle"), 2000);
  };
  return (
    <figure
      className="snippet"
      aria-label={`${labels[grammar] || language || "Plain text"} code example`}
    >
      <figcaption className="snippet-toolbar">
        <span className="snippet-tab">
          <LanguageLogo language={normalized} size={14} />
          <span className="snippet-language">
            {labels[grammar] && !normalized.match(/^(c|h)$/)
              ? labels[grammar]
              : languageName(normalized)}
          </span>
          <span className="sr-only">{title}</span>
        </span>
        <div>
          {onApplyCode && (
            <button
              type="button"
              onClick={() => onApplyCode(code)}
              title="Open this snippet in code workspace"
              aria-label="Open snippet in code workspace"
            >
              <Code2 size={14} />
              <span>Use code</span>
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            title="Copy code"
            aria-label={copyState === "copied" ? "Code copied" : "Copy code"}
          >
            {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
            <span>
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                ? "Couldn’t copy"
                : "Copy"}
            </span>
          </button>
          <span className="sr-only" role="status">
            {copyState === "copied"
              ? "Code copied to clipboard."
              : copyState === "failed"
              ? "Clipboard unavailable. Select the code to copy it."
              : ""}
          </span>
        </div>
      </figcaption>
      <div className="snippet-editor">
        <div className="snippet-gutter" aria-hidden="true">
          {code.split("\n").map((_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <pre
          tabIndex={0}
          aria-label="Code example, scroll horizontally if needed"
        >
          {highlighted !== null ? (
            <code
              className={`hljs language-${grammar}`}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <code>{code}</code>
          )}
        </pre>
      </div>
    </figure>
  );
};
