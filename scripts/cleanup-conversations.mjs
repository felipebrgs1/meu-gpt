#!/usr/bin/env node
// cleanup-conversations.mjs — limpa rastros de teste do D1 (via wrangler).
// Uso:
//   node scripts/cleanup-conversations.mjs [--yes]              # só [E2E-TEST]/[TEST]/e2e (local)
//   node scripts/cleanup-conversations.mjs --all [--yes]        # TUDO (local) — foi o que zerou as 25 de hoje
//   node scripts/cleanup-conversations.mjs --all --remote --yes # TUDO no D1 remoto (cuidado!)
// Sem --yes pede confirmação. Nunca toca na tabela documents/R2/Vectorize.

import { execSync } from "node:child_process";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const REMOTE = args.includes("--remote");
const YES = args.includes("--yes");
const target = REMOTE ? "--remote" : "--local";

const TEST_PATTERNS = ["[E2E-TEST]", "[TEST]", "e2e"];

function run(sql) {
  const cmd = `pnpm --filter @meu-gpt/api exec wrangler d1 execute meu-gpt ${target} --command ${JSON.stringify(sql)} --json`;
  const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const parsed = JSON.parse(out);
  return parsed?.[0]?.results ?? [];
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a);
    }),
  );
}

async function main() {
  const scope = ALL ? "TODAS as conversas" : `só testes (${TEST_PATTERNS.join(" ")})`;
  console.log(`[cleanup] alvo: D1 ${REMOTE ? "REMOTO" : "local"} — escopo: ${scope}`);

  const convs = run("SELECT id, title FROM conversations ORDER BY updated_at DESC LIMIT 200;");
  const victims = ALL
    ? convs
    : convs.filter((c) =>
        TEST_PATTERNS.some((p) => (c.title ?? "").toLowerCase().includes(p.toLowerCase())),
      );
  const orphans = run(
    "SELECT m.id FROM messages m LEFT JOIN conversations c ON m.conversation_id = c.id WHERE c.id IS NULL LIMIT 500;",
  );

  console.log(
    `[cleanup] conversas: ${convs.length} total, ${victims.length} para apagar, ${orphans.length} msgs órfãs`,
  );
  for (const v of victims.slice(0, 15))
    console.log(`  - ${v.id} | ${(v.title ?? "").slice(0, 70)}`);
  if (victims.length > 15) console.log(`  … +${victims.length - 15}`);

  if (victims.length === 0 && orphans.length === 0) {
    console.log("[cleanup] nada a limpar ✓");
    return;
  }
  if (!YES) {
    const a = await ask("[cleanup] apagar? (digite SIM) ");
    if (a.trim() !== "SIM") {
      console.log("[cleanup] cancelado");
      return;
    }
  }

  if (victims.length > 0) {
    const ids = victims.map((v) => `'${String(v.id).replace(/'/g, "''")}'`).join(",");
    run(`DELETE FROM messages WHERE conversation_id IN (${ids});`);
    run(`DELETE FROM conversations WHERE id IN (${ids});`);
  }
  if (orphans.length > 0) {
    const ids = orphans.map((m) => `'${String(m.id).replace(/'/g, "''")}'`).join(",");
    run(`DELETE FROM messages WHERE id IN (${ids});`);
  }

  const after = run("SELECT COUNT(*) AS n FROM conversations;")[0]?.n;
  console.log(`[cleanup] ok — restam ${after} conversas ✓`);
}

main().catch((e) => {
  console.error(`[cleanup] falhou: ${e.message}`);
  process.exit(1);
});
