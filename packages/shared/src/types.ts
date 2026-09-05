import type { Citation } from "./schemas.js";

export interface Conversation {
  id: string;
  title: string;
  slot: "fast" | "cheap" | "quality";
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  // Log obrigatório por mensagem assistant (decisão travada)
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  costUsd: number | null;
  tps: number | null;
  cachedTokens: number | null;
  citations: Citation[] | null;
  createdAt: string;
}

// Usage anexado ao evento SSE `done` e persistido no log da mensagem.
// tps = tokens de saída por segundo (janela de decode); cachedTokens = hits
// de prompt-cache reportados pelo provider via OpenRouter (null = sem info).
export interface ChatUsage {
  model: string;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  tps: number | null;
  costUsd: number | null;
  cachedTokens: number | null;
}

export interface DocMeta {
  id: string;
  title: string;
  r2Key: string;
  chunkCount: number;
  createdAt: string;
}
