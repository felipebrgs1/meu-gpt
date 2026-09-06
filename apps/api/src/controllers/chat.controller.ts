import type { Context } from "hono";
import { createDb } from "@meu-gpt/db";
import { chatRequestSchema, type Citation } from "@meu-gpt/shared";
import { conversationModel } from "../models/conversation.model.js";
import { messageModel } from "../models/message.model.js";
import { documentModel } from "../models/document.model.js";
import {
  openRouterChatStream,
  resolveSlotModel,
  fetchGenerationCost,
  type ChatApiMessage,
  type UpstreamToolCall,
} from "../services/openrouter.service.js";
import { ensureSystemPrompt } from "../services/system-prompt.js";
import { retrieve, buildPrompt } from "../services/rag.service.js";
import { WEB_TOOLS, fetchPage, searchWeb } from "../services/websearch.service.js";
import { sseChatResponse, pumpOpenRouterTokens, type SSESend } from "../views/sse.view.js";
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
  const ephemeral = req.ephemeral === true;
  const t = new Date().toISOString();

  // ephemeral:true = teste sem rastro: pula TODA persistência no D1
  // (sem conversa, sem user msg, sem touch, sem assistant msg).
  if (!ephemeral) {
    await conversationModel.create(db, {
      id: conversationId,
      title: req.messages.at(-1)?.content.slice(0, 60) ?? "Nova conversa",
      slot: req.slot,
      createdAt: t,
    });
  }

  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");

  // RAG SEMPRE ATIVO com corte de relevância — pula quando não há docs ou
  // quando nenhum chunk passa do minScore (pergunta fora dos docs cai no
  // conhecimento geral via prompt híbrido, sem citar fonte).
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

  // Web search via function calling: quem decide é o modelo (robusto a como a
  // pergunta é escrita — "deprecated no bun 1.4" dispara sozinho). Falls back
  // para chat puro se o provider não aceitar tools.
  const wantsWeb = req.webSearch === true;
  const systemHints: ChatApiMessage[] = wantsWeb
    ? [
        {
          role: "system" as const,
          content:
            "O usuário pediu informação da web: use a ferramenta web_search e cite as fontes.",
        },
      ]
    : [];

  // RAG continua como antes: injeta o contexto no prompt (prompt híbrido).
  let userContent = lastUser?.content ?? "";
  if (ragDocs.length > 0) userContent = buildPrompt(userContent, ragDocs);
  const hasRagContext = ragDocs.length > 0 && lastUser;
  const withContext = hasRagContext
    ? [...req.messages.slice(0, -1), { role: "user" as const, content: userContent }]
    : req.messages;
  let llmMessages: ChatApiMessage[] = [...ensureSystemPrompt(withContext), ...systemHints];

  // Abre o stream com tools; se o provider recusar, cai para chat puro.
  async function openRound(messages: ChatApiMessage[], withTools: boolean): Promise<Response> {
    try {
      return await openRouterChatStream({
        env,
        model,
        messages,
        tools: withTools ? WEB_TOOLS : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (withTools && /tool|function calling|unsupported parameter|parameter 'tools'/i.test(msg)) {
        return openRouterChatStream({ env, model, messages });
      }
      throw err;
    }
  }

  const MAX_TOOL_ROUNDS = 2;
  let toolRounds = 0;
  const onToolCalls = async (
    calls: UpstreamToolCall[],
    send: SSESend,
  ): Promise<Response | null> => {
    // Esgotou as rodadas de tool: força resposta final sem tools (nunca
    // devolve null para não encerrar o chat com texto vazio).
    if (toolRounds >= MAX_TOOL_ROUNDS) {
      llmMessages = [
        ...llmMessages,
        {
          role: "user" as const,
          content:
            "[instrução] Sem novas buscas agora: responda usando apenas o contexto já fornecido acima.",
        },
      ];
      return openRouterChatStream({ env, model, messages: llmMessages });
    }
    toolRounds++;

    send("tool_status", {
      name: "web",
      label: toolRounds > 0 ? "buscando mais detalhes…" : "pesquisando na web…",
    });
    const toolMessages: ChatApiMessage[] = [];
    for (const call of calls) {
      let payload: unknown;
      try {
        const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        send("tool", { name: call.function.name, args });
        if (call.function.name === "web_search") {
          const query = String(args.query ?? "").slice(0, 500);
          const out = await searchWeb(query, 4);
          payload = { ok: true, query: out.query, results: out.results };
          out.results.forEach((r, i) => {
            citations.push({
              documentId: "web",
              title: r.title || r.url,
              chunkId: r.url,
              score: Math.max(0.5, 0.99 - i * 0.05),
            });
          });
        } else if (call.function.name === "fetch_page") {
          const url = String(args.url ?? "").slice(0, 2000);
          const page = await fetchPage(url);
          payload = { ok: true, url: page.url, title: page.title, content: page.content };
          citations.push({
            documentId: "web",
            title: page.title || page.url,
            chunkId: page.url,
            score: 1,
          });
        } else {
          payload = { ok: false, error: "ferramenta desconhecida" };
        }
      } catch (err) {
        payload = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(payload),
      });
    }
    llmMessages = [
      ...llmMessages,
      { role: "assistant", content: null, tool_calls: calls },
      ...toolMessages,
    ];
    return openRouterChatStream({ env, model, messages: llmMessages, tools: WEB_TOOLS });
  };

  const initialUpstream = await openRound(llmMessages, true);
  if (!ephemeral) await conversationModel.touch(db, conversationId, new Date().toISOString());

  // ephemeral: persistAssistant vira no-op (responde o SSE, não salva nada).
  const noop = (_content: string, _usage: object) => Promise.resolve();

  return sseChatResponse({
    meta: { conversationId, model, citations, startedAt: t0 },
    initialUpstream,
    onToolCalls,
    persistAssistant: ephemeral
      ? noop
      : (content, usage) =>
          messageModel.insert(db, {
            id: crypto.randomUUID(),
            conversationId,
            role: "assistant",
            content,
            model,
            tokensIn: usage.tokensIn,
            tokensOut: usage.tokensOut,
            latencyMs: usage.latencyMs,
            costUsd: usage.costUsd,
            tps: usage.tps,
            cachedTokens: usage.cachedTokens,
            citations,
            createdAt: new Date().toISOString(),
          }),
    readTokens: (upstream, onToken) => pumpOpenRouterTokens(upstream, onToken),
    fetchCost: (generationId) =>
      fetchGenerationCost({
        baseUrl: env.OPENROUTER_BASE_URL,
        apiKey: env.OPENROUTER_API_KEY,
        generationId,
      }),
  });
}
