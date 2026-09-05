# AGENTS.md — meu-gpt

Instruções para agentes de código (Pi Code, Claude, Codex, Cursor) trabalhando neste monorepo.

## Projeto em 1 parágrafo

ChatGPT pessoal (single-user) com RAG: Hono em Cloudflare Workers, D1 (SQL), R2 (arquivos originais), Vectorize 1024d cosine (vetores), embeddings + chat + rerank 100% via OpenRouter (1 key). Web em React 19 + TanStack + Tailwind 4 + shadcn/Base UI. Monorepo pnpm + Turborepo.

## Comandos essenciais

```bash
pnpm install                        # setup (pnpm 12 — usar exatamente esta versão)
pnpm typecheck                      # turbo: todos os packages
pnpm build                          # turbo build
pnpm dev                            # turbo dev (api :8787 + web :5173)
pnpm --filter @meu-gpt/api dev      # só api (sync-env roda antes do wrangler)
pnpm --filter @meu-gpt/web dev      # só web
pnpm --filter @meu-gpt/db db:generate   # gera migration após mudar schema
pnpm --filter @meu-gpt/api exec wrangler d1 migrations apply meu-gpt --local   # (ou --remote)
pnpm --filter @meu-gpt/rag smoke:embed  # valida 1024d (precisa .env com OPENROUTER_API_KEY)
pnpm test:e2e                         # chat ephemeral + persist→delete (exige api em :8787)
pnpm cleanup                          # apaga conversas [E2E-TEST]/[TEST] órfãs (D1 local)
```

## Regras não negociáveis

1. **Fonte única de segredos: `.env` na raiz.** Nunca criar/editar `apps/api/.dev.vars` (é gerado por `scripts/sync-env.mjs`). Nunca commitar `.env`.
2. **Nunca truncar embeddings.** O índice Vectorize é 1024 dims + cosine. Se uma dimensão vier ≠ 1024, abortar e investigar — não truncar/normalizar.
3. **Arquivo original sempre no R2** (`raw/{docId}/{filename}`) + chunks (`chunks/{docId}#i.txt`) + vetores (Vectorize) + metadado (D1). Delete remove as 4 camadas.
4. **Toda LLM/embed/rerank passa pelo OpenRouter** (rota `/embeddings`, `/chat/completions`, `/rerank`). Nunca chamar API de vendor direto.
5. **Slots, não marcas:** código de negócio usa `fast|cheap|quality` e resolve via env (`CHAT_MODEL_*`). Model ids só em wrangler.toml `[vars]` / `.env`.
6. **Mobile** (quando existir, `apps/mobile`): só via `packages/shared` — nunca importar de `apps/web`.
7. **Teste sem rastro:** agente que testa o chat USA `ephemeral:true` (não persiste nada)
   ou apaga no `finally` (`DELETE /api/v1/conversations/:id`). Roteiro pronto: `pnpm test:e2e`
   (testa ephemeral + persist→delete e verifica que nada sobrou). Rastro órfão: `pnpm cleanup`.
8. **Branding via TOML, nunca hardcoded:** nome/ícones/cores vivem em `branding.toml`.
   Componentes usam `BRANDING` de `apps/web/src/branding.gen.ts` (gerado por
   `node scripts/sync-branding.mjs` — o dev/build da web roda sozinho). Nunca
   escrever o nome do app direto no JSX; `*.gen.*` são commitados.

## Arquitetura (onde mexer o quê)

```
apps/api/src/          MVC estrito:
  routes/              HTTP → controller (zero lógica)
  controllers/         valida input, chama services, retorna views
  services/            orquestração (openrouter.service, rag.service)
  models/              Drizzle/D1 (conversation, message, document)
  views/               DTOs JSON (json.view) e SSE (sse.view)
  middleware/          auth (JWT single-user)
apps/web/src/          pages/ (uma por rota TanStack, ex: pages/ChatPage.tsx)
  + components/chat/* (blocos: Sidebar, Header, Messages, Composer, Ingest)
  + lib/api.ts (client HTTP único)
packages/
  shared/              zod schemas + tipos compartilhados (web+api)
  db/                  schema Drizzle + migrations
  rag/                 chunk, extract (unpdf/mammoth), embed, vectorize, rerank, pipeline
```

- Toda rota nova: criar controller + rota em `routes/index.ts`. Handler rota = 1 linha.
- Tabela nova: schema em `packages/db` → `db:generate` → aplicar migration (local + remote).
- Contract web↔api: schemas em `packages/shared`. Se mudar request/response, atualizar os dois lados.
- Página nova no web: arquivo em `routes/` (file-based, ex: `routes/docs.tsx` vira `/docs`).
  `routeTree.gen.ts` é gerado pelo plugin no build/dev — commitar junto.
- Streaming é **SSE** com eventos `token` / `done` / `error`; citações só no `done`.

## Gotchas conhecidos (não reintroduzir)

- **pdf.js detach:** `extractTextFromBuffer` pode zerar o ArrayBuffer original. Sempre passar CÓPIA (`.slice()`) para extração e guardar os bytes originais para o R2.
- **Vectorize eventual consistency:** query logo após upsert pode não achar o vetor novo (alguns segundos). Não é bug.
- **Wrangler dev e portas:** se 8787 ocupado por workerd órfão, matar `workerd|wrangler` antes de subir (o wrangler auto-incrementa porta e o proxy do Vite quebra).
- **`process.env` não existe no runtime Workers.** No `packages/rag`, sempre guardar: `typeof process !== "undefined" ? process.env?.X : undefined` (os services da api injetam valores do `Env`).
- **Drizzle: uma única instância de tipos.** `@cloudflare/workers-types` é fixado via `pnpm-workspace.yaml > overrides` — não adicionar outra versão (duplica tipos do drizzle-orm e quebra o build).
- **shadcn/Base UI:** triggers usam `render={<Component />}` (NÃO `asChild`). ToggleGroup é multi-value: usar `value={[x]}` e pegar o último do array.
- **Tema:** componentes shadcn exigem classe `dark` no root (Nova style, base stone).

## Definition of done (toda mudança)

1. `pnpm typecheck` verde em todos os packages
2. `pnpm --filter @meu-gpt/web build` verde
3. `pnpm --filter @meu-gpt/api exec wrangler deploy --dry-run` verde
4. Teste e2e manual da rota tocada (health/auth/chat/ingest/delete) com curl
5. Nenhum segredo novo sem passar por `.env` + `.env.example`

## Estilo

- TypeScript strict, ESM (`import x from "./y.js"` — extensão .js obrigatória)
- Sem classes fora de `packages/rag` (interfaces + funções puras preferidos)
- Comentários só para o "porquê", nunca para o "o quê"
- PT-BR em UI e mensagens de usuário; código e comentários em inglês

## Referências

- `docs/SPEC-v0.2.md` — roadmap por fases com critérios de aceite
- `README.md` — setup e ordem de build
- `apps/api/wrangler.toml` — bindings e vars de produção (DB, VECTORIZE, R2)
