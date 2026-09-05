# meu-gpt — ChatGPT próprio (single-user, sem escala)

Decisões travadas em 05/09/2026. Sem multi-tenant, sem mobile agora, sem Pi skills no commit zero.

## Stack

- Turbo `apps/web` + `apps/api` + `packages/db|shared|rag`
- Back único Hono em Workers. Web Vite + TanStack Router. Mobile depois.
- D1: `conversations` + `messages` + `documents` (só metadado). Texto no R2, vetor no Vectorize.
- Embed: `perplexity/pplx-embed-v1-0.6b` via OpenRouter, 1024 nativo, cosine, float. Sem truncate.
- Chat: 3 slots `fast|cheap|quality` + fallback manual, log `model/tokens/latency/custo` em `messages`.
- Rerank Voyage (`voyageai/rerank-2.5`, flag `RERANK_ENABLED=false`), POST depois do Vectorize. Não Atlas.
- SSE com citações só no evento final.

## Ordem de build

1. `cp .env.example .env` + export `OPENROUTER_API_KEY`
2. Smoke embed (trava 1024): `pnpm --filter @meu-gpt/rag smoke:embed`
3. `npx wrangler vectorize create meu-gpt --dimensions=1024 --metric=cosine`
4. `wrangler d1 create meu-gpt` → colar `database_id` em `apps/api/wrangler.toml`
5. `wrangler r2 bucket create meu-gpt-docs`
6. `pnpm install && pnpm --filter @meu-gpt/db db:generate`
7. `cd apps/api && wrangler secret put OPENROUTER_API_KEY && wrangler secret put JWT_SECRET`
8. Chat sem RAG → D1 histórico → ingest+RAG → web → rerank flag

## Dev

```bash
pnpm install
turbo dev
# api: wrangler dev (8787) | web: vite (5173, proxy /api → 8787)
```

Token single-user: `POST /api/v1/auth/dev-token { setupSecret: JWT_SECRET }` → salva em `localStorage meu-gpt-token`.
