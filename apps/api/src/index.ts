import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { createDb, conversations, messages, documents, eq, desc } from "@meu-gpt/db";
import { chatRequestSchema } from "@meu-gpt/shared";
import {
  OpenRouterEmbedding,
  VectorizeStore,
  VoyageReranker,
  retrieveContext,
  buildRagPrompt,
  splitText,
  extractTextFromBuffer,
} from "@meu-gpt/rag";
import type { Env } from "./env.js";
import { singleUserAuth } from "./lib/auth.js";
import { openRouterChatStream, resolveSlotModel } from "./lib/openrouter.js";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

const rid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------- public ----------
app.get("/api/v1/health", (c) => c.json({ ok: true, vectorize: "meu-gpt/1024/cosine" }));

app.post("/api/v1/auth/dev-token", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  if (body["setupSecret"] !== c.env.JWT_SECRET) return c.json({ error: "bad secret" }, 403);
  const token = await sign({ sub: c.env.SINGLE_USER_ID, iat: Math.floor(Date.now() / 1000) }, c.env.JWT_SECRET);
  return c.json({ token });
});

app.use("/api/v1/*", singleUserAuth);

// ---------- conversations (D1) ----------
app.get("/api/v1/conversations", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(50);
  return c.json(rows);
});

app.post("/api/v1/conversations", async (c) => {
  const db = createDb(c.env.DB);
  const id = rid();
  const t = now();
  await db.insert(conversations).values({ id, title: "Nova conversa", slot: "cheap", createdAt: t, updatedAt: t });
  return c.json({ id });
});
app.get("/api/v1/conversations/:id/messages", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(messages).where(eq(messages.conversationId, c.req.param("id"))).limit(200);
  return c.json(rows);
});

app.delete("/api/v1/conversations/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
  return c.json({ ok: true });
});

// ---------- documents / ingest ----------
// Regra: o ARQUIVO ORIGINAL fica no R2 (raw/{docId}/{filename}) e os chunks
// indexados no Vectorize (texto dos chunks também no R2: chunks/{docId}#i.txt).
const MAX_UPLOAD = 10 * 1024 * 1024; // 10MB
const ACCEPTED_EXT = [".pdf", ".docx", ".txt", ".md", ".csv", ".json"];

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
}

async function ingestFile(c: any, file: File, titleOverride?: string) {
  const filename = safeFilename(file.name || "document");
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_EXT.includes(ext)) {
    return c.json({ error: `Extensão não suportada: ${ext}. Aceito: ${ACCEPTED_EXT.join(", ")}` }, 400);
  }
  if (file.size > MAX_UPLOAD) {
    return c.json({ error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 10MB no MVP.` }, 400);
  }

  const db = createDb(c.env.DB);
  const docId = rid();
  const r2Key = `raw/${docId}/${filename}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  // IMPORTANTE: pdf.js (unpdf) pode transferir/detach o ArrayBuffer durante a extração,
  // zerando o buffer original. Enviamos uma CÓPIA para extração e guardamos `bytes` p/ o R2.
  const extractBytes = bytes.slice();

  // 1. Extrai texto do buffer (PDF/DOCX/TXT/MD)
  let extracted;
  try {
    extracted = await extractTextFromBuffer(extractBytes, filename, file.type);
  } catch (e) {
    return c.json({ error: `Falha ao extrair texto de ${filename}: ${e instanceof Error ? e.message : e}` }, 422);
  }
  if (!extracted.text || extracted.text.length < 10) {
    return c.json({ error: `Não foi possível extrair texto de ${filename} (PDF escaneado? Use OCR na V2).` }, 422);
  }

  const title = (titleOverride?.trim() || filename.replace(/\.[^.]+$/, "")).slice(0, 200);

  // 2. Chunking + embed
  const chunks = splitText(extracted.text).slice(0, 200);
  const embedder = new OpenRouterEmbedding(c.env.OPENROUTER_API_KEY, c.env.EMBED_MODEL, c.env.OPENROUTER_BASE_URL);
  const vecs = await embedder.embedDocuments(chunks);
  const store = new VectorizeStore(c.env.VECTORIZE);

  // 3. Original no R2 (regra: doc original sempre preservado)
  await c.env.R2_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { originalFilename: file.name || filename, documentId: docId, title },
  });

  // 4. Vetores no Vectorize + chunks no R2
  const vectors = vecs.map((values: number[], i: number) => ({
    id: `${docId}#${i}`,
    values,
    metadata: { documentId: docId, title, chunkIndex: i },
  }));
  await store.upsert(vectors);
  for (let i = 0; i < chunks.length; i++) {
    await c.env.R2_BUCKET.put(`chunks/${docId}#${i}.txt`, chunks[i], {
      customMetadata: { documentId: docId, title },
    });
  }

  // 5. Metadados no D1
  const t = now();
  await db.insert(documents).values({
    id: docId,
    title,
    r2Key,
    originalFilename: file.name || filename,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    pageCount: extracted.pageCount ?? null,
    chunkCount: chunks.length,
    createdAt: t,
  });

  return c.json({
    documentId: docId,
    title,
    originalFilename: file.name || filename,
    r2Key,
    chunkCount: chunks.length,
    pageCount: extracted.pageCount ?? null,
    fileSize: file.size,
  });
}

