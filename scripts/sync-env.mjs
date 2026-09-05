#!/usr/bin/env node
// Gera apps/api/.dev.vars a partir do .env central da raiz do monorepo.
// O .dev.vars é um artefato NUNCA editado à mão — fonte única de verdade: /.env
// Uso: node scripts/sync-env.mjs [caminho-do-output]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const outPath = resolve(root, process.argv[2] ?? "apps/api/.dev.vars");

if (!existsSync(envPath)) {
  console.error(`[sync-env] .env não encontrado em ${envPath}`);
  console.error(`[sync-env] Copie .env.example para .env e preencha os segredos.`);
  process.exit(1);
}

const lines = readFileSync(envPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const eq = l.indexOf("=");
    if (eq === -1) return null;
    const key = l.slice(0, eq).trim();
    let val = l.slice(eq + 1).trim();
    // remove aspas envolventes se houver
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return `${key}="${val}"`;
  })
  .filter(Boolean);

writeFileSync(outPath, lines.join("\n") + "\n", { mode: 0o600 });
console.log(`[sync-env] ${outPath} gerado a partir de .env (${lines.length} vars)`);
