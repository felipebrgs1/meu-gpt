# @meu-gpt/mobile — app Expo (React Native)

ChatGPT pessoal no bolso: paridade com `apps/web` (auth single-user, slots
`fast|cheap|quality`, streaming SSE, RAG sempre ativo, ingest de documentos),
falando com a mesma API (`apps/api`) e o mesmo contrato (`packages/shared`).

> **Limite de escopo:** este package só importa `@meu-gpt/shared` — nunca
> `apps/web`. Todo código novo mora em `apps/mobile/**`.

## Pré-requisitos

- Por padrão o app fala com a **API de produção** (`EXPO_PUBLIC_API_URL` no `.env`
  da raiz → `https://meu-gpt-api.felipebrgs.workers.dev`). Nada a configurar.
- Para dev local, a API precisa estar **acessível do device**
  (`pnpm --filter @meu-gpt/api dev` → `:8787`) e a URL sobrescrita na hora:
  - Emulador Android: `http://10.0.2.2:8787`
  - Device físico na mesma rede: `http://<IP-LAN>:8787` (ex: `http://192.168.0.10:8787`)

```bash
# Produção (padrão do .env da raiz — regra do AGENTS.md: fonte única)
EXPO_PUBLIC_API_URL=https://meu-gpt-api.felipebrgs.workers.dev

pnpm --filter @meu-gpt/mobile dev
# escaneie o QR com o Expo Go, ou: a (android) / i (ios) / w (web)

# Dev local (env de processo tem precedência sobre o .env da raiz):
EXPO_PUBLIC_API_URL=http://192.168.0.10:8787 pnpm --filter @meu-gpt/mobile dev
# após trocar a URL, reinicie o Expo com cache limpo: expo start -c
```

Login: usuário `felipeb` + senha (hardcoded em
`apps/api/src/services/auth.service.ts`). O token de sessão fica no
SecureStore do device (nativo) ou `localStorage` (web).

## Estrutura

```
app/                  rotas expo-router (file-based, como o TanStack do web)
  _layout.tsx         Stack + StatusBar clara (tema dark stone)
  index.tsx           chat (equivale a pages/ChatPage.tsx)
  documents.tsx       gerenciador de fontes do RAG
src/
  lib/api.ts          client HTTP — espelho de apps/web/src/lib/api.ts
                      (SecureStore no lugar de localStorage;
                       SSE via XMLHttpRequest — RN não tem ReadableStream#getReader)
  lib/slots.ts        slots fast|cheap|quality + quick prompts (sem ícones web)
  screens/ChatScreen.tsx  state machine idêntica à ChatPage (auth, convs, stream…)
  components/         AuthGate, ChatMessages, Composer, SlotPicker,
                      ConversationsSheet (sidebar), IngestSheet, SourcesSheet
  theme.ts            palette dark stone (equivale ao .dark do web)
```

## Paridade web → mobile

| web                         | mobile                                                            |
| --------------------------- | ----------------------------------------------------------------- |
| `ChatSidebar`               | `ConversationsSheet` (bottom sheet)                               |
| `ChatHeader` slot menu      | `SlotPicker` + título no header                                   |
| `ChatHeader` fontes         | `SourcesSheet` + rota `/documents`                                |
| `IngestDialog`              | `IngestSheet` (texto + `expo-document-picker`)                    |
| `streamChat` (fetch reader) | `streamChat` (XHR progressivo, mesmos eventos)                    |
| deep link `/c/:id`          | estado `activeId` (sem URL no native)                             |
| markdown + mermaid + GFM    | markdown GFM (`mermaid` vira bloco de código — sem WebView na v1) |
| copiar resposta             | `expo-clipboard`                                                  |

## Teste sem rastro (regra do monorepo)

O app persiste conversas como o web. Para testar sem sujar o D1, converse e
apague a conversa no `finally`, ou use `ephemeral:true` via curl:

```bash
pnpm test:e2e    # ephemeral + persist→delete (exige api em :8787)
pnpm cleanup     # remove conversas [E2E-TEST]/[TEST] órfãs
```

## Definition of done (mobile)

1. `pnpm --filter @meu-gpt/mobile typecheck` verde
2. `npx expo export --platform all` (build) verde — equivale ao dry-run
3. Chat manual fim-a-fim no Expo Go: login → send → stream → citações → ingest → delete
4. Nenhum segredo novo fora de `.env` + `.env.example` (só `EXPO_PUBLIC_API_URL`, público por design)
