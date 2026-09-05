// Chunking simples e determinístico pro MVP.
// ~500-800 tokens ≈ 2000-3200 chars. Overlap 10-15%.
export function splitText(text: string, maxChars = 2800, overlap = 350): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= maxChars) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + maxChars, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks;
}
