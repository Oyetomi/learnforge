/** Keep money in prose out of the TeX parser, without changing fenced/inline code. */
function escaped(text: string, at: number) {
  let slashes = 0;
  while (at > 0 && text[--at] === "\\") slashes++;
  return slashes % 2 === 1;
}
const MATH_STRUCTURE_RE =
  /[=<>^_]|\\(?:frac|sqrt|sum|int|prod|lim|begin|cdot|times|div|pm|mp|le|ge|ne|approx|equiv|to|rightarrow|infty|partial|nabla|left|right|vec|hat|bar|dot|sin|cos|tan|log|ln|exp|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega)\b/;

function proseMath(body: string) {
  if (MATH_STRUCTURE_RE.test(body)) return false;
  const bare = body.replace(/\\(?:text|mathrm|operatorname)\{[^}]*\}/g, "")
    .replace(/\\[a-zA-Z]+/g, "");
  return /^(?:\\\$)?\d/.test(body) && /\b[A-Za-z]{2,}\b/.test(bare);
}
export function isInlineMath(body: string): boolean {
  return !/\n|^\s|\s$/.test(body) && !proseMath(body);
}
function normalizeProse(text: string): string {
  let out = "";
  for (let i = 0; i < text.length;) {
    if (text[i] !== "$" || escaped(text, i)) { out += text[i++]; continue; }
    const display = text.startsWith("$$", i);
    const marker = display ? "$$" : "$";
    let end = i + marker.length;
    while (end < text.length && !(text.startsWith(marker, end) && !escaped(text, end))) end++;
    const body = text.slice(i + marker.length, end);
    if (end < text.length && (display || isInlineMath(body))) {
      // micromark's math tokenizer treats even \$ as a delimiter. Replace the
      // currency token INSIDE math before Markdown parses it (KaTeX supports textdollar).
      let tex = body.replace(/\\\$/g, "\\text{\\textdollar}");
      if (display) tex = tex.replace(/\$/g, "\\text{\\textdollar}");
      out += marker + tex + marker;
      i = end + marker.length;
    } else if (display) {
      out += "\\$\\$";
      i += 2;
    } else {
      out += "\\$";
      i++;
    }
  }
  return out;
}

function normalizeInlineCodeAware(chunk: string): string {
  let out = "";
  let i = 0;
  let plainStart = 0;
  while (i < chunk.length) {
    if (chunk[i] === "`") {
      let ticks = 1;
      while (i + ticks < chunk.length && chunk[i + ticks] === "`") ticks++;
      const delimiter = "`".repeat(ticks);
      const close = chunk.indexOf(delimiter, i + ticks);
      if (close !== -1) {
        out += normalizeProse(chunk.slice(plainStart, i));
        out += chunk.slice(i, close + ticks);
        i = close + ticks;
        plainStart = i;
        continue;
      }
      i += ticks;
      continue;
    }
    i++;
  }
  return out + normalizeProse(chunk.slice(plainStart));
}

export function normalizeMathMarkdown(text: string): string {
  const lines = text.split(/(?<=\n)/);
  let out = "";
  let proseBuf = "";
  let fence: { marker: string; length: number } | null = null;

  const flushProse = () => {
    if (proseBuf) {
      out += normalizeInlineCodeAware(proseBuf);
      proseBuf = "";
    }
  };

  for (const line of lines) {
    const trimmed = line.replace(/\r?\n$/, "");
    const stripped = trimmed.replace(/^(?:[ \t]*>[ \t]?)+/, "");
    if (!fence) {
      const open = /^[ \t]*(`{3,}|~{3,})/.exec(stripped);
      if (open) {
        const marker = open[1][0];
        const rest = stripped.slice(open[0].length);
        // Backtick info strings cannot contain backticks (otherwise it's inline code).
        if (marker !== "`" || !rest.includes("`")) {
          flushProse();
          fence = { marker, length: open[1].length };
          out += line;
          continue;
        }
      }
      proseBuf += line;
    } else {
      out += line;
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(stripped);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) {
        fence = null;
      }
    }
  }
  flushProse();
  return out;
}
