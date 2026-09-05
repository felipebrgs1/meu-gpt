// Interfaces estáveis — trocar provider sem refatorar.
// Decisões travadas:
// - Embedding 1024 nativo, cosine, encoding float, sem truncate pra 768
// - embedQuery / embedDocuments separados (V2: pplx-embed-context na ingestão)
// - Rerank é POST depois do Vectorize (não Atlas/$rerank)

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: 1024;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorStore {
  upsert(vectors: { id: string; values: number[]; metadata?: Record<string, unknown> }[]): Promise<void>;
  query(vector: number[], topK: number, filter?: Record<string, unknown>): Promise<VectorMatch[]>;
  deleteByIds?(ids: string[]): Promise<void>;
}

export interface RerankCandidate {
  id: string;
  text: string;
  vectorScore: number;
  documentId: string;
  title: string;
}

export interface RerankedDoc extends RerankCandidate {
  rerankScore: number;
}

export interface Reranker {
  readonly enabled: boolean;
  readonly model: string;
  rerank(query: string, candidates: RerankCandidate[], topN: number): Promise<RerankedDoc[]>;
}
