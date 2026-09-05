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
  citations: Citation[] | null;
  createdAt: string;
}

export interface DocMeta {
  id: string;
  title: string;
  r2Key: string;
  chunkCount: number;
  createdAt: string;
}
