# BRANDING — identidade do app via TOML

Tudo que é "marca" (nome, ícone, cor) vive em **`branding.toml`** na raiz.
Editar o TOML + rodar o sync (ou só buildar a web, que roda sozinho) rebatiza
web + mobile de uma vez. Nada de caçar strings no código.

## Uso

```bash
# 1. Edite branding.toml (nome, slug, cores, caminhos dos ícones)
# 2. Sincronize:
node scripts/sync-branding.mjs
# 3. Confira e commite os *.gen.* (são commitados, como o routeTree.gen.ts)
```

O `dev` e o `build` da web rodam o sync automaticamente (`predev`/`prebuild`).

## O que cada campo faz

| Campo | Onde aparece |
|---|---|
| `[app] name` | título da aba, header do chat, tela de login, PWA, nome do app Expo |
| `[app] tagline` | `<meta description>`, descrição do PWA |
| `[app] slug` | PWA + Expo `slug`/`scheme` (url-safe: minúsculas-números-hífens) |
| `[theme] accent` | `--primary`/`--ring`/`--sidebar-primary` do shadcn (botões, destaques, foco) |
| `[theme] background` | `<meta theme-color>`, splash, fundo do PWA |
| `[icons] svg/png_180/png_192/png_512/favicon_ico` | copiados para `apps/web/public/` (favicon, apple-touch, PWA) |
| `[icons] app_icon` | ícone do Expo (PNG 1024); copiado para `apps/mobile/assets/branding/` se estiver fora de `apps/mobile/` |

Todos os `[icons]` são opcionais: campo ausente ou arquivo inexistente =
mantém o padrão atual (com aviso, sem erro).

## Trocar os ícones (passo a passo)

1. Jogue seus arquivos numa pasta, ex.: `branding/icon.svg`, `branding/icon-192.png`,
   `branding/icon-512.png`, `branding/icon-1024.png`.
2. Aponte o TOML para eles.
3. `node scripts/sync-branding.mjs` → confira `apps/web/public/` e o manifest.
4. Rebuild + redeploy da web (ícones são estáticos, embutidos no deploy).

Tamanhos mínimos sensatos: SVG livre; PNG 180/192/512 nos tamanhos do nome;
`app_icon` 1024×1024.

## O que o TOML não muda (de propósito)

- **Auth e storage:** usuário/senha (`auth.service.ts`), `SESSION_TOKEN` (secret)
  e a chave `localStorage` seguem estáveis — rebatizar o app não desloga ninguém
  nem gira segredo.
- **Modo claro/escuro:** o app é dark-only (body, mermaid e splash nasceram dark).
  O TOML troca o *accent*, não o esquema. Um modo claro exigiria retemar os
  componentes.
- **Nomes de infra:** Worker/D1/R2/Vectorize continuam `meu-gpt*` — renomear
  infra é recriar recursos, não rebrand.

## Referências

- `branding.toml` — fonte única de verdade
- `scripts/sync-branding.mjs` — gerador (valida e falha alto)
- `branding.gen.json` — saída para o mobile (`app.config.js` lê daqui)
