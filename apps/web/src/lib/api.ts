import type { Citation, Conversation } from "@meu-gpt/shared";

export interface DocRecord {
  id: string;
  title: string;
  r2Key: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  pageCount: number | null;
  chunkCount: number;
  createdAt: string;
}

const API = import.meta.env.VITE_API_URL ?? "";

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  citations?: Citation[];
}

export function getToken(): string {
  return localStorage.getItem("meu-gpt-token") ?? "";
}

function authHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export async function mintDevToken(setupSecret: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/dev-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupSecret }),
  });
  if (!res.ok) throw new Error("setupSecret inválido");
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem("meu-gpt-token", token);
  return token;
}

export function logout() {
  localStorage.removeItem("meu-gpt-token");
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API}/api/v1/conversations`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`conversations ${res.status}`);
  return (await res.json()) as Conversation[];
}

export async function getMessages(conversationId: string): Promise<UIMessage[]> {
  const res = await fetch(`${API}/api/v1/conversations/${conversationId}/messages`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`messages ${res.status}`);
  const rows = (await res.json()) as {
    id: string;
    role: string;
    content: string;
    model: string | null;
    citationsJson: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    role: r.role as UIMessage["role"],
    content: r.content,
    model: r.model,
    citations: r.citationsJson ? (JSON.parse(r.citationsJson) as Citation[]) : [],
  }));
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API}/api/v1/conversations/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

export async function ingestDocument(title: string, text: string): Promise<{ documentId: string; chunkCount: number }> {
  const res = await fetch(`${API}/api/v1/documents/ingest-text`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ title, text }),
  });
  if (!res.ok) throw new Error(`ingest ${res.status}: ${await res.text()}`);
  return (await res.json()) as { documentId: string; chunkCount: number };
}

export async function uploadDocument(file: File, title?: string): Promise<{ documentId: string; title: string; chunkCount: number; pageCount: number | null }> {
  const form = new FormData();
  form.append("file", file);
  if (title?.trim()) form.append("title", title.trim());
  const res = await fetch(`${API}/api/v1/documents/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(j.error ?? `upload ${res.status}`);
  }
  return (await res.json()) as { documentId: string; title: string; chunkCount: number; pageCount: number | null };
}

export async function listDocuments(): Promise<DocRecord[]> {
  const res = await fetch(`${API}/api/v1/documents`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`documents ${res.status}`);
  return (await res.json()) as DocRecord[];
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API}/api/v1/documents/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`delete doc ${res.status}`);
}

export function documentRawUrl(id: string): string {
  return `${API}/api/v1/documents/${id}/raw`;
}

export interface StreamHandlers {
  onToken: (t: string) => void;
  onDone: (fullText: string, citations: Citation[], conversationId: string, model: string) => void;
  onError: (msg: string) => void;
}

// POST /api/v1/chat com SSE (eventos token/done/error, citações só no done)
// RAG é sempre ativo; documentIds = seletor de fontes (ausente/vazio = todos)
export async function streamChat(
  body: {
    slot: "fast" | "cheap" | "quality";
    messages: { role: string; content: string }[];
    documentIds?: string[];
    conversationId?: string;
  },
  h: StreamHandlers,
) {
  const res = await fetch(`${API}/api/v1/chat`, {
    method: "POST",
    headers: authHeaders(),
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
          h.onDone(json.fullText ?? full, json.citations ?? [], json.conversationId, json.usage?.model ?? "");
        } else if (event === "error") {
          h.onError(json.message);
        }
      } catch {
        /* noop */
      }
    }
  }
}
