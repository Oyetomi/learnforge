/**
 * Extracts readable text from uploaded local files (.md, .txt, source code, and .pdf).
 */

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\(\d{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8))
    )
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractTextFromPdfContentStream(content: string): string {
  const chunks: string[] = [];
  const btBlocks = content.match(/BT[\s\S]*?ET/g) || [content];
  for (const block of btBlocks) {
    const lines: string[] = [];
    // Match TJ arrays: [(Hello) -20 (world)] TJ
    const tjArrayRegex = /\[((?:[^[\]]|\([^)]*\))*)\]\s*TJ/g;
    let match: RegExpExecArray | null;
    while ((match = tjArrayRegex.exec(block)) !== null) {
      const inner = match[1];
      const parts: string[] = [];
      const litRegex = /\(((?:\\.|[^\\()])*)\)/g;
      let lit: RegExpExecArray | null;
      while ((lit = litRegex.exec(inner)) !== null) {
        parts.push(decodePdfLiteral(lit[1]));
      }
      if (parts.length) lines.push(parts.join(""));
    }
    // Match single (text) Tj or ' or "
    const singleTjRegex = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/g;
    while ((match = singleTjRegex.exec(block)) !== null) {
      lines.push(decodePdfLiteral(match[1]));
    }
    if (lines.length) chunks.push(lines.join(" "));
  }
  return chunks
    .join("\n")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function tryInflate(
  data: Uint8Array,
  format: "deflate" | "deflate-raw"
): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(data)).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parts.push(value);
        total += value.byteLength;
        if (total > 512_000) break;
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const extractedParts: string[] = [];

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = streamRegex.exec(latin1)) !== null && count < 80) {
    count++;
    const rawStream = match[1];
    const startOffset =
      match.index + match[0].indexOf(rawStream);
    const streamBytes = bytes.subarray(
      startOffset,
      startOffset + rawStream.length
    );

    let decoded = rawStream;
    if (!/BT[\s\S]*?ET/.test(rawStream)) {
      const inflated =
        (await tryInflate(streamBytes, "deflate")) ||
        (await tryInflate(streamBytes, "deflate-raw"));
      if (inflated && inflated.length > 0) {
        decoded = new TextDecoder("latin1").decode(inflated);
      }
    }
    if (/BT[\s\S]*?ET|\)\s*Tj|\]\s*TJ/.test(decoded)) {
      const text = extractTextFromPdfContentStream(decoded);
      if (text.length > 2) extractedParts.push(text);
    }
  }

  if (extractedParts.length === 0) {
    const fallback = extractTextFromPdfContentStream(latin1);
    if (fallback.length > 10) extractedParts.push(fallback);
  }

  const combined = extractedParts.join("\n\n").trim();
  if (!combined) {
    throw new Error(
      "Could not extract selectable text from this PDF. Paste your notes below or attach a Markdown/text/code file."
    );
  }
  return combined.slice(0, 64000);
}

function readFileAsTextFallback(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsText(file);
  });
}

function readFileAsBytesFallback(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buf) => new Uint8Array(buf));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("Could not read PDF bytes."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read the selected PDF."));
    reader.readAsArrayBuffer(file);
  });
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.size > 10_000_000) throw new Error("Choose a smaller file (up to 10 MB), or paste the section you want to learn.");
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const bytes = await readFileAsBytesFallback(file);
    return extractPdfText(bytes);
  }
  const text = await readFileAsTextFallback(file);
  const cleaned = text.replace(/\0/g, "").trim();
  if (!cleaned) {
    throw new Error("The selected file is empty.");
  }
  return cleaned.slice(0, 64000);
}
