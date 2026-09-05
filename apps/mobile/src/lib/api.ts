// Single HTTP client for the mobile app (mirror of apps/web/src/lib/api.ts).
// Business contract comes ONLY from @meu-gpt/shared — never import apps/web.
//
// Differences vs web:
// - Token lives in SecureStore (async) instead of localStorage.
// - streamChat parses SSE progressively via XMLHttpRequest, because the
//   React Native fetch polyfill has no ReadableStream#getReader.
// - uploadDocument accepts an expo-document-picker asset instead of File.

import Constants from "expo-constants";
import type { ChatUsage, Citation, Conversation } from "@meu-gpt/shared";
import { clearStoredToken, getStoredToken, setStoredToken } from "./token-store";

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

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  citations?: Citation[];
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  tps?: number | null;
  costUsd?: number | null;
  cachedTokens?: number | null;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

// API base URL: EXPO_PUBLIC_API_URL, inlined by babel-preset-expo at bundle
// time. app.config.js backfills it from the monorepo-root .env (single
// source of truth — Expo never reads the root .env on its own), so this is
// reliable on web + native. expo-constants `extra` stays as fallback (native
// manifest path). Empty strings never win: `||` (not `??`) so a missing
// value can't stick as "" and silently turn every fetch into a same-origin
// request against the Expo server itself.
const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
const fromExtra = (
  Constants.expoConfig?.extra as { apiUrl?: string } | undefined
)?.apiUrl?.trim();
const API = (fromEnv || fromExtra || "").replace(/\/$/, "");

if (!API && typeof __DEV__ !== "undefined" && __DEV__) {
  console.warn(
    "[api] EXPO_PUBLIC_API_URL vazio — requests vão para a origem do Expo. " +
      "Defina no .env da raiz (ex: http://192.168.0.11:8787) e reinicie o Expo com `expo start -c`.",
  );
}

export async function getToken(): Promise<string> {
  return getStoredToken();
}

export async function hasToken(): Promise<boolean> {
  return (await getToken()) !== "";
}

async function authHeaders(): Promise<Record<string, string>> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` };
}

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("usuário ou senha inválidos");
  const { token } = (await res.json()) as { token: string };
  await setStoredToken(token);
  return token;
}

export async function logout(): Promise<void> {
  await clearStoredToken();
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API}/api/v1/conversations`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`conversations ${res.status}`);
  return (await res.json()) as Conversation[];
}

export async function getMessages(conversationId: string): Promise<UIMessage[]> {
  const res = await fetch(`${API}/api/v1/conversations/${conversationId}/messages`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`messages ${res.status}`);
  const rows = (await res.json()) as {
    id: string;
    role: string;
    content: string;
    model: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
    latencyMs: number | null;
    tps: number | null;
    costUsd: number | null;
    cachedTokens: number | null;
    citationsJson: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    role: r.role as UIMessage["role"],
    content: r.content,
    model: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    latencyMs: r.latencyMs,
    tps: r.tps,
    costUsd: r.costUsd,
    cachedTokens: r.cachedTokens,
    citations: r.citationsJson ? (JSON.parse(r.citationsJson) as Citation[]) : [],
  }));
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API}/api/v1/conversations/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

export async function ingestDocument(
  title: string,
  text: string,
): Promise<{ documentId: string; chunkCount: number }> {
  const res = await fetch(`${API}/api/v1/documents/ingest-text`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ title, text }),
  });
  if (!res.ok) throw new Error(`ingest ${res.status}: ${await res.text()}`);
  return (await res.json()) as { documentId: string; chunkCount: number };
}

export async function uploadDocument(
  file: PickedFile,
  title?: string,
): Promise<{ documentId: string; title: string; chunkCount: number; pageCount: number | null }> {
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
  if (title?.trim()) form.append("title", title.trim());
  const res = await fetch(`${API}/api/v1/documents/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getToken()}` },
    body: form,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(j.error ?? `upload ${res.status}`);
  }
  return (await res.json()) as {
    documentId: string;
    title: string;
    chunkCount: number;
    pageCount: number | null;
  };
}

export async function listDocuments(): Promise<DocRecord[]> {
  const res = await fetch(`${API}/api/v1/documents`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`documents ${res.status}`);
  return (await res.json()) as DocRecord[];
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API}/api/v1/documents/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`delete doc ${res.status}`);
}

export function documentRawUrl(id: string): string {
  return `${API}/api/v1/documents/${id}/raw`;
}

export interface StreamHandlers {
  onToken: (t: string) => void;
  onDone: (
    fullText: string,
    citations: Citation[],
    conversationId: string,
    model: string,
    usage: ChatUsage | null,
  ) => void;
  onError: (msg: string) => void;
}

// POST /api/v1/chat with SSE (token/done/error events, citations only on done).
// RAG is always on; documentIds = source filter (missing/empty = all docs).
// Same contract as web streamChat; transport is XHR for RN compatibility.
export async function streamChat(
  body: {
    slot: "fast" | "cheap" | "quality";
    messages: { role: string; content: string }[];
    documentIds?: string[];
    conversationId?: string;
  },
  h: StreamHandlers,
): Promise<void> {
  const token = await getToken();
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let seen = 0;
    let buf = "";
    let full = "";
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const pump = () => {
      const text: string = xhr.responseText ?? "";
      buf += text.slice(seen);
      seen = text.length;
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const ev = part.match(/event: (\w+)\ndata: ([\s\S]+)/);
        if (!ev) continue;
        const [, event, data] = ev;
        try {
          const json = JSON.parse(data) as {
            token?: string;
            fullText?: string;
            citations?: Citation[];
            conversationId?: string;
            usage?: ChatUsage | null;
            message?: string;
          };
          if (event === "token") {
            full += json.token as string;
            h.onToken(json.token as string);
          } else if (event === "done") {
            h.onDone(
              json.fullText ?? full,
              json.citations ?? [],
              json.conversationId as string,
              (json.usage?.model ?? "") as string,
              (json.usage ?? null) as ChatUsage | null,
            );
            finish();
          } else if (event === "error") {
            h.onError(json.message ?? "erro no stream");
            finish();
          }
        } catch {
          /* partial JSON mid-chunk: wait for more bytes */
        }
      }
    };
    xhr.open("POST", `${API}/api/v1/chat`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onprogress = pump;
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3) pump();
      if (xhr.readyState === 4) {
        if (xhr.status === 0) {
          h.onError("falha de rede");
          finish();
        } else if (xhr.status >= 400 && !done) {
          h.onError(`chat ${xhr.status}`);
          finish();
        } else if (!done) {
          // Stream closed without a done event: surface what we got.
          h.onError("stream interrompido");
          finish();
        }
      }
    };
    xhr.onerror = () => {
      h.onError("falha de rede");
      finish();
    };
    xhr.ontimeout = () => {
      h.onError("tempo esgotado");
      finish();
    };
    xhr.send(JSON.stringify(body));
  });
}
