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
  // RAG
  documentIds: z.array(z.string()).max(20).optional(),
  useRag: z.boolean().default(false),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const ingestRequestSchema = z.object({
  title: z.string().min(1).max(200),
  // MVP: texto já extraído no client ou texto pequeno.
  // PDF grande fica pra depois (parse assíncrono + R2).
  text: z.string().min(1).max(200_000),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

// Eventos SSE do chat:
// text: { token } | done: { fullText, citations, usage } | error: { message }
export const citationSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  chunkId: z.string(),
  score: z.number(),
});

export type Citation = z.infer<typeof citationSchema>;
