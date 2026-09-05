import type { Citation } from "@meu-gpt/shared";

const API = import.meta.env.VITE_API_URL ?? "";

export function getToken(): string {
  return localStorage.getItem("meu-gpt-token") ?? "";
}

export async function mintDevToken(setupSecret: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/dev-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupSecret }),
  });
  if (!res.ok) throw new Error("dev-token falhou");
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem("meu-gpt-token", token);
  return token;
}

export interface StreamHandlers {
  onToken: (t: string) => void;
  onDone: (fullText: string, citations: Citation[]) => void;
  onError: (msg: string) => void;
}

// POST /api/v1/chat com SSE (eventos token/done/error, citações só no done)
export async function streamChat(
  body: { slot: "fast" | "cheap" | "quality"; messages: { role: string; content: string }[]; useRag: boolean; conversationId?: string },
  h: StreamHandlers,
) {
  const res = await fetch(`${API}/api/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    h.onError(`chat ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let citations: Citation[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const ev = part.match(/event: (\w+)\ndata: ([\s\S]+)/);
      if (!ev) continue;
      const [, event, data] = ev;
      try {
        const json = JSON.parse(data);
        if (event === "token") {
          full += json.token as string;
          h.onToken(json.token as string);
        } else if (event === "done") {
          citations = json.citations ?? [];
          h.onDone(json.fullText ?? full, citations);
        } else if (event === "error") {
          h.onError(json.message);
        }
      } catch { /* noop */ }
    }
  }
}
