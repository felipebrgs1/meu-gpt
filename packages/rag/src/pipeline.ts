import type { EmbeddingProvider, VectorStore, Reranker, RerankCandidate } from "./types.js";

// Fluxo travado: Vectorize top-k 16-24 → rerank → top 4-6 no contexto,
// com corte de relevância (minScore): sem hits bons, retorna vazio.
export async function retrieveContext(opts: {
  query: string;
  embedder: EmbeddingProvider;
  store: VectorStore;
  reranker: Reranker;
  topK?: number;
  topN?: number;
  minScore?: number;
  filter?: Record<string, unknown>;
  loadText: (id: string) => Promise<{ text: string; documentId: string; title: string } | null>;
}) {
  const { query, embedder, store, reranker, loadText } = opts;
  const defaultTopK = typeof process !== "undefined" ? Number(process.env?.RAG_TOPK ?? 20) : 20;
  const defaultTopN = typeof process !== "undefined" ? Number(process.env?.RERANK_TOPN ?? 5) : 5;
  const rawMin = typeof process !== "undefined" ? Number(process.env?.RAG_MIN_SCORE ?? 0.5) : 0.5;
  const topK = opts.topK ?? defaultTopK;
  const topN = opts.topN ?? defaultTopN;
  // Relevance gate (option 2): without rerank, rerankScore === vectorScore
  // (Vectorize cosine), so the same threshold works for both modes.
  const minScore = opts.minScore ?? (Number.isFinite(rawMin) ? rawMin : 0.5);

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
  // Drop low-relevance hits: caller falls back to general knowledge.
  return ranked.filter((r) => r.rerankScore >= minScore);
}

export function buildRagPrompt(query: string, docs: { title: string; text: string }[]): string {
  const ctx = docs.map((d, i) => `### [${i + 1}] ${d.title}\n${d.text}`).join("\n\n");
  return `Use o contexto abaixo como fonte prioritária. Se ele for relevante para a pergunta, responda com base nele e cite as fontes usadas como [1], [2], etc. Se o contexto NÃO tiver relação com a pergunta ou não for suficiente, responda normalmente com seu conhecimento geral e avise no início com uma frase como "Não encontrei nos documentos, mas...".\n\nContexto:\n${ctx}\n\nPergunta: ${query}`;
}
