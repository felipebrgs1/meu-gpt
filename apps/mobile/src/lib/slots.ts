// Chat constants (model slots + example prompts).
// Mirror of apps/web/src/lib/slots.ts — minus web-only icon components.
// Slots, not brands: ids resolved via env (CHAT_MODEL_*) on the backend.

export type Slot = "fast" | "cheap" | "quality";

export interface SlotOption {
  id: Slot;
  label: string;
  modelName: string;
  hint: string;
}

export const SLOTS: SlotOption[] = [
  { id: "fast", label: "Fast", modelName: "MiniMax-M3", hint: "Rápido e gratuito" },
  { id: "cheap", label: "Cheap", modelName: "GLM-5.3-flash", hint: "Custo-benefício" },
  { id: "quality", label: "Quality", modelName: "GLM-5.3-flash", hint: "Alta precisão" },
];

export interface QuickPrompt {
  category: string;
  title: string;
  prompt: string;
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  {
    category: "RAG & Vetores",
    title: "Como funciona a busca vetorial?",
    prompt:
      "Explique como o Cloudflare Vectorize (1024 dimensões + métrica cosine) funciona junto com o Perplexity Embed V1 0.6B neste projeto.",
  },
  {
    category: "Documentação",
    title: "Exemplo de RAG com citações",
    prompt:
      "Me dê um exemplo prático de como o prompt de RAG formata as respostas citando fontes com [doc:chunk] e como o frontend exibe as citações.",
  },
  {
    category: "Arquitetura",
    title: "Stack Cloudflare Workers + D1",
    prompt:
      "Explique a arquitetura deste projeto: HonoJS na edge, Drizzle ORM sobre D1 SQLite, R2 para texto e SSE para streaming em tempo real.",
  },
  {
    category: "Código",
    title: "Gerar endpoint de streaming",
    prompt:
      "Escreva um exemplo em TypeScript com HonoJS implementando um ReadableStream com Server-Sent Events (SSE) compatível com Cloudflare Workers.",
  },
];
