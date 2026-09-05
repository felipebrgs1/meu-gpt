import type { Env } from "../env.js";
import { createDb, documents, eq, type Db } from "@meu-gpt/db";
import {
  OpenRouterEmbedding,
  VectorizeStore,
  VoyageReranker,
  retrieveContext,
  buildRagPrompt,
  splitText,
  extractTextFromBuffer,
} from "@meu-gpt/rag";
import { documentModel } from "../models/document.model.js";

// SERVICE — orquestra ingestão (R2 + Vectorize + D1) e retrieval (RAG pipeline)

const MAX_UPLOAD = 10 * 1024 * 1024; // 10MB
const ACCEPTED_EXT = [".pdf", ".docx", ".txt", ".md", ".csv", ".json"];
const MAX_CHUNKS = 200;

export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
}

export function validateUpload(filename: string, size: number): string | null {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_EXT.includes(ext)) {
    return `Extensão não suportada: ${ext}. Aceito: ${ACCEPTED_EXT.join(", ")}`;
  }
  if (size > MAX_UPLOAD) {
    return `Arquivo muito grande (${(size / 1024 / 1024).toFixed(1)}MB). Máximo 10MB no MVP.`;
  }
  return null;
}

export function makeEmbedder(env: Env) {
  return new OpenRouterEmbedding(env.OPENROUTER_API_KEY, env.EMBED_MODEL, env.OPENROUTER_BASE_URL);
}

export function makeStore(env: Env) {
  return new VectorizeStore(env.VECTORIZE);
}

export function makeReranker(env: Env) {
  return new VoyageReranker(env.VOYAGE_API_KEY ?? env.OPENROUTER_API_KEY, {
    model: env.RERANK_MODEL,
    enabled: env.RERANK_ENABLED === "true",
    baseUrl: env.OPENROUTER_BASE_URL,
  });
}

interface IngestResult {
  documentId: string;
  title: string;
  originalFilename: string;
  r2Key: string;
  chunkCount: number;
  pageCount: number | null;
  fileSize: number;
}

// Persiste: original no R2 + vetores no Vectorize + chunks no R2 + metadado no D1
async function persistIngest(
  env: Env,
  opts: {
    docId: string;
    title: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    r2Key: string;
    text: string;
    chunks: string[];
    originalBytes?: Uint8Array;
    pageCount: number | null;
    contentType: string;
  },
): Promise<IngestResult> {
  const { docId, title, originalFilename, mimeType, fileSize, r2Key, chunks } = opts;

  const embedder = makeEmbedder(env);
  const vecs = await embedder.embedDocuments(chunks);
  const store = makeStore(env);

  // 1. ARQUIVO ORIGINAL no R2 (regra: original sempre preservado)
  if (opts.originalBytes) {
    await env.R2_BUCKET.put(r2Key, opts.originalBytes, {
      httpMetadata: { contentType: opts.contentType || "application/octet-stream" },
      customMetadata: { originalFilename, documentId: docId, title },
    });
  } else {
    await env.R2_BUCKET.put(r2Key, opts.text, {
      httpMetadata: { contentType: "text/plain" },
      customMetadata: { originalFilename, documentId: docId, title },
    });
  }

  // 2. Vetores no Vectorize
  const vectors = vecs.map((values: number[], i: number) => ({
    id: `${docId}#${i}`,
    values,
    metadata: { documentId: docId, title, chunkIndex: i },
  }));
  await store.upsert(vectors);

  // 3. Chunks no R2 (texto recuperável p/ loadText)
  for (let i = 0; i < chunks.length; i++) {
    await env.R2_BUCKET.put(`chunks/${docId}#${i}.txt`, chunks[i], {
      customMetadata: { documentId: docId, title },
    });
  }

  // 4. Metadado no D1
  const db = createDb(env.DB);
  await documentModel.insert(db, {
    id: docId,
    title,
    r2Key,
    originalFilename,
    mimeType,
    fileSize,
    pageCount: opts.pageCount,
    chunkCount: chunks.length,
    createdAt: new Date().toISOString(),
  });

  return {
    documentId: docId,
    title,
    originalFilename,
    r2Key,
    chunkCount: chunks.length,
    pageCount: opts.pageCount,
    fileSize,
  };
}

