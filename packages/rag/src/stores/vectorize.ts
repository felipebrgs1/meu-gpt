import type { VectorStore, VectorMatch } from "../types.js";

// Wrapper fino sobre o binding Vectorize do Worker.
// Índice: npx wrangler vectorize create meu-gpt --dimensions=1024 --metric=cosine
export class VectorizeStore implements VectorStore {
  constructor(private index: VectorizeIndex) {}

  async upsert(vectors: { id: string; values: number[]; metadata?: Record<string, unknown> }[]): Promise<void> {
    for (const v of vectors) {
      if (v.values.length !== 1024) throw new Error(`upsert dim ${v.values.length} ≠ 1024`);
    }
    // Vectorize aceita metadataValues aninhado; mantemos plano p/ filtro simples.
    await this.index.upsert(
      vectors.map((v) => ({ id: v.id, values: v.values, metadata: v.metadata as unknown as Record<string, string | number | boolean | string[]> })),
    );
  }

  async query(vector: number[], topK: number, filter?: Record<string, unknown>): Promise<VectorMatch[]> {
    if (vector.length !== 1024) throw new Error(`query dim ${vector.length} ≠ 1024`);
    const out = await this.index.query(vector, {
      topK,
      filter: filter as unknown as Record<string, string | number | boolean> | undefined,
      returnMetadata: "all",
    });
    return out.matches.map((m) => ({ id: m.id, score: m.score, metadata: (m.metadata ?? {}) as Record<string, unknown> }));
  }
}
