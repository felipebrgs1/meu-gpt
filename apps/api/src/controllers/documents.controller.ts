import type { Context } from "hono";
import { createDb } from "@meu-gpt/db";
import { documentModel } from "../models/document.model.js";
import { toDocumentDTO } from "../views/json.view.js";
import { ingestFile, ingestText, deleteDocument, safeFilename } from "../services/rag.service.js";
import type { Env } from "../env.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — documents: upload multipart, texto colado, lista, raw, delete

export async function list(c: C) {
  const db = createDb(c.env.DB);
  const rows = await documentModel.list(db);
  return c.json(rows.map(toDocumentDTO));
}

export async function ingestUpload(c: C) {
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "multipart/form-data esperado" }, 400);
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "campo 'file' ausente" }, 400);
  const title = typeof form.get("title") === "string" ? (form.get("title") as string) : undefined;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const out = await ingestFile(c.env, {
    bytes,
    filename: file.name || "document",
    mimeType: file.type || "application/octet-stream",
    title,
  });
  if (!out.ok) return c.json({ error: out.reason }, out.reason.includes("muito grande") ? 413 : out.reason.includes("Extensão") ? 400 : 422);
  return c.json(out.result);
}

export async function ingestPaste(c: C) {
  const body = await c.req
    .json<{ title?: string; text?: string }>()
    .catch(() => ({}) as { title?: string; text?: string });
  const title = (body.title ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!title || !text) return c.json({ error: "title e text obrigatórios" }, 400);
  if (text.length > 200_000) return c.json({ error: "texto muito grande (200k chars max)" }, 400);
  return c.json(await ingestText(c.env, { title, text }));
}

export async function raw(c: C) {
  const db = createDb(c.env.DB);
  const doc = await documentModel.get(db, (c.req.param("id") ?? ""));
  if (!doc) return c.json({ error: "documento não encontrado" }, 404);
  const obj = await c.env.R2_BUCKET.get(doc.r2Key);
  if (!obj) return c.json({ error: "objeto R2 ausente" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.originalFilename || safeFilename(doc.title)}"`,
    },
  });
}

export async function remove(c: C) {
  const out = await deleteDocument(c.env, (c.req.param("id") ?? ""));
  if (!out.found) return c.json({ error: "documento não encontrado" }, 404);
  return c.json({ ok: true, deletedVectors: out.deletedVectors });
}
