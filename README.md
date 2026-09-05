# meu-gpt — ChatGPT próprio (RAG individual, self-hosted)

Chat pessoal single-user com RAG: você sobe **sua** instância na **sua** conta
Cloudflare e conversa com seus documentos. API em Hono (Workers) + Web em
React, embeddings/chat/rerank 100% via OpenRouter (1 key).

## Como funciona

```
WEB estática (meu-gpt-web) ──HTTPS──▶ API Hono (meu-gpt-api) ──▶ OpenRouter (embed + chat + rerank)
                                          │ bindings
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              D1 (conversas,        Vectorize (vetores    R2 (originais
              mensagens, docs)       1024d, cosine)        + chunks)
```

- **RAG em 4 camadas por documento:** original no R2 (`raw/{docId}/{arquivo}`) +
  chunks no R2 + vetores no Vectorize + metadado no D1. Delete remove as 4.
- **Slots de modelo** `fast | cheap | quality` resolvidos via env — ids de modelo
  só vivem em `wrangler.toml [vars]` / `.env`, nunca no código de negócio.
- **Streaming SSE** com eventos `token` / `done` / `error`; citações só no `done`.
- **Auth single-user:** usuário+senha fixos retornam um token opaco que vive em
  secret (`SESSION_TOKEN`) — o repo pode ser público sem vazar acesso
  (ver `apps/api/src/services/auth.service.ts`).

## Stack

| Peça | Tecnologia |
|---|---|
| Monorepo | pnpm 12 + Turborepo (`apps/web`, `apps/api`, `packages/db\|shared\|rag`) |
| API | Hono 4 + Drizzle + Zod, em Cloudflare Workers |
| Web | React 19 + TanStack Router + Tailwind 4 + shadcn/Base UI, Worker só de assets |
| Dados | D1 `meu-gpt`, Vectorize `meu-gpt` (1024d cosine), R2 `meu-gpt-docs` |
| IA | OpenRouter: `perplexity/pplx-embed-v1-0.6b` (1024 nativo, sem truncate) + slots de chat + rerank desligável |

## Dev local

```bash
cp .env.example .env        # preencha OPENROUTER_API_KEY
pnpm install
pnpm --filter @meu-gpt/rag smoke:embed   # trava 1024d
pnpm dev                    # api :8787 + web :5173 (proxy /api → 8787)
```

Login em dev: `POST /api/v1/auth/login` com o usuário+senha de
`apps/api/src/services/auth.service.ts` → salve o token em
`localStorage["meu-gpt-token"]`.

> Fonte única de segredos: `.env` na raiz. `apps/api/.dev.vars` é gerado
> (`scripts/sync-env.mjs`) — nunca edite à mão.

## Deploy (self-hosted na Cloudflare)

Guia completo passo a passo para agentes (pré-requisitos, provisionamento
D1/R2/Vectorize, secrets, deploy API+Web, smoke tests, troubleshooting):

**→ [`docs/DEPLOY.md`](docs/DEPLOY.md)**

Resumo:

```bash
# 1. Infra (uma vez por conta) — dentro de apps/api:
wrangler vectorize create meu-gpt --dimensions=1024 --metric=cosine
wrangler d1 create meu-gpt          # colar database_id no wrangler.toml
wrangler r2 bucket create meu-gpt-docs
wrangler d1 migrations apply meu-gpt --remote
wrangler secret put OPENROUTER_API_KEY

# 2. API:
pnpm --filter @meu-gpt/api exec wrangler deploy

# 3. Web (apontando para a URL da API):
VITE_API_URL="https://meu-gpt-api.<sub>.workers.dev" pnpm --filter @meu-gpt/web deploy
```

## Estrutura

```
apps/api/src/     routes/ → controllers/ → services/ → models/ → views/ (+ middleware/)
apps/web/src/     pages/ (uma por rota) + components/chat/* + lib/api.ts (client único)
packages/shared/  schemas zod + tipos (contrato web↔api)
packages/db/      schema Drizzle + migrations (db:generate após mudar schema)
packages/rag/     chunk, extract (PDF/DOCX), embed, vectorize, rerank, pipeline
docs/             SPEC-v0.2.md (roadmap) · DEPLOY.md (guia de deploy)
```

## Comandos

```bash
pnpm typecheck                 # todos os packages
pnpm build                    # turbo build
pnpm dev                      # api :8787 + web :5173
pnpm test:e2e                 # chat ephemeral + persist→delete (api em :8787)
pnpm cleanup                  # apaga conversas [E2E-TEST]/[TEST] órfãs
```

## Regras (resumo — vale `AGENTS.md`)

1. Segredos só via `.env` → nunca commitar; nunca editar `.dev.vars`.
2. Embedding ≠ 1024 dims → abortar, nunca truncar.
3. Original sempre no R2 + delete nas 4 camadas.
4. Toda LLM/embed/rerank via OpenRouter.
5. Teste de chat usa `ephemeral:true` ou apaga no `finally`.

## Referências

- `docs/DEPLOY.md` — deploy self-hosted
- `docs/SPEC-v0.2.md` — roadmap por fases
- `AGENTS.md` — regras para agentes
- `apps/api/wrangler.toml` / `apps/web/wrangler.toml` — bindings e vars
