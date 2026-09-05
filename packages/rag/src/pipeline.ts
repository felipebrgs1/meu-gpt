import type { EmbeddingProvider, VectorStore, Reranker, RerankCandidate } from "./types.js";

// Fluxo travado: Vectorize top-k 16-24 → rerank → top 4-6 no contexto.
export async function retrieveContext(opts: {
  query: string;
  embedder: EmbeddingProvider;
  store: VectorStore;
  reranker: Reranker;
  topK?: number;
  topN?: number;
  filter?: Record<string, unknown>;
  loadText: (id: string) => Promise<{ text: string; documentId: string; title: string } | null>;
}) {
  const { query, embedder, store, reranker, loadText } = opts;
  const topK = opts.topK ?? Number(process.env.RAG_TOPK ?? 20);
  const topN = opts.topN ?? Number(process.env.RERANK_TOPN ?? 5);

  const qvec = await embedder.embedQuery(query);
  const matches = await store.query(qvec, topK, opts.filter);

  const candidates: RerankCandidate[] = [];
  for (const m of matches) {
    const loaded = await loadText(m.id);
    if (!loaded) continue;
    candidates.push({
      id: m.id,
      text: loaded.text,
      vectorScore: m.score,
      documentId: loaded.documentId,
      title: loaded.title,
    });
  }
  const ranked = await reranker.rerank(query, candidates, topN);
  return ranked;
}

export function buildRagPrompt(query: string, docs: { title: string; text: string }[]): string {
  const ctx = docs.map((d, i) => `### [${i + 1}] ${d.title}\n${d.text}`).join("\n\n");
  return `Use o contexto abaixo para responder. Cite como [doc]. Se não houver resposta no contexto, diga que não encontrou.\n\nContexto:\n${ctx}\n\nPergunta: ${query}`;
}
