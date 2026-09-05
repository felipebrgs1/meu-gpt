import type { Citation, Conversation } from "@meu-gpt/shared";
import type { ConversationRow } from "../models/conversation.model.js";
import type { MessageRow } from "../models/message.model.js";
import type { DocumentRow } from "../models/document.model.js";

// VIEWS — presenters: moldam as entidades para a saída HTTP/JSON

export function toConversationDTO(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    slot: row.slot as Conversation["slot"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  costUsd: number | null;
  tps: number | null;
  cachedTokens: number | null;
  citations: Citation[];
  createdAt: string;
}

export function toMessageDTO(row: MessageRow): MessageDTO {
  let citations: Citation[] = [];
  try {
    citations = row.citationsJson ? (JSON.parse(row.citationsJson) as Citation[]) : [];
  } catch {
    citations = [];
  }
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageDTO["role"],
    content: row.content,
    model: row.model,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    latencyMs: row.latencyMs,
    costUsd: row.costUsd,
    tps: row.tps,
    cachedTokens: row.cachedTokens,
    citations,
    createdAt: row.createdAt,
  };
}

export interface DocumentDTO {
  id: string;
  title: string;
  r2Key: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  pageCount: number | null;
  chunkCount: number;
  createdAt: string;
}

export function toDocumentDTO(row: DocumentRow): DocumentDTO {
  return {
    id: row.id,
    title: row.title,
    r2Key: row.r2Key,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    pageCount: row.pageCount,
    chunkCount: row.chunkCount,
    createdAt: row.createdAt,
  };
}
