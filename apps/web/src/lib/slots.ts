import { BookOpenIcon, CodeBlockIcon, DatabaseIcon, LeafIcon, LightningIcon, SparkleIcon, TerminalIcon } from "@phosphor-icons/react";

// Constantes do chat (slots de modelo + prompts de exemplo).
// Slots, não marcas: ids resolvidos via env (CHAT_MODEL_*) no backend.

export type Slot = "fast" | "cheap" | "quality";

export interface SlotOption {
  id: Slot;
  label: string;
  modelName: string;
  hint: string;
  icon: typeof LightningIcon;
}

export const SLOTS: SlotOption[] = [
  { id: "fast", label: "Fast", modelName: "MiniMax-M3", hint: "Rápido e gratuito", icon: LightningIcon },
  { id: "cheap", label: "Cheap", modelName: "GLM-5.3-flash", hint: "Custo-benefício", icon: LeafIcon },
  { id: "quality", label: "Quality", modelName: "muse-spark-1.3-contributor", hint: "Alta precisão", icon: SparkleIcon },
];

export interface QuickPrompt {
  icon: typeof SparkleIcon;
  category: string;
  title: string;
  prompt: string;
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  {
    icon: DatabaseIcon,
    category: "RAG & Vetores",
    title: "Como funciona a busca vetorial?",
    prompt: "Explique como o Cloudflare Vectorize (1024 dimensões + métrica cosine) funciona junto com o Perplexity Embed V1 0.6B neste projeto.",
  },
  {
    icon: BookOpenIcon,
    category: "Documentação",
    title: "Exemplo de RAG com citações",
    prompt: "Me dê um exemplo prático de como o prompt de RAG formata as respostas citando fontes com [doc:chunk] e como o frontend exibe as citações.",
  },
  {
    icon: TerminalIcon,
    category: "Arquitetura",
    title: "Stack Cloudflare Workers + D1",
    prompt: "Explique a arquitetura deste projeto: HonoJS na edge, Drizzle ORM sobre D1 SQLite, R2 para texto e SSE para streaming em tempo real.",
  },
  {
    icon: CodeBlockIcon,
    category: "Código",
    title: "Gerar endpoint de streaming",
    prompt: "Escreva um exemplo em TypeScript com HonoJS implementando um ReadableStream com Server-Sent Events (SSE) compatível com Cloudflare Workers.",
  },
];
