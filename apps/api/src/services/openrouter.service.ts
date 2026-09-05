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
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      // Sem isso o OpenRouter não anexa `usage` ao chunk final do stream.
      stream_options: { include_usage: true },
    }),
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

// Custo real da geração (única forma documentada no OpenRouter para streams).
// Best-effort: devolve null se o endpoint ainda não consolidou ou falhou.
export async function fetchGenerationCost(opts: {
  baseUrl?: string;
  apiKey: string;
  generationId: string;
}): Promise<number | null> {
  try {
    const base = opts.baseUrl ?? "https://openrouter.ai/api/v1";
    const res = await fetch(`${base}/generation?id=${encodeURIComponent(opts.generationId)}`, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { total_cost?: number } };
    const cost = json.data?.total_cost;
    return typeof cost === "number" ? cost : null;
  } catch {
    return null;
  }
}