// Ingestão por texto puro colado (JSON) — mantém compat com o modal anterior
app.post("/api/v1/documents/ingest-text", async (c) => {
  const body = await c.req
    .json<{ title?: string; text?: string }>()
    .catch(() => ({}) as { title?: string; text?: string });
  const title = (body.title ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!title || !text) return c.json({ error: "title e text obrigatórios" }, 400);
  if (text.length > 200_000) return c.json({ error: "texto muito grande (200k chars max)" }, 400);

  const db = createDb(c.env.DB);
  const docId = rid();
  const r2Key = `raw/${docId}/${safeFilename(title)}.txt`;
  const chunks = splitText(text).slice(0, 200);

  const embedder = new OpenRouterEmbedding(c.env.OPENROUTER_API_KEY, c.env.EMBED_MODEL, c.env.OPENROUTER_BASE_URL);
  const vecs = await embedder.embedDocuments(chunks);
  const store = new VectorizeStore(c.env.VECTORIZE);

  await c.env.R2_BUCKET.put(r2Key, text, { httpMetadata: { contentType: "text/plain" }, customMetadata: { documentId: docId, title } });
  const vectors = vecs.map((values: number[], i: number) => ({
    id: `${docId}#${i}`,
    values,
    metadata: { documentId: docId, title, chunkIndex: i },
  }));
  await store.upsert(vectors);
  for (let i = 0; i < chunks.length; i++) {
    await c.env.R2_BUCKET.put(`chunks/${docId}#${i}.txt`, chunks[i], { customMetadata: { documentId: docId, title } });
  }

  const t = now();
  await db.insert(documents).values({
    id: docId,
    title,
    r2Key,
    originalFilename: `${safeFilename(title)}.txt`,
    mimeType: "text/plain",
    fileSize: text.length,
    pageCount: null,
    chunkCount: chunks.length,
    createdAt: t,
  });
  return c.json({ documentId: docId, title, r2Key, chunkCount: chunks.length, fileSize: text.length });
});

// Upload multipart de arquivo (pdf/docx/txt/md)
app.post("/api/v1/documents/ingest", async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "multipart/form-data esperado" }, 400);
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "campo 'file' ausente" }, 400);
  const title = typeof form.get("title") === "string" ? (form.get("title") as string) : undefined;
  return ingestFile(c, file, title);
});

// Lista documentos indexados
app.get("/api/v1/documents", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(documents).orderBy(desc(documents.createdAt)).limit(100);
  return c.json(rows);
});

// Download do arquivo original direto do R2
app.get("/api/v1/documents/:id/raw", async (c) => {
  const db = createDb(c.env.DB);
  const [doc] = await db.select().from(documents).where(eq(documents.id, c.req.param("id"))).limit(1);
  if (!doc) return c.json({ error: "documento não encontrado" }, 404);
  const obj = await c.env.R2_BUCKET.get(doc.r2Key);
  if (!obj) return c.json({ error: "objeto R2 ausente" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.originalFilename || "document"}"`,
    },
  });
});

// Delete: remove vetores do Vectorize + chunks + original no R2 + linha no D1
app.delete("/api/v1/documents/:id", async (c) => {
  const db = createDb(c.env.DB);
  const docId = c.req.param("id");
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
  if (!doc) return c.json({ error: "documento não encontrado" }, 404);

  const store = new VectorizeStore(c.env.VECTORIZE);
  await store.deleteByIds(Array.from({ length: doc.chunkCount }, (_, i) => `${docId}#${i}`));
  await c.env.R2_BUCKET.delete(doc.r2Key);
  for (let i = 0; i < doc.chunkCount; i++) {
    await c.env.R2_BUCKET.delete(`chunks/${docId}#${i}.txt`);
  }
  await db.delete(documents).where(eq(documents.id, docId));
  return c.json({ ok: true, deletedVectors: doc.chunkCount });
});

