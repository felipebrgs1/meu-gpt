# DEPLOY — guia do agente (self-hosted na Cloudflare)

> **Para quem é:** um agente de código com `wrangler` instalado e autenticado
> (`wrangler whoami` responde o account), rodando dentro deste monorepo.
> **Objetivo:** provisionar do zero a infra de UMA pessoa e publicar API + Web.
> **Tempo típico:** 10–20 min na primeira vez, ~3 min nos deploys seguintes.

---

## 1. Como a aplicação funciona (leia antes de mexer)

```
┌─────────────┐   HTTPS    ┌──────────────┐   bindings    ┌─────────────────────┐
│  WEB (Vite  │ ─────────▶ │ API (Hono    │ ────────────▶ │ D1 meu-gpt          │
│  estático)  │ VITE_API_  │ em Workers)  │               │ conversations       │
│  meu-gpt-web│ URL        │ meu-gpt-api  │ ────────────▶ │ messages            │
└─────────────┘            └──────┬───────┘               │ documents (metadado)│
                                  │                       └─────────────────────┘
                    ┌─────────────┼──────────────┐
                    ▼             ▼              ▼
              ┌──────────┐  ┌───────────┐  ┌─────────────┐
              │ R2       │  │ Vectorize │  │ OpenRouter  │
              │ originais│  │ vetores   │  │ embed+chat  │
              │ + chunks │  │ 1024d cos │  │ +rerank     │
              └──────────┘  └───────────┘  └─────────────┘
```

- **RAG individual, single-user.** Sem multi-tenant. Auth = usuário+senha fixos
  (`apps/api/src/services/auth.service.ts`) que devolvem um token opaco.
- **4 camadas por documento:** original em R2 (`raw/{docId}/{filename}`) +
  chunks em R2 (`chunks/{docId}#i.txt`) + vetores no Vectorize + metadado no D1.
  O delete remove as 4 — nunca apague só uma.
- **Toda IA passa pelo OpenRouter** (`/embeddings`, `/chat/completions`, `/rerank`).
  Nunca chame vendor direto. O índice Vectorize é **1024 dims + cosine** —
  dimensão diferente disso = abortar e investigar, **nunca truncar**.
- **Fonte única de segredos local:** `.env` na raiz. `apps/api/.dev.vars` é
  **gerado** por `scripts/sync-env.mjs` — nunca edite à mão, nunca commite.
- **Produção ≠ `.env`:** em produção os segredos vivem como
  `wrangler secret` e as vars não-secretas em `apps/api/wrangler.toml [vars]`.
- **Slots de modelo, não ids hardcoded:** o código usa `fast|cheap|quality`,
  resolvidos via env (`CHAT_MODEL_*`). Ids de modelo só aparecem em
  `wrangler.toml [vars]` / `.env`.

---

## 2. Pré-requisitos (checklist do agente)

Execute nesta ordem. Pare no primeiro que falhar e corrija antes de seguir.

```bash
# 1. Estou na raiz do monorepo?
ls wrangler.toml 2>/dev/null; ls apps/api/wrangler.toml apps/web/wrangler.toml

# 2. Node + pnpm exatos?
node -v && pnpm -v          # esperado: pnpm 12.x (ver packageManager em package.json)

# 3. Wrangler autenticado?
pnpm --filter @meu-gpt/api exec wrangler whoami
# esperado: mostra account_id + email. Se pedir login: wrangler login

# 4. Dependências instaladas?
pnpm install

# 5. Segredo OpenRouter disponível? (1 key para embed+chat+rerank)
grep -q '^OPENROUTER_API_KEY=.\+' .env && echo "OPENROUTER_API_KEY ok" || echo "FALTA: preencha .env (cp .env.example .env)"
```

> Não continue sem `whoami` verde e `OPENROUTER_API_KEY` preenchido.

---

## 3. Provisionamento primeira vez (idempotente)

Os nomes padrão são `meu-gpt` (D1 + Vectorize) e `meu-gpt-docs` (R2).
Se a pessoa quiser outros nomes, troque nos 3 comandos **e** nos
`binding`/`index_name`/`bucket_name`/`database_id` do `apps/api/wrangler.toml`.

