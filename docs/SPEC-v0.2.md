# meu-gpt — Spec dos Próximos Passos (v0.2)

> Data: 05/09/2026 · Estado: MVP funcional em dev (web + api + RAG e2e)
> Este documento define as fases seguintes, com critérios de aceite. Ordem pensada para maximizar valor com o mínimo de retrabalho.

---

## Estado atual (o que já existe)

| Camada                                                                          | Status                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------- |
| Turborepo (`apps/web`, `apps/api`, `packages/{db,shared,rag}`)                  | ✅                                                 |
| Stack: React 19 + Tailwind 4 + Vite 8 + shadcn/Base UI (Phosphor)               | ✅                                                 |
| Hono 4 + Drizzle 0.45 + Zod 4 + Wrangler 4 (workers-types v5)                   | ✅                                                 |
| Cloudflare: D1 `meu-gpt`, Vectorize `meu-gpt` (1024d cosine), R2 `meu-gpt-docs` | ✅ criados + migrations aplicadas (local e remote) |
| Embedding: `perplexity/pplx-embed-v1-0.6b` via OpenRouter, 1024 nativo, float   | ✅ smoke validado                                  |
| Chat SSE (3 slots: fast/cheap/quality), log por mensagem (model/latency)        | ✅                                                 |
| Auth single-user (JWT `dev-token` + middleware)                                 | ✅                                                 |
| Ingestão: arquivo (PDF/DOCX/TXT/MD/CSV/JSON ≤10MB) ou texto colado              | ✅                                                 |
| Regra "original sempre no R2" (`raw/{docId}/{filename}`)                        | ✅ testada byte-idêntica                           |
| Delete de documento (vetores + chunks + original + D1)                          | ✅                                                 |
| UI: sidebar, histórico, hero, composer, citações colapsáveis, dialog de docs    | ✅                                                 |
| RAG e2e: ingest → retrieve → citação com score                                  | ✅ (score 0.615 no teste)                          |

**Dívidas conhecidas:** bundle web >500KB (sem code-split), `latencyMs` logado mas tokens/custo ainda `null` (OpenRouter `stream_options.usage`), modelo `fast` depende de catálogo `:free` volátil, sem CI, sem testes automatizados, sem deploy de produção.

---

## Fase 1 — Deploy em produção + hardening do básico

**Objetivo:** parar de depender de `wrangler dev`. Usar no dia a dia de qualquer lugar.

1. `wrangler deploy` da API (`meu-gpt-api`) — secrets já no place (`OPENROUTER_API_KEY`, `JWT_SECRET`).
2. Build + deploy do web (Cloudflare Pages/Assets) com `VITE_API_URL` apontando para o Worker.
3. CORS: travar `origin` para o domínio do web (hoje é `*`).
4. Rate limit simples no `/chat` e `/documents/ingest` (`hono-rate-limiter` ou Cloudflare WAF rule).
5. `wrangler versions upload` + alias `dev/prod` (ou pelo menos `--env production`).

**Critérios de aceite**

- [ ] `https://meu-gpt.<subdomain>.workers.dev` responde health
- [ ] Web em produção faz login, chat e ingest de PDF e2e
- [ ] Ingest >10MB rejeitado com mensagem clara
- [ ] CORS bloqueia origem desconhecida

---

## Fase 2 — Uso/custo real por mensagem (observabilidade)

**Objetivo:** saber quanto cada conversa custa e qual modelo vale a pena por slot.

1. Ativar `stream_options: { include_usage: true }` no OpenRouter (ou ler headers `x-openrouter-*`) e preencher `tokensIn`, `tokensOut`, `costUsd` no log da mensagem.
2. Endpoint `GET /api/v1/usage?period=7d` — agregação por dia/slot/modelo (D1 `GROUP BY`).
3. Card de custo na UI (header ou sidebar footer): tokens e custo acumulado do dia.
4. Fallback automático: se o modelo do slot falhar (404/deprecado como o Grok), tentar o próximo do slot e logar o evento.

**Critérios de aceite**

- [ ] Toda resposta assistant tem tokens in/out + custo preenchidos
- [ ] `/usage` devolve agregação correta
- [ ] Modelo deprecado não quebra o chat (fallback + aviso no `done`)

---

## Fase 3 — Qualidade do RAG (rerank on + evals)

**Objetivo:** o top-k parar de vir torto antes de crescer a base.

1. Ligar `RERANK_ENABLED=true` com `voyageai/rerank-2.5-lite` (flag já implementada, interface `Reranker` pronta).
   - Validar formato da resposta do endpoint `/rerank` no OpenRouter (o wrapper já aceita `data[]` e `results[]`).
2. Ingestão de uma base real (10-30 docs seus) para ter volume.
3. Evals mínimos: script com 20 perguntas + docs-alvo esperados → mede recall@5 e MRR antes/depois do rerank. Roda local via `tsx` (não precisa de infra).
4. Se recall seguir ruim: busca híbrida (FTS5 do SQLite/D1 sobre os chunks + fusão com score vetorial).

