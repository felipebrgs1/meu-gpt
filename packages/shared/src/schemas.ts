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
  // ephemeral: testa sem deixar rastro (não persiste conversa nem mensagens no D1).
  // Agentes DEVEM usar ephemeral:true — ou apagar a conversa no finally (ver scripts/e2e-chat-test.mjs).
  ephemeral: z.boolean().optional().default(false),
  // webSearch: busca na web (DuckDuckGo Lite) e/ou fetch de URL para fatos atualizados (custo zero).
  webSearch: z.boolean().optional(),
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

// Auth single-user: primeira sessão obriga a trocar a credencial default
// (user/123456). Login devolve mustChangePassword + username; enquanto
// mustChangePassword=true, a API bloqueia tudo (403 password_change_required)
// exceto /auth/status e /auth/change-password. Usuário e senha são mutáveis
// em D1 (tabela auth_state) — a troca pode levar um ou os dois de cada vez.
export const loginRequestSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  token: z.string().min(1),
  mustChangePassword: z.boolean(),
  username: z.string(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const newUsernameSchema = z
  .string()
  .trim()
  .min(2, "usuário precisa de ao menos 2 caracteres")
  .max(50, "usuário muito longo (50 chars max)");

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z
      .string()
      .min(8, "nova senha precisa de ao menos 8 caracteres")
      .max(200)
      .optional(),
    newUsername: newUsernameSchema.optional(),
  })
  .refine((d) => d.newPassword || d.newUsername, {
    message: "informe o novo usuário e/ou a nova senha",
  });

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const authStatusResponseSchema = z.object({
  mustChangePassword: z.boolean(),
  username: z.string(),
});

export type AuthStatusResponse = z.infer<typeof authStatusResponseSchema>;

// Eventos SSE do chat:
// text: { token } | done: { fullText, citations, usage } | error: { message }
export const citationSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  chunkId: z.string(),
  score: z.number(),
});

export type Citation = z.infer<typeof citationSchema>;

// Tools de web (busca DuckDuckGo Lite + fetch de página — sem key, sem custo)
export const webSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  maxResults: z.number().int().min(1).max(20).optional(),
});

export type WebSearchRequest = z.infer<typeof webSearchRequestSchema>;

export const webFetchRequestSchema = z.object({
  url: z.string().trim().url(),
});

export type WebFetchRequest = z.infer<typeof webFetchRequestSchema>;

export const webSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

export const webSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(webSearchResultSchema),
  tookMs: z.number(),
});

export type WebSearchResult = z.infer<typeof webSearchResultSchema>;
export type WebSearchResponse = z.infer<typeof webSearchResponseSchema>;

export const webFetchResponseSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  title: z.string().nullable(),
  content: z.string(),
  truncated: z.boolean(),
  tookMs: z.number(),
});

export type WebFetchResponse = z.infer<typeof webFetchResponseSchema>;
