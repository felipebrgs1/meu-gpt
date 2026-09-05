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
  citationsJson: text("citations_json"),
  createdAt: text("created_at").notNull(),
});

// Só metadado curto. Texto do chunk vai no R2, vetor no Vectorize.
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  r2Key: text("r2_key").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