**Critérios de aceite**

- [ ] Com rerank on, as 20 perguntas do eval têm o doc-alvo no top-3
- [ ] Latência p95 do retrieve < 3s
- [ ] Eval script roda em CI (Fase 5) como gate opcional

---

## Fase 4 — Produtividade no app (features de uso diário)

**Objetivo:** transformar em ferramenta que você abre todo dia.

1. **Regenerar resposta** e **editar última mensagem** (reusa `conversationId`, substitui no D1).
2. **Seleção de modelo por conversa persistida** (hoje o slot é global do cliente; salvar `slot`/`model` na conversa).
3. **Título automático da conversa** (primeira troca gera título com o modelo `fast`).
4. **Busca no histórico** (D1 `LIKE`/FTS5 sobre `messages.content`).
5. **Export** de conversa (md) e do documento original (endpoint raw já existe; adicionar botão).
6. **PWA mínimo** (manifest + service worker) para "instalar" o web no celular — adia o Expo sem perder uso mobile.

**Critérios de aceite**

- [ ] Editar última msg → nova resposta streamando, histórico consistente
- [ ] Conversa renomeada automaticamente com título útil
- [ ] Busca acha mensagens antigas < 200ms
- [ ] PWA instalável no Android/iOS com ícone

---

## Fase 5 — CI + testes

**Objetivo:** confiança para iterar sem quebrar o que funciona.

1. GitHub Actions: `pnpm install` → `turbo typecheck lint` → `build` → deploy preview (wrangler versions).
2. Testes unitários mínimos: `splitText` (limites, overlap), `extractTextFromBuffer` (PDF/DOCX fixture), auth middleware.
3. Teste e2e de smoke em CI contra deploy preview: health + login + chat curto (sem RAG, pra não custar embedding).
4. Gate opcional: evals de RAG da Fase 3 rodando no PR que mexe em `packages/rag`.

**Critérios de aceite**

- [ ] PR sem typecheck/build verde não mergeia
- [ ] Fixtures de PDF/DOCX pequenas no repo para os testes
- [ ] Deploy preview comentado no PR

---

## Fase 6 — Mobile (Expo, quando o web estiver no ar)

**Objetivo:** app nativo consumindo a MESMA API (decisão travada: mesmo back, mesmo turbo).

1. Scaffold `apps/mobile` (Expo + expo-router + nativewind + `packages/shared`).
2. Telas: chat (SSE via `fetch` + `ReadableStream` no Expo — funciona em RN), histórico, ingest (file picker + upload multipart), settings (slot/RAG/token via SecureStore).
3. Build dev via EAS; produção depois.
4. `EXPO_PUBLIC_API_URL` → mesma API de produção.

**Pré-requisito:** Fase 1 concluída (API pública com HTTPS).
**Critérios de aceite**

- [ ] Login, chat com streaming e ingest de PDF funcionando no device
- [ ] Token persistido em SecureStore
- [ ] Uma única fonte de verdade de schemas (`packages/shared`) — zero duplicação

---

## Fase 7 — Bases maiores (quando doer de verdade)

Só entrar aqui se a base crescer (>50 docs / >10MB por doc):

1. **PDF grande/assíncrono:** upload → fila (Cloudflare Queues ou Cron) → parse em background → status no D1 → UI mostra "processando".
2. **OCR** para PDF escaneado (Cloudflare Workers AI ou externo).
3. **Ingest por URL** (crawl + readability) e Google Drive/GitHub.
4. **Namespace por coleção** (filter field no Vectorize já suporta `documentId`; adicionar `collectionId`).
5. Reavaliar D1 vs Turso se bater limite prático de FTS.

---

## Pendências em aberto (decisões suas)

| #   | Pendência                                                                                                          | Impacto                          |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| 1   | Modelo do slot `fast`: hoje `minimax/MiniMax-M3:free` (funcionou no teste). Conferir estabilidade/preço do `:free` | Baixo (fallback na Fase 2 cobre) |
| 2   | Rerank: confirmar modelo exato disponível no OpenRouter no momento (`rerank-2.5-lite` vs `3-lite`)                 | Fase 3                           |
| 3   | Chave da OpenRouter exposta no histórico do chat — regenerar se preferir                                           | Segurança                        |
| 4   | Domínio próprio vs `*.workers.dev`                                                                                 | Fase 1                           |
| 5   | Backup do D1 ( time-travel do CF cobre; definir rotina `wrangler d1 export`)                                       | Fase 1                           |

---

## Ordem recomendada (resumo)

```
Fase 1 (deploy)      ← agora
Fase 2 (uso/custo)   ← barato e desbloqueia decisão de modelos
Fase 4 (produtividade) ← uso diário
Fase 3 (rerank/evals)  ← quando a base crescer
Fase 5 (CI)          ← junto com a Fase 3/4, quando o ritmo de PRs subir
Fase 6 (Expo)        ← depois do web em produção estável
Fase 7 (escala)      ← só quando doer
```
