/**
 * Extracts readable text from uploaded local files (.md, .txt, source code, and .pdf).
 */

export async function extractPdfText(bytes: Uint8Array | Blob): Promise<string> {
  const { readPdfBook } = await import("./pdfReader");
  const book = await readPdfBook(bytes, "Uploaded PDF");
  return (book.previewOnly ? "Opening-pages preview only; the remaining PDF pages have not been read.\n\n" : "") + book.pages.map((text, i) => text.trim() ? `PDF page ${i + 1}\n${text}` : "").filter(Boolean).join("\n\n").slice(0, 64000);
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

export async function extractTextFromFile(file: File): Promise<string> {

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return extractPdfText(file);
  }
  if (file.size > 10_000_000) throw new Error("Choose a text or code file up to 10 MB. PDFs are read in chunks without a fixed size limit.");
  const text = await readFileAsTextFallback(file);
  const cleaned = text.replace(/\0/g, "").trim();
  if (!cleaned) {
    throw new Error("The selected file is empty.");
  }
  return cleaned.slice(0, 64000);
}
