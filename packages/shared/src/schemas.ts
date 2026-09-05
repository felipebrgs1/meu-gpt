import { z } from "zod";

export const modelSlotSchema = z.enum(["fast", "cheap", "quality"]);

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(50_000),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  slot: modelSlotSchema.default("cheap"),
  // model override explícito (debug). Se ausente, resolve via slot.
  model: z.string().min(1).max(120).optional(),
  messages: z.array(chatMessageSchema).min(1).max(100),
  // RAG é SEMPRE ativo. Seletor de fontes: ausente/vazio = todos os documentos;
  // com ids, filtra o Vectorize por metadata documentId ($in).
  documentIds: z.array(z.string()).max(50).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const ingestRequestSchema = z.object({
  title: z.string().min(1).max(200),
  // Texto puro colado (usado pelo modal "colar texto")
  text: z.string().min(1).max(200_000),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

// Upload multipart: file (pdf/docx/txt/md) + title opcional
export const ACCEPTED_DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — PDFs grandes ficam pra V2 (async)

// Eventos SSE do chat:
// text: { token } | done: { fullText, citations, usage } | error: { message }
export const citationSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  chunkId: z.string(),
  score: z.number(),
});

export type Citation = z.infer<typeof citationSchema>;
