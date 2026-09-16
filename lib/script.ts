import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export async function extractScriptText(file: File) {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join("\n\n") : extracted.text;
    return String(text || "").trim();
  }

  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return buffer.toString("utf8").trim();
  }

  throw new Error("Formato no soportado. Usa PDF, Word (.docx) o texto plano.");
}
