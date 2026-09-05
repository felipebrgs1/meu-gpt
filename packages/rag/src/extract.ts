// Extrator universal de texto para RAG: PDF, DOCX, TXT, MD
// Roda em runtime edge / Cloudflare Workers
import { extractText } from "unpdf";
import mammoth from "mammoth";

export interface ExtractedDocument {
  text: string;
  pageCount?: number;
}

export async function extractTextFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
  mimeType?: string,
): Promise<ExtractedDocument> {
  const lowerName = filename.toLowerCase();
  const lowerMime = (mimeType ?? "").toLowerCase();

  // 1. PDF
  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const result = await extractText(uint8, { mergePages: true });
    const text =
      typeof result.text === "string" ? result.text : (result.text as string[]).join("\n\n");
    return {
      text: text.trim(),
      pageCount: result.totalPages,
    };
  }

  // 2. DOCX (Word)
  if (
    lowerName.endsWith(".docx") ||
    lowerMime.includes("wordprocessingml") ||
    lowerMime.includes("docx")
  ) {
    const ab = (
      buffer instanceof ArrayBuffer
        ? buffer
        : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    ) as ArrayBuffer;
    const result = await (
      mammoth as {
        extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
      }
    ).extractRawText({
      arrayBuffer: ab,
    });
    return {
      text: (result.value ?? "").trim(),
    };
  }

  // 3. Texto puro / Markdown / CSV / JSON
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(buffer);
  return {
    text: text.trim(),
  };
}
