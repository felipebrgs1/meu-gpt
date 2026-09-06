import type { ChatUsage, Citation } from "@meu-gpt/shared";
import type { UpstreamToolCall } from "../services/openrouter.service.js";

// VIEW de streaming — renderiza a resposta do chat como SSE (token/done/error)

export type SSESend = (event: string, data: unknown) => void;

export interface ChatSSEMeta {
  conversationId: string;
  model: string;
  citations: Citation[];
  // Timestamp (Date.now()) do início do request: latência final = fim - início.
  startedAt: number;
}

export interface UpstreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface PumpResult {
  usage: UpstreamUsage | null;
  // Id da geração (chunk `id`, ex. "gen-..."): chave para o custo em /generation.
  generationId: string | null;
  firstTokenMs: number | null;
  endMs: number;
  // Razão de término do round (ex. "stop" | "tool_calls" | "length").
  finishReason: string | null;
  // Chamadas de tool pedidas pelo modelo (acumuladas dos deltas).
  toolCalls: UpstreamToolCall[];
}

export interface ChatSSEDeps {
  meta: ChatSSEMeta;
  // primeiro upstream (é re-chamado a cada rodada de tool pelo loop)
  initialUpstream: Response;
  // salva a mensagem assistant no D1 antes do evento done
  persistAssistant: (content: string, usage: ChatUsage) => Promise<void>;
  // consome um stream OpenAI-compat do OpenRouter e devolve tokens + usage
  readTokens: (upstream: Response, onToken: (t: string) => void) => Promise<PumpResult>;
  // executada quando o modelo pede tools; devolve o próximo upstream (ou null p/ parar)
  onToolCalls?: (calls: UpstreamToolCall[], send: SSESend) => Promise<Response | null>;
  // busca o custo real pós-stream (best-effort, null se indisponível)
  fetchCost?: (generationId: string) => Promise<number | null>;
}

export function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function sseChatResponse(deps: ChatSSEDeps): Response {
  const { meta, persistAssistant, readTokens } = deps;
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let fullText = "";
      try {
        // Loop de tool calling: enquanto o modelo pedir tools, executa e re-abre.
        let pump: PumpResult | null = null;
        let upstream: Response | null = deps.initialUpstream;
        while (upstream) {
          pump = await readTokens(upstream, (token) => {
            fullText += token;
            send("token", { token });
          });
          const wantsTools =
            pump.finishReason === "tool_calls" &&
            pump.toolCalls.length > 0 &&
            Boolean(deps.onToolCalls);
          if (!wantsTools) break;
          upstream = await deps.onToolCalls!(pump.toolCalls, send);
        }
        if (!pump) throw new Error("stream vazio");

        const tokensIn = numOrNull(pump.usage?.prompt_tokens);
        const tokensOut = numOrNull(pump.usage?.completion_tokens);
        const cached = pump.usage?.prompt_tokens_details?.cached_tokens;
        const cachedTokens = typeof cached === "number" && Number.isFinite(cached) ? cached : null;

        // Custo: prefere o do chunk (quando o provider anexa), senão /generation.
        let costUsd = numOrNull(pump.usage?.cost);
        if (costUsd === null && pump.generationId && deps.fetchCost) {
          try {
            costUsd = await deps.fetchCost(pump.generationId);
          } catch {
            costUsd = null;
          }
        }

        // TPS de decode: janela do primeiro ao último token (cai p/ stream todo se vazio).
        const spanMs = Math.max(
          1,
          pump.firstTokenMs != null ? pump.endMs - pump.firstTokenMs : pump.endMs - meta.startedAt,
        );
        const tps =
          tokensOut != null && tokensOut > 0
            ? Math.round((tokensOut / (spanMs / 1000)) * 10) / 10
            : null;

        const usage: ChatUsage = {
          model: meta.model,
          latencyMs: Date.now() - meta.startedAt,
          tokensIn,
          tokensOut,
          tps,
          costUsd,
          cachedTokens,
        };
        await persistAssistant(fullText, usage);
        send("done", {
          fullText,
          citations: meta.citations,
          usage,
          conversationId: meta.conversationId,
        });
      } catch (e) {
        send("error", { message: String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}

// Parser do stream OpenAI-compat do OpenRouter: extrai tokens de
// choices[].delta.content e captura usage + id da geração no chunk final
// (só vem com stream_options.include_usage).
export async function pumpOpenRouterTokens(
  upstream: Response,
  onToken: (t: string) => void,
): Promise<PumpResult> {
  if (!upstream.body) throw new Error("stream vazio do OpenRouter");
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let usage: UpstreamUsage | null = null;
  let generationId: string | null = null;
  let firstTokenMs: number | null = null;
  let finishReason: string | null = null;
  // Tool calls chegam fragmentadas por índice no delta; acumula e consolida.
  const toolFragments = new Map<number, UpstreamToolCall>();
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
        if (typeof json.id === "string" && !generationId) generationId = json.id;
        if (json.usage && typeof json.usage === "object") usage = json.usage as UpstreamUsage;
        const choice = json.choices?.[0];
        const token: string = choice?.delta?.content ?? "";
        if (token) {
          if (firstTokenMs === null) firstTokenMs = Date.now();
          onToken(token);
        }
        const fr: unknown = choice?.finish_reason;
        if (typeof fr === "string" && fr) finishReason = fr;
        if (Array.isArray(choice?.delta?.tool_calls)) {
          for (const frag of choice.delta.tool_calls as Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>) {
            const idx = typeof frag.index === "number" ? frag.index : toolFragments.size;
            const acc = toolFragments.get(idx) ?? {
              id: "",
              type: "function" as const,
              function: { name: "", arguments: "" },
            };
            if (frag.id) acc.id = frag.id;
            if (frag.function?.name) acc.function.name += frag.function.name;
            if (frag.function?.arguments) acc.function.arguments += frag.function.arguments;
            toolFragments.set(idx, acc);
          }
        }
      } catch {
        /* keep-alive */
      }
    }
  }
  return {
    usage,
    generationId,
    firstTokenMs,
    endMs: Date.now(),
    finishReason,
    toolCalls: [...toolFragments.values()].filter((c) => c.id && c.function.name),
  };
}
