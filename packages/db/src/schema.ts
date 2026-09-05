import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Uso só pessoal: sem users/workspaces/roles no MVP.
// SINGLE_USER_ID fixo via env. Tabelas mínimas.

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Nova conversa"),
  slot: text("slot").notNull().default("cheap"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  // Log por mensagem (decisão travada)
  model: text("model"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  latencyMs: integer("latency_ms"),
  costUsd: real("cost_usd"),
  // Decode speed (tokens/s) and prompt-cache hits reported by OpenRouter.
  tps: real("tps"),
  cachedTokens: integer("cached_tokens"),
  citationsJson: text("citations_json"),
  createdAt: text("created_at").notNull(),
});

// Só metadado curto. Texto do chunk vai no R2, vetor no Vectorize,
// e o ARQUIVO ORIGINAL (pdf/docx/txt/md) também fica no R2 (r2Key).
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  r2Key: text("r2_key").notNull(), // objeto original: raw/{docId}/{filename}
  originalFilename: text("original_filename").notNull().default(""),
  mimeType: text("mime_type").notNull().default("text/plain"),
  fileSize: integer("file_size").notNull().default(0), // bytes
  pageCount: integer("page_count"), // só PDF
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
