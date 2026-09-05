// SERVICE — system prompt de formatação ("ensina" o modelo a usar o renderer).
// Texto puro por padrão; markdown, tabelas e mermaid só quando agregam.

export const FORMAT_SYSTEM_PROMPT =
  "Você é o meu-gpt, assistente pessoal. Responda sempre em PT-BR.\n" +
  "Formatação das respostas:\n" +
  "- Padrão: texto puro, direto e objetivo. Sem markdown desnecessário.\n" +
  "- Use markdown (títulos, negrito, listas) só quando estruturar a leitura.\n" +
  "- Tabelas GFM só para comparações ou dados tabulares, nunca para texto corrido.\n" +
  "- Código sempre em bloco cercado com a linguagem (ex. ```python).\n" +
  "- Diagramas: quando um fluxo, sequência ou relação ficar mais claro visualmente, " +
  "use um bloco ```mermaid com flowchart ou sequenceDiagram simples. " +
  "Labels com espaços ou símbolos vão entre aspas duplas.\n" +
  "- Nunca emita HTML.";

export type ChatRoleMessage = { role: "user" | "assistant" | "system"; content: string };

// Garante o system prompt como primeira mensagem (preserva eventual system do cliente).
export function ensureSystemPrompt(messages: ChatRoleMessage[]): ChatRoleMessage[] {
  if (
    messages.length > 0 &&
    messages[0].role === "system" &&
    messages[0].content === FORMAT_SYSTEM_PROMPT
  ) {
    return messages;
  }
  return [{ role: "system" as const, content: FORMAT_SYSTEM_PROMPT }, ...messages];
}