// ---------- chat SSE ----------
app.post("/api/v1/chat", zValidator("json", chatRequestSchema), async (c) => {
  const req = c.req.valid("json");
  const db = createDb(c.env.DB);
  const t0 = Date.now();

  const conversationId = req.conversationId ?? rid();
  const model = req.model ?? resolveSlotModel(c.env, req.slot);

  // garante conversa
  const t = now();
  await db.insert(conversations).values({ id: conversationId, title: req.messages.at(-1)?.content.slice(0, 60) ?? "Nova conversa", slot: req.slot, createdAt: t, updatedAt: t }).onConflictDoNothing();

  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  let ragDocs: { title: string; text: string }[] = [];
  let citations: { documentId: string; title: string; chunkId: string; score: number }[] = [];

  if (req.useRag && lastUser) {
    const embedder = new OpenRouterEmbedding(c.env.OPENROUTER_API_KEY, c.env.EMBED_MODEL, c.env.OPENROUTER_BASE_URL);
    const store = new VectorizeStore(c.env.VECTORIZE);
    const reranker = new VoyageReranker(c.env.VOYAGE_API_KEY ?? c.env.OPENROUTER_API_KEY, {
      model: c.env.RERANK_MODEL,
      enabled: c.env.RERANK_ENABLED === "true",
      baseUrl: c.env.OPENROUTER_BASE_URL,
    });
    const ranked = await retrieveContext({
      query: lastUser.content,
      embedder,
      store,
      reranker,
      topK: Number(c.env.RAG_TOPK ?? 20),
      topN: Number(c.env.RERANK_TOPN ?? 5),
      loadText: async (id: string) => {
        const obj = await c.env.R2_BUCKET.get(`chunks/${id}.txt`);
        if (!obj) return null;
        const text = await obj.text();
        const meta = (obj as unknown as { customMetadata?: Record<string, string> }).customMetadata;
        // documentId/title vêm do id + fallback; metadata rica está no Vectorize
        const [documentId] = id.split("#");
        const doc = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
        void meta;
        return { text, documentId, title: doc[0]?.title ?? documentId };
      },
    });
    ragDocs = ranked.map((r: { title: string; text: string }) => ({ title: r.title, text: r.text }));
    citations = ranked.map((r: { documentId: string; title: string; id: string; rerankScore: number }) => ({ documentId: r.documentId, title: r.title, chunkId: r.id, score: r.rerankScore }));
  }

  await db.update(conversations).set({ updatedAt: t }).where(eq(conversations.id, conversationId));

  const userMsgId = rid();
  if (lastUser) {
    await db.insert(messages).values({
      id: userMsgId, conversationId, role: "user", content: lastUser.content,
      model: null, tokensIn: null, tokensOut: null, latencyMs: null, costUsd: null, citationsJson: null, createdAt: now(),
    });
  }

  const llmMessages = ragDocs.length && lastUser
    ? [...req.messages.slice(0, -1), { role: "user" as const, content: buildRagPrompt(lastUser.content, ragDocs) }]
    : req.messages;

  const upstream = await openRouterChatStream({ env: c.env, model, messages: llmMessages });

  // SSE: repassa tokens e no final salva + emite done com citações (só no final)
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullText = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith("data:")) continue;
            const payload = l.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const token: string = json.choices?.[0]?.delta?.content ?? "";
              if (token) { fullText += token; send("token", { token }); }
            } catch { /* keep-alive */ }
          }
        }
        const latencyMs = Date.now() - t0;
        // usage real exigiria non-stream; logamos nulls + latência (evoluir com x-openrouter usage)
        await db.insert(messages).values({
          id: rid(), conversationId, role: "assistant", content: fullText,
          model, tokensIn: null, tokensOut: null, latencyMs, costUsd: null,
          citationsJson: JSON.stringify(citations), createdAt: now(),
        });
        send("done", { fullText, citations, usage: { model, latencyMs }, conversationId });
      } catch (e) {
        send("error", { message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
});

export default app;
