/** Check if a line looks like an introductory prose lead-in before a code snippet. */
function isProseLeadIn(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.endsWith(":")) return true;
  const leadInPattern =
    /^(?:Consider|Given|In|Suppose|Take|Notice|Here is|Observe|Review|Assuming)\b/i;
  return leadInPattern.test(trimmed) && !/[:={};]/.test(trimmed);
}

/** Detect whether a string contains raw programming code rather than pure prose. */
export function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) return false;

  const keywordPattern =
    /\b(?:func|fn|def|function|class|struct|interface|type|impl|package|import|return|let|const|var|pub|public|private|protected|async|await|val|mut|select|chan)\b/;
  const codeConstructs = [
    /:=/,
    /->|=>/,
    /===|!==/,
    /\b(if|for|while|switch)\s*\(/,
    /\b(println!|print!|fmt\.\w+|console\.\w+)\s*\(/,
    /\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\(|::/,
    /[;{}]\s*$/,
    /[;{}]\s*\n/,
    /^\s*(?:#include|import\s+[\w{]|from\s+[\w.]+\s+import)/,
  ];

  let matches = 0;
  if (keywordPattern.test(trimmed)) matches += 2;
  for (const regex of codeConstructs) {
    if (regex.test(trimmed)) matches += 1;
  }
  if (/[{}]/.test(trimmed)) matches += 1;
  if (/\([^)]*["'\d][^)]*\)/.test(trimmed)) matches += 1;

  const commonProseWords =
    /\b(the|is|are|was|were|has|have|had|will|would|can|could|should|this|that|these|those|which|what|when|where|why|how|because|since|while|although|between|through|under|over|with|without|within)\b/gi;
  const proseWordCount = (trimmed.match(commonProseWords) || []).length;
  const sentenceCount = (trimmed.match(/\.\s+[A-Z]/g) || []).length;

  if (proseWordCount >= 4 && sentenceCount >= 1 && matches <= 1) {
    return false;
  }
  return matches >= 2 || (matches >= 1 && proseWordCount < 3);
}

/** Automatically wrap unfenced code in context with markdown code fences for syntax highlighting. */
export function formatCheckContext(context: string, languageHint = ""): string {
  if (!context) return "";
  const trimmed = context.trim();
  if (trimmed.includes("```") || trimmed.includes("~~~")) return context;

  // Restore statements that may have been joined without newlines
  const cleanCode = (code: string) =>
    code.replace(
      /(\))\s+([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?\()/g,
      "$1\n$2"
    );

  // Check if context has prose intro followed by code
  const lines = trimmed.split("\n");
  if (lines.length >= 2 && isProseLeadIn(lines[0])) {
    const firstLine = lines[0].trim();
    const remaining = lines.slice(1).join("\n").trim();
    if (looksLikeCode(remaining)) {
      return (
        firstLine +
        "\n\n```" +
        (languageHint || "") +
        "\n" +
        cleanCode(remaining) +
        "\n```"
      );
    }
  }

  // Check if entire context is code
  if (looksLikeCode(trimmed)) {
    return (
      "```" +
      (languageHint || "") +
      "\n" +
      cleanCode(trimmed) +
      "\n```"
    );
  }

  return context;
}

/** Keep declarations out of a question's typographic heading without changing their source. */
export function questionPresentation(question: string) {
  const snippets: string[] = [];
  const stem = question
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (part.startsWith("```") || part.startsWith("~~~")) return part;
      return part.replace(
        /(?<!`)`([^`\n]+)`(?!`)/g,
        (original, source: string) => {
          const declaration =
            /^(?:type|class|struct|interface|enum|def|fn|func|function|impl)\b/.test(
              source.trim()
            );
          if ((!declaration || source.length < 26) && source.length < 65)
            return original;
          // Named declarations retain their natural reference in the sentence.
          const named =
            /^(?:type|class|struct|interface|enum|def|fn|function|impl)\s+([\w$]+)/.exec(
              source.trim()
            ) || /^func\s+(?:\([^)]*\)\s*)?([\w$]+)/.exec(source.trim());
          snippets.push(source);
          return "`" + (named?.[1] || `snippet ${snippets.length}`) + "`";
        }
      );
    })
    .join("");
  return { stem, snippets };
}
