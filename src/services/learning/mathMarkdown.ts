/** Keep money in prose out of the TeX parser, without changing fenced/inline code. */
function escaped(text: string, at: number) {
  let slashes = 0;
  while (at > 0 && text[--at] === "\\") slashes++;
  return slashes % 2 === 1;
}
function proseMath(body: string) {
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
    } else {
      out += "\\$";
      i++;
    }
  }
  return out;
}
export function normalizeMathMarkdown(text: string): string {
  const code = /(`{3,})[^\n]*\n[\s\S]*?\1|(~{3,})[^\n]*\n[\s\S]*?\2|`+[^`\n]+`+/g;
  let out = "", start = 0;
  for (const match of text.matchAll(code)) {
    out += normalizeProse(text.slice(start, match.index)) + match[0];
    start = match.index! + match[0].length;
  }
  return out + normalizeProse(text.slice(start));
}
