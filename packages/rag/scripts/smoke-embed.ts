// Passo 0 da ordem de build: trava 1024 + cosine + encoding.
// Roda isolado: pnpm --filter @meu-gpt/rag smoke:embed
// Precisa de OPENROUTER_API_KEY no env.
import { OpenRouterEmbedding } from "../src/providers/openrouter-embed.js";
import { splitText } from "../src/chunk.js";

const SAMPLE = `RAG smoke test. `.repeat(40) + `\nVectorize 1024 cosine. `.repeat(40);

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY ausente. Exporte antes de rodar.");
  const embedder = new OpenRouterEmbedding(key);
  const chunks = splitText(SAMPLE + "\nDoc sobre gatos, cachorros, RAG e Cloudflare. ".repeat(20), 1200, 150).slice(0, 20);
  console.log(`chunks: ${chunks.length}`);
  const vecs = await embedder.embedDocuments(chunks);
  console.log(`dims chunk[0]: ${vecs[0].length}`);
  if (vecs[0].length !== 1024) throw new Error("Dimensão != 1024. Abortar antes de criar índice.");
  const q = await embedder.embedQuery("o que o doc diz sobre RAG?");
  console.log(`dims query: ${q.length}`);
  // cosine local top-k só pra validar encoding consistente
  const cos = (a: number[], b: number[]) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  };
  const ranked = vecs.map((v, i) => ({ i, s: cos(q, v) })).sort((a, b) => b.s - a.s).slice(0, 5);
  console.log("top-5 local (idx, cosine):", ranked);
  console.log("OK: 1024 + float consistente. Pode criar índice: npx wrangler vectorize create meu-gpt --dimensions=1024 --metric=cosine");
}

main().catch((e) => { console.error(e); process.exit(1); });
