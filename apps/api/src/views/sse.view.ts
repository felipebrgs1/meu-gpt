import type { Citation } from "@meu-gpt/shared";

// VIEW de streaming — renderiza a resposta do chat como SSE (token/done/error)

export interface ChatSSEMeta {
  conversationId: string;
  model: string;
  citations: Citation[];
  latencyMs: number;
}

export interface ChatSSEDeps {
  meta: ChatSSEMeta;
  // salva a mensagem assistant no D1 antes do evento done
  persistAssistant: (content: string) => Promise<void>;
  // consome o stream OpenAI-compat do OpenRouter e devolve tokens
  readTokens: (onToken: (t: string) => void) => Promise<void>;
}

export function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
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
        await readTokens((token) => {
          fullText += token;
          send("token", { token });
        });
        await persistAssistant(fullText);
        send("done", {
          fullText,
          citations: meta.citations,
          usage: { model: meta.model, latencyMs: meta.latencyMs },
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

// Parser do stream OpenAI-compat do OpenRouter: extrai tokens de choices[].delta.content
export async function pumpOpenRouterTokens(upstream: Response, onToken: (t: string) => void): Promise<void> {
  if (!upstream.body) throw new Error("stream vazio do OpenRouter");
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
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
        if (token) onToken(token);
      } catch {
        /* keep-alive */
      }
    }
  }
}
