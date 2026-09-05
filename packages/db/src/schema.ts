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

// Anti-brute-force: tentativas de login por IP. Sem isso, MemoryStore do
// rate-limiter (por isolate) não segura nada em Workers — D1 é persistente.
// Fail-open: se a tabela não existir, o login continua funcionando.
// Rate limit genérico (janela fixa) em D1: mesma razão do loginAttempts —
// MemoryStore não sobrevive entre isolates do Workers.
// key = `rl:<nome>:<ip>:<janela>`; limpeza oportunista no rollover da janela.
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(), // epoch ms do início da janela
  hits: integer("hits").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  ip: text("ip").primaryKey(),
  fails: integer("fails").notNull().default(0),
  lockedUntil: integer("locked_until"), // epoch ms; null = sem lock
  updatedAt: text("updated_at").notNull(),
});

// Auth single-user: credencial customizada (troca obrigatória na 1ª sessão).
// Sem linha = credencial default ainda ativa (DEFAULT_USER/LOGIN_PASS do service)
// e mustChange = true. Após a troca, mustChange = 0 e o login passa a
// validar só contra username + hash em D1 (o default deixa de valer).
export const authState = sqliteTable("auth_state", {
  id: text("id").primaryKey(), // sempre 'single'
  username: text("username").notNull().default("user"), // login mutável
  passwordHash: text("password_hash").notNull(), // SHA-256(salt:password) em hex
  passwordSalt: text("password_salt").notNull(), // 16 bytes em hex
  mustChange: integer("must_change").notNull().default(1), // 1 = troca pendente
  updatedAt: text("updated_at").notNull(),
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