```bash
cd apps/api

# --- 3a. Vectorize (1024 dims, cosine — TRAVADO, não mude) ---
npx wrangler vectorize list | grep -q 'meu-gpt' \
  || npx wrangler vectorize create meu-gpt --dimensions=1024 --metric=cosine
npx wrangler vectorize list

# --- 3b. D1 ---
npx wrangler d1 list | grep -q 'meu-gpt' \
  || npx wrangler d1 create meu-gpt
# Se criou agora: copie o database_id impresso para
# apps/api/wrangler.toml > [[d1_databases]] > database_id
npx wrangler d1 list

# --- 3c. R2 ---
npx wrangler r2 bucket list | grep -q 'meu-gpt-docs' \
  || npx wrangler r2 bucket create meu-gpt-docs
npx wrangler r2 bucket list

cd ../..
```

### 3d. Migrations D1 (local + remote)

```bash
# Gera migration nova SOMENTE se packages/db/schema mudou:
pnpm --filter @meu-gpt/db db:generate

# Aplica local (dev) e remoto (produção):
pnpm --filter @meu-gpt/api exec wrangler d1 migrations apply meu-gpt --local
pnpm --filter @meu-gpt/api exec wrangler d1 migrations apply meu-gpt --remote
```

### 3e. Valida o embedding (trava 1024d)

```bash
pnpm --filter @meu-gpt/rag smoke:embed
# esperado: dimensão 1024. Qualquer outro valor = abortar, não truncar.
```

---

## 4. Segredos de produção

```bash
cd apps/api

# Obrigatório (chat + embeddings + rerank via OpenRouter):
npx wrangler secret put OPENROUTER_API_KEY   # cola a mesma key do .env

# Obrigatório (token opaco devolvido pelo /auth/login — é o que autoriza o Bearer):
npx wrangler secret put SESSION_TOKEN        # gere com: openssl rand -hex 32

npx wrangler secret list   # confere: OPENROUTER_API_KEY presente
cd ../..
```

> Auth do app: usuário + senha mutáveis em D1 (tabela `auth_state`, hash
> SHA-256 com salt). A credencial inicial é `user` / `123456` e a 1ª sessão
> OBRIGA a troca (`POST /api/v1/auth/change-password` com `newPassword` e/ou
> `newUsername`; só a troca de senha quita a obrigação) — enquanto não trocar,
> a API barra tudo com 403 `password_change_required`. Depois, a troca segue
> disponível na web em Conta (sidebar). O token de
> sessão vem de secret (`SESSION_TOKEN`) — o repo pode ser público sem vazar acesso.
> Para resetar ao default (dev): `DELETE FROM auth_state;` no D1 local/remoto.
> Para rotacionar o acesso sem trocar a senha: gere um novo `SESSION_TOKEN`
> (`openssl rand -hex 32`), `secret put` de novo e redeploye.
> Não existe `JWT_SECRET` — se algum doc antigo citar, ignore (removido).

---

## 5. Deploy da API

```bash
# Valida antes:
pnpm typecheck
pnpm --filter @meu-gpt/api exec wrangler deploy --dry-run

# Publica:
pnpm --filter @meu-gpt/api exec wrangler deploy
# anote a URL impressa, ex: https://meu-gpt-api.<subdominio>.workers.dev
export API_URL="https://meu-gpt-api.<subdominio>.workers.dev"

# Smoke test (público, sem auth):
curl -s "$API_URL/api/v1/health"
# esperado: {"ok":true} (ou payload de health do controller)

# Smoke test com auth:
curl -s -X POST "$API_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"user","password":"123456"}'
# esperado: {"token":"...","mustChangePassword":true|false} — na 1ª sessão (user/123456)
# vem mustChangePassword=true e o chat fica bloqueado (403 password_change_required)
# até trocar a senha (ver §8). E2E usa E2E_USER/E2E_PASS (default: user/123456).
```

Se o `deploy` reclamar de `account_id`: o `apps/api/wrangler.toml` traz o
`account_id` do dono. Para publicar em outra conta, substitua pelo id
mostrado em `wrangler whoami`.

---

## 6. Deploy da Web

A web é um Worker **só de assets** (`apps/web/wrangler.toml` → `dist`,
`not_found_handling = single-page-application` para o TanStack Router).
O endereço da API é injetado **no build** via `VITE_API_URL`.

```bash
# 1. Build apontando para a API publicada:
VITE_API_URL="$API_URL" pnpm --filter @meu-gpt/web build
# (typecheck+vite; dist/ é gerado. VITE_API_URL vazio = só funciona em dev via proxy.)

# 2. Publica:
pnpm --filter @meu-gpt/web exec wrangler deploy
# anote: https://meu-gpt-web.<subdominio>.workers.dev

# 3. Teste e2e manual no browser ou curl:
#    - abre a URL da web → login → manda "olá" (chat sem RAG)
#    - ingest de um PDF pequeno → pergunta sobre o conteúdo → checa citação
```

