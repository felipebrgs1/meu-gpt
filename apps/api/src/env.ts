export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  R2_BUCKET: R2Bucket;
  OPENROUTER_API_KEY: string;
  JWT_SECRET: string;
  VOYAGE_API_KEY?: string;
  EMBED_MODEL: string;
  CHAT_MODEL_FAST: string;
  CHAT_MODEL_CHEAP: string;
  CHAT_MODEL_QUALITY: string;
  RERANK_ENABLED: string;
  RERANK_MODEL: string;
  RAG_TOPK: string;
  RERANK_TOPN: string;
  SINGLE_USER_ID: string;
  OPENROUTER_BASE_URL?: string;
}
