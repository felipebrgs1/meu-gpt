import type { EmbeddingProvider } from "../types.js";

// OpenRouter embeddings — Perplexity pplx-embed-v1-0.6b, 1024 dims, float.
// Uma key só: OPENROUTER_API_KEY. Sem API Perplexity direta no MVP.
export class OpenRouterEmbedding implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions = 1024 as const;
  private baseUrl: string;

  constructor(
    private apiKey: string,
    model?: string,
    baseUrl?: string,
  ) {
    const envModel = typeof process !== "undefined" ? process.env?.EMBED_MODEL : undefined;
    const envBase = typeof process !== "undefined" ? process.env?.OPENROUTER_BASE_URL : undefined;
    this.model = model ?? envModel ?? "perplexity/pplx-embed-v1-0.6b";
    this.baseUrl = baseUrl ?? envBase ?? "https://openrouter.ai/api/v1";
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.embedDocuments([text]);
    return v;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: "float",
      }),
    });
    if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    for (const d of json.data) {
      if (d.embedding.length !== 1024) {
        throw new Error(`dimensão inesperada ${d.embedding.length}, esperado 1024. Não truncar — recriar índice.`);
      }
    }
    return json.data.map((d) => d.embedding);
  }
}