> **Armadilha:** trocou a URL da API depois? Precisa **rebuildar + redeployar**
> a web (`VITE_API_URL` é estático, embutido no JS).

---

## 7. Deploys seguintes (rotina)

```bash
pnpm typecheck
pnpm --filter @meu-gpt/api exec wrangler deploy --dry-run
pnpm --filter @meu-gpt/api exec wrangler deploy

# Só redeploye a web se o front mudou OU se a URL da API mudou:
VITE_API_URL="$API_URL" pnpm --filter @meu-gpt/web deploy
```

---

## 8. Pós-deploy: hardening mínimo

0. **TROQUE A CREDENCIAL PADRÃO (obrigatório e automático).** O repo sai com `user` / `123456`.
   Na 1ª sessão a web exige o ajuste (usuário editável + senha nova mín. 8 chars) e a API
   bloqueia chat/docs/conversas com 403 `password_change_required` até concluir.
   Via curl: login → `POST /api/v1/auth/change-password` com o Bearer.
   Confirme que a credencial antiga retorna 403 após a troca.
   Opcional: rotacione também o `SESSION_TOKEN` (`openssl rand -hex 32`).
1. **CORS:** hoje a API usa `cors()` aberto (`app.use("*", cors())` em
   `apps/api/src/index.ts`). Trave `origin` para o domínio da web antes de
   expor a estranhos.
2. **Anti-bot (já implementado na API):**
   - `POST /auth/login`: 10 tentativas / 15min por IP (429) + lockout em D1 —
     5 erros consecutivos = IP bloqueado 15min (tabela `login_attempts`).
   - `POST /chat`, `POST /documents/ingest*`: 30 req/min por IP (429).
   - Contadores em D1 (valem entre isolates; `MemoryStore` não serve no
     runtime Workers). Security headers ativos (`secureHeaders`).
   - Teste rápido: 5 logins errados → o 5º devolve 429; login certo durante
     o lock → 429 com `Retry-After`; após 15min (ou `DELETE FROM login_attempts`)
     o login volta a 200.
   - Camada de edge (recomendado): crie Rate Limiting Rules / WAF na dashboard
     Cloudflare para o domínio da API — segura o bot antes de chegar no Worker.
3. **Limite de upload:** ingest rejeita >10MB com mensagem clara (validar).
4. **Domínio próprio (opcional):** `wrangler custom-domains` / route na
   dashboard para `app.seudominio.com` → `meu-gpt-web`.

---

## 9. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `wrangler dev` subiu em `:8788` em vez de `:8787` | workerd órfão ocupando a porta | `pkill -f 'workerd\|wrangler'` e subir de novo (o proxy do Vite aponta para 8787) |
| Vectorize query não acha doc recém-ingerido | consistência eventual (segundos) | aguardar e repetir; não é bug |
| Erro de dimensão ≠ 1024 no embed | modelo de embed trocado | abortar; conferir `EMBED_MODEL` no `.env`/`wrangler.toml`; nunca truncar |
| `process is not defined` no Worker | `process.env` não existe no runtime | usar `typeof process !== "undefined" ? process.env?.X : undefined` (services injetam `Env`) |
| Build web ok mas login falha (network error) | `VITE_API_URL` errada ou build sem ela | rebuildar com `VITE_API_URL` correta + redeploy |
| CORS bloqueando a web | origin da web ≠ permitida | conferir passo 8.1 |
| `database_id` inválido | `wrangler.toml` com id de outra conta | recriar D1 na conta atual e colar o novo id |
| Tipos do Drizzle quebrados | duas versões de `@cloudflare/workers-types` | versão é fixada via `pnpm-workspace.yaml > overrides` — não adicionar outra |

---

## 10. Desmonte (apagar a instância — irreversível)

```bash
cd apps/api
npx wrangler delete meu-gpt-api
npx wrangler vectorize delete meu-gpt
npx wrangler d1 delete meu-gpt
npx wrangler r2 bucket delete meu-gpt-docs
cd ../web && npx wrangler delete meu-gpt-web
```

---

## Referências

- `README.md` — visão geral + dev local
- `AGENTS.md` — regras não negociáveis do monorepo
- `docs/SPEC-v0.2.md` — roadmap (Fase 1 = este deploy)
- `apps/api/wrangler.toml` — bindings e vars de produção (API)
- `apps/web/wrangler.toml` — assets estáticos (Web)
