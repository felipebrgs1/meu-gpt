import type { Reranker, RerankCandidate, RerankedDoc } from "../types.js";

// Voyage AI (MongoDB) via OpenRouter — NÃO Atlas/$rerank.
// Default: voyageai/rerank-2.5 (32K, ~$0.05/M). Futuro: rerank-3 (quality) / rerank-3-lite (fast).
// MVP: RERANK_ENABLED=false → passthrough ordenado por vectorScore.
export class VoyageReranker implements Reranker {
  readonly model: string;
  readonly enabled: boolean;
  constructor(
    private apiKey: string,
    opts?: { model?: string; enabled?: boolean; baseUrl?: string },
  ) {
    this.model = opts?.model ?? process.env.RERANK_MODEL ?? "voyageai/rerank-2.5";
    this.enabled = opts?.enabled ?? process.env.RERANK_ENABLED === "true";
    this.baseUrl = opts?.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  }
  private baseUrl: string;

  async rerank(query: string, candidates: RerankCandidate[], topN: number): Promise<RerankedDoc[]> {
    if (!this.enabled || candidates.length === 0) {
      return [...candidates]
        .sort((a, b) => b.vectorScore - a.vectorScore)
        .slice(0, topN)
        .map((c) => ({ ...c, rerankScore: c.vectorScore }));
    }
    // OpenRouter expõe rerankers como chat? Voyage tem endpoint próprio.
    // Tentamos POST /rerank (compat OpenRouter/Voyage). Se falhar, cai pro passthrough.
    try {
      const res = await fetch(`${this.baseUrl}/rerank`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          query,
          documents: candidates.map((c) => c.text),
          top_k: topN,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: { index: number; relevance_score: number }[]; results?: { index: number; relevance_score: number }[] };
      const rows = json.data ?? json.results ?? [];
      return rows.map((r) => {
        const c = candidates[r.index];
        return { ...c, rerankScore: r.relevance_score };
      });
    } catch {
      return [...candidates]
        .sort((a, b) => b.vectorScore - a.vectorScore)
        .slice(0, topN)
        .map((c) => ({ ...c, rerankScore: c.vectorScore }));
    }
  }
}
