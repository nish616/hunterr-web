/**
 * Extract plaintext from a resume file (PDF, DOCX, TXT, MD).
 */
export async function extractResumeText(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf") {
    // pdf-parse v2.x is ESM with a class-based API. Instantiate PDFParse with
    // the buffer, then call .getText() which returns { text, numpages, ... }.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text.trim();
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }

  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return buffer.toString("utf-8").trim();
  }

  throw new Error(
    `Unsupported resume format: .${ext}. Use PDF, DOCX, TXT, or MD.`,
  );
}
