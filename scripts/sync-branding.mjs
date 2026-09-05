#!/usr/bin/env node
// Sincroniza branding.toml → web + mobile.
// Fonte única de verdade: /branding.toml. Gerados (commitados, como routeTree.gen.ts):
//   apps/web/src/branding.gen.ts    (nome/tagline/accent usados pelos componentes)
//   apps/web/src/branding.gen.css   (override de --primary/--ring no tema shadcn)
//   apps/web/index.html             (title, theme-color, description, manifest)
//   apps/web/public/manifest.webmanifest + ícones copiados
//   branding.gen.json               (lido pelo apps/mobile/app.config.js)
//   apps/mobile/assets/branding/*   (ícones copiados, quando fora de apps/mobile)
// Uso: node scripts/sync-branding.mjs
import { parse } from "smol-toml";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath = resolve(root, "branding.toml");
const webDir = resolve(root, "apps/web");
const mobileDir = resolve(root, "apps/mobile");

const fail = (msg) => {
  console.error(`[sync-branding] ERRO: ${msg}`);
  process.exit(1);
};
const warn = (msg) => console.warn(`[sync-branding] aviso: ${msg}`);

if (!existsSync(tomlPath)) fail("branding.toml não encontrado na raiz.");

const toml = parse(readFileSync(tomlPath, "utf8"));
const app = toml.app ?? {};
const theme = toml.theme ?? {};
const icons = toml.icons ?? {};

// --- validação (falha alto, com mensagem útil) ---
const name = String(app.name ?? "").trim();
if (!name) fail("[app] name vazio.");
if (name.length > 40) fail("[app] name com mais de 40 chars.");
const slug = String(app.slug ?? "").trim();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail('[app] slug deve ser url-safe: minúsculas, números e hífens (ex.: "meu-cerebro").');
}
const tagline = String(app.tagline ?? "").trim();
const HEX = /^#[0-9a-fA-F]{6}$/;
const accent = String(theme.accent ?? "").trim();
const background = String(theme.background ?? "").trim();
if (!HEX.test(accent)) fail(`[theme] accent inválido (${accent || "vazio"}): use hex #rrggbb.`);
if (!HEX.test(background))
  fail(`[theme] background inválido (${background || "vazio"}): use hex #rrggbb.`);

// Resolve um ícone declarado: retorna o path absoluto ou null (ausente = mantém padrão).
function resolveIcon(key) {
  const rel = String(icons[key] ?? "").trim();
  if (!rel) return null;
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    warn(`[icons] ${key}: arquivo não encontrado (${rel}) — mantendo o padrão.`);
    return null;
  }
  return abs;
}

// Copia origem → destino, pulando quando são o mesmo arquivo.
function copyIfDifferent(src, dest) {
  if (src === dest) return false;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

// --- 1. branding.gen.ts (UI da web) ---
const genTs = `// GERADO por scripts/sync-branding.mjs a partir de branding.toml — não edite.
export const BRANDING = {
  name: ${JSON.stringify(name)},
  tagline: ${JSON.stringify(tagline)},
  slug: ${JSON.stringify(slug)},
  accent: ${JSON.stringify(accent)},
  background: ${JSON.stringify(background)},
} as const;
`;
writeFileSync(resolve(webDir, "src/branding.gen.ts"), genTs);

// --- 2. branding.gen.css (accent no tema shadcn; importado pelo index.css) ---
const genCss = `/* GERADO por scripts/sync-branding.mjs a partir de branding.toml — não edite. */
:root {
  --primary: ${accent};
  --ring: ${accent};
  --sidebar-primary: ${accent};
}
`;
writeFileSync(resolve(webDir, "src/branding.gen.css"), genCss);

// --- 3. ícones da web (public/) ---
const publicDir = resolve(webDir, "public");
const webIcons = {
  svg: "favicon.svg",
  png_180: "apple-touch-icon.png",
  png_192: "icon-192.png",
  png_512: "icon-512.png",
  favicon_ico: "favicon.ico",
};
const copied = [];
for (const [key, destName] of Object.entries(webIcons)) {
  const src = resolveIcon(key);
  if (src && copyIfDifferent(src, resolve(publicDir, destName))) copied.push(destName);
}

// --- 4. index.html (title, theme-color, description, manifest) ---
const htmlPath = resolve(webDir, "index.html");
let html = readFileSync(htmlPath, "utf8");
html = html.replace(/<title>.*?<\/title>/, `<title>${name}</title>`);
html = html.replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${background}$2`);
if (/meta name="description"/.test(html)) {
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${tagline}$2`);
} else {
  html = html.replace("</head>", `    <meta name="description" content="${tagline}" />\n  </head>`);
}
if (!/rel="manifest"/.test(html)) {
  html = html.replace(
    "</head>",
    `    <link rel="manifest" href="/manifest.webmanifest" />\n  </head>`,
  );
}
writeFileSync(htmlPath, html);

// --- 5. manifest.webmanifest (PWA instalável com nome/ícones do TOML) ---
const manifestIcons = [];
if (existsSync(resolve(publicDir, "icon-192.png"))) {
  manifestIcons.push({ src: "/icon-192.png", sizes: "192x192", type: "image/png" });
}
if (existsSync(resolve(publicDir, "icon-512.png"))) {
  manifestIcons.push({
    src: "/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any maskable",
  });
}
const manifest = {
  name,
  short_name: name,
  description: tagline,
  start_url: "/",
  display: "standalone",
  background_color: background,
  theme_color: background,
  icons: manifestIcons,
};
writeFileSync(resolve(publicDir, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");

// --- 6. mobile (branding.gen.json lido pelo app.config.js) ---
const appIconSrc = resolveIcon("app_icon");
let mobileIcon = "./assets/icon.png"; // padrão atual
if (appIconSrc) {
  const relToMobile = relative(mobileDir, appIconSrc);
  if (relToMobile.startsWith("..")) {
    // Ícone fora de apps/mobile: copia para assets/branding/.
    const dest = resolve(mobileDir, "assets/branding", basename(appIconSrc));
    copyIfDifferent(appIconSrc, dest);
    mobileIcon = "./assets/branding/" + basename(appIconSrc);
  } else {
    mobileIcon = "./" + relToMobile.split("\\").join("/");
  }
}
const genJson = { name, tagline, slug, accent, background, mobile: { icon: mobileIcon } };
writeFileSync(resolve(root, "branding.gen.json"), JSON.stringify(genJson, null, 2) + "\n");

console.log(`[sync-branding] "${name}" (${slug}) accent ${accent} bg ${background}`);
if (copied.length) console.log(`[sync-branding] ícones atualizados: ${copied.join(", ")}`);
console.log(`[sync-branding] mobile icon: ${mobileIcon}`);
