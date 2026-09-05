import type { Context } from "hono";
import { createDb } from "@meu-gpt/db";
import { chatRequestSchema, type Citation } from "@meu-gpt/shared";
import { conversationModel } from "../models/conversation.model.js";
import { messageModel } from "../models/message.model.js";
import { documentModel } from "../models/document.model.js";
import { openRouterChatStream, resolveSlotModel } from "../services/openrouter.service.js";
import { retrieve, buildPrompt } from "../services/rag.service.js";
import { sseChatResponse, pumpOpenRouterTokens } from "../views/sse.view.js";
import type { Env } from "../env.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — chat (SSE): garante conversa, aplica RAG, chama OpenRouter, renderiza SSE

export async function chat(c: C) {
  // validação no controller (zValidator exige tipar o contexto da rota)
  const parsed = chatRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "body inválido", issues: parsed.error.issues.slice(0, 5) }, 400);
  }
  const req = parsed.data;
  const env = c.env;
  const db = createDb(env.DB);
  const t0 = Date.now();

  const conversationId = req.conversationId ?? crypto.randomUUID();
  const model = req.model ?? resolveSlotModel(env, req.slot);
  const t = new Date().toISOString();

  await conversationModel.create(db, {
    id: conversationId,
    title: req.messages.at(-1)?.content.slice(0, 60) ?? "Nova conversa",
    slot: req.slot,
    createdAt: t,
  });

  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");

  // RAG SEMPRE ATIVO — pula só quando não há nenhum documento indexado.
  // Seletor de fontes: req.documentIds ausente/vazio = todos os docs.
  let ragDocs: { title: string; text: string }[] = [];
  let citations: Citation[] = [];
  if (lastUser) {
    const dbDocs = await documentModel.list(db, 1);
    if (dbDocs.length > 0) {
      const out = await retrieve(env, { query: lastUser.content, documentIds: req.documentIds });
      ragDocs = out.docs;
      citations = out.citations;
    }
  }

  if (lastUser) {
    await messageModel.insert(db, {
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: lastUser.content,
      model: null,
      tokensIn: null,
      tokensOut: null,
      latencyMs: null,
      costUsd: null,
      citations: null,
      createdAt: t,
    });
  }

  // Injeta o contexto RAG na última mensagem do usuário
  const llmMessages =
    ragDocs.length && lastUser
      ? [...req.messages.slice(0, -1), { role: "user" as const, content: buildPrompt(lastUser.content, ragDocs) }]
      : req.messages;

  const upstream = await openRouterChatStream({ env, model, messages: llmMessages });
  await conversationModel.touch(db, conversationId, new Date().toISOString());

  return sseChatResponse({
    meta: { conversationId, model, citations, latencyMs: Date.now() - t0 },
    persistAssistant: (content) =>
      messageModel.insert(db, {
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content,
        model,
        tokensIn: null,
        tokensOut: null,
        latencyMs: Date.now() - t0,
        costUsd: null,
        citations,
        createdAt: new Date().toISOString(),
      }),
    readTokens: (onToken) => pumpOpenRouterTokens(upstream, onToken),
  });
}