// Ingestão por arquivo (PDF/DOCX/TXT/MD/CSV/JSON)
export async function ingestFile(
  env: Env,
  opts: { bytes: Uint8Array; filename: string; mimeType: string; title?: string },
): Promise<{ ok: true; result: IngestResult } | { ok: false; reason: string }> {
  const filename = safeFilename(opts.filename);
  const validation = validateUpload(filename, opts.bytes.byteLength);
  if (validation) return { ok: false, reason: validation };

  // IMPORTANTE: pdf.js (unpdf) pode transferir/detach o ArrayBuffer durante a
  // extração. Extraímos de uma CÓPIA e preservamos `bytes` p/ o R2.
  let extracted;
  try {
    extracted = await extractTextFromBuffer(opts.bytes.slice(), filename, opts.mimeType);
  } catch (e) {
    return { ok: false, reason: `Falha ao extrair texto de ${filename}: ${e instanceof Error ? e.message : e}` };
  }
  if (!extracted.text || extracted.text.length < 10) {
    return { ok: false, reason: `Não foi possível extrair texto de ${filename} (PDF escaneado? Use OCR na V2).` };
  }

  const title = (opts.title?.trim() || filename.replace(/\.[^.]+$/, "")).slice(0, 200);
  const docId = crypto.randomUUID();
  const result = await persistIngest(env, {
    docId,
    title,
    originalFilename: opts.filename,
    mimeType: opts.mimeType || "application/octet-stream",
    fileSize: opts.bytes.byteLength,
    r2Key: `raw/${docId}/${filename}`,
    text: extracted.text,
    chunks: splitText(extracted.text).slice(0, MAX_CHUNKS),
    originalBytes: opts.bytes,
    pageCount: extracted.pageCount ?? null,
    contentType: opts.mimeType,
  });
  return { ok: true, result };
}

// Ingestão por texto puro colado
export async function ingestText(
  env: Env,
  opts: { title: string; text: string },
): Promise<IngestResult> {
  const docId = crypto.randomUUID();
  const filename = `${safeFilename(opts.title)}.txt`;
  return persistIngest(env, {
    docId,
    title: opts.title,
    originalFilename: filename,
    mimeType: "text/plain",
    fileSize: opts.text.length,
    r2Key: `raw/${docId}/${filename}`,
    text: opts.text,
    chunks: splitText(opts.text).slice(0, MAX_CHUNKS),
    originalBytes: undefined,
    pageCount: null,
    contentType: "text/plain",
  });
}

// Retrieve RAG (sempre ativo): embed da query → Vectorize top-k (com filtro
// opcional de documentIds) → rerank → top-N com corte de relevância
// (minScore). Sem hits relevantes, devolve vazio e o chat cai no
// conhecimento geral (prompt híbrido).
export async function retrieve(
  env: Env,
  opts: { query: string; topK?: number; topN?: number; minScore?: number; documentIds?: string[] },
): Promise<{ docs: { title: string; text: string }[]; citations: { documentId: string; title: string; chunkId: string; score: number }[] }> {
  const db = createDb(env.DB);
  // Seletor de fontes: sem ids = todos os documentos.
  // Filtro é CLIENT-SIDE: derivamos o documentId do id do vetor ("{docId}#{i}").
  // (metadata filter do Vectorize ($in) não é confiável via remote binding)
  const ids = opts.documentIds?.length ? opts.documentIds : undefined;
  const topK = opts.topK ?? Number(env.RAG_TOPK ?? 20);
  const rawMin = Number(env.RAG_MIN_SCORE ?? 0.5);
  const minScore = opts.minScore ?? (Number.isFinite(rawMin) ? rawMin : 0.5);
  // Com seletor ativo, buscamos mais wide para não perder chunks do doc alvo.
  const effectiveTopK = ids ? Math.max(topK, 50) : topK;
  const ranked = await retrieveContext({
    query: opts.query,
    embedder: makeEmbedder(env),
    store: makeStore(env),
    reranker: makeReranker(env),
    topK: effectiveTopK,
    topN: opts.topN ?? Number(env.RERANK_TOPN ?? 5),
    minScore,
    loadText: async (id: string) => {
      const [documentId] = id.split("#");
      if (ids && !ids.includes(documentId)) return null;
      const obj = await env.R2_BUCKET.get(`chunks/${id}.txt`);
      if (!obj) return null;
      const text = await obj.text();
      const doc = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
      return { text, documentId, title: doc[0]?.title ?? documentId };
    },
  });
  return {
    docs: ranked.map((r) => ({ title: r.title, text: r.text })),
    citations: ranked.map((r) => ({
      documentId: r.documentId,
      title: r.title,
      chunkId: r.id,
      score: r.rerankScore,
    })),
  };
}

// Delete completo: vetores (Vectorize) + chunks + original (R2) + linha (D1)
export async function deleteDocument(
  env: Env,
  docId: string,
): Promise<{ found: boolean; deletedVectors?: number }> {
  const db: Db = createDb(env.DB);
  const doc = await documentModel.get(db, docId);
  if (!doc) return { found: false };

  await makeStore(env).deleteByIds?.(Array.from({ length: doc.chunkCount }, (_, i) => `${docId}#${i}`));
  await env.R2_BUCKET.delete(doc.r2Key);
  for (let i = 0; i < doc.chunkCount; i++) {
    await env.R2_BUCKET.delete(`chunks/${docId}#${i}.txt`);
  }
  await documentModel.remove(db, docId);
  return { found: true, deletedVectors: doc.chunkCount };
}

export function buildPrompt(query: string, docs: { title: string; text: string }[]): string {
  return buildRagPrompt(query, docs);
}
