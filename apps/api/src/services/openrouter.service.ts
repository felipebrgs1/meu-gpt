import type { Env } from "../env.js";

// SERVICE — cliente do OpenRouter (única dependência externa de LLM/embed/rerank)

export async function openRouterChatStream(opts: {
  env: Env;
  model: string;
  messages: { role: string; content: string }[];
}): Promise<Response> {
  const base = opts.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://meu-gpt.local",
      "X-Title": "meu-gpt",
    },
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`openrouter ${res.status}: ${await res.text()}`);
  return res;
}

// Resolve o slot (fast/cheap/quality) para o model id configurado no env.
export function resolveSlotModel(env: Env, slot: "fast" | "cheap" | "quality"): string {
  if (slot === "fast") return env.CHAT_MODEL_FAST;
  if (slot === "quality") return env.CHAT_MODEL_QUALITY;
  return env.CHAT_MODEL_CHEAP;
}
