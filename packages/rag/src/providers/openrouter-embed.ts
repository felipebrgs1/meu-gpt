import type { EmbeddingProvider } from "../types.js";

// OpenRouter embeddings — Perplexity pplx-embed-v1-0.6b, 1024 dims, float.
// Uma key só: OPENROUTER_API_KEY. Sem API Perplexity direta no MVP.
export class OpenRouterEmbedding implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions = 1024 as const;
  constructor(
    private apiKey: string,
    model = process.env.EMBED_MODEL ?? "perplexity/pplx-embed-v1-0.6b",
    private baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  ) {
    this.model = model;
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
