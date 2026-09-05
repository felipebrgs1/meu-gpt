#!/usr/bin/env node
// e2e-chat-test.mjs — esquema TESTA-E-DEPOIS-APAGA.
// Uso:  node scripts/e2e-chat-test.mjs [--base http://localhost:8787]
// Requer: api rodando (pnpm dev ou wrangler dev). Login com usuário+senha hardcoded.
//
// Fluxo:
//   1. health check
//   2. TESTE A (ephemeral:true): chata sem deixar rastro → prova que NÃO aparece no histórico
//   3. TESTE B (persist→delete): chat normal com id próprio → prova que APARECE, depois APAGA
//      e prova que SUMIU (o DELETE roda em `finally`: passou ou falhou, não deixa rastro).
// Título/mensagem sempre com prefixo [E2E-TEST] para o cleanup achar se algo falhar no meio.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = (baseIdx >= 0 ? args[baseIdx + 1] : process.env.E2E_BASE) ?? "http://localhost:8787";
const PREFIX = "[E2E-TEST]";

function loadEnvVar(name) {
  const p = resolve(root, ".env");
  if (!existsSync(p)) return undefined;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq).trim() === name) {
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      return v;
    }
  }
  return undefined;
}

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* SSE ou vazio */
  }
  return { status: res.status, ok: res.ok, text, json };
}

// Lê o SSE (event: token/done/error) e devolve { tokens, done, fullText, conversationId }
async function readSSE(path, { token, body }) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body)
    throw new Error(`chat HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = null;
  const out = { tokens: 0, done: null, error: null, conversationId: null };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      let ev = event;
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      event = null;
      if (!ev || !data) continue;
      let payload = {};
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev === "token") out.tokens++;
      else if (ev === "done") {
        out.done = payload;
        out.conversationId = payload.conversationId ?? null;
      } else if (ev === "error") out.error = payload;
    }
  }
  return out;
}

async function main() {
  console.log(`[e2e] base=${BASE}`);

  const health = await req("/api/v1/health");
  if (!health.ok)
    throw new Error(`api fora do ar (${BASE}): HTTP ${health.status} — suba com: pnpm dev`);
  console.log("[e2e] health ok");

  const user = process.env.E2E_USER ?? loadEnvVar("E2E_USER") ?? "user";
  const pass = process.env.E2E_PASS ?? loadEnvVar("E2E_PASS") ?? "123456";
  const login = await req("/api/v1/auth/login", {
    method: "POST",
    body: { username: user, password: pass },
  });
  if (!login.ok || !login.json?.token)
    throw new Error(`login falhou: HTTP ${login.status} ${login.text.slice(0, 120)}`);
  const token = login.json.token;
  console.log("[e2e] token ok");
  if (login.json?.mustChangePassword) {
    throw new Error(
      "[e2e] senha default ainda ativa (mustChangePassword=true) — a API bloqueia o chat com 403 password_change_required. " +
        "Troque a senha na UI (1ª sessão) ou via: " +
        `curl -X POST ${BASE}/api/v1/auth/change-password -H "Authorization: Bearer <token>" -H "Content-Type: application/json" ` +
        `-d '{"currentPassword":"${pass}","newPassword":"<nova-8+chars>"}' — depois rode com E2E_PASS=<nova> node scripts/e2e-chat-test.mjs`,
    );
  }

  const listIds = async () =>
    ((await req("/api/v1/conversations", { token })).json ?? []).map((c) => c.id);

  // ---- TESTE A: ephemeral (nunca persiste) ----
  {
    const cid = crypto.randomUUID();
    console.log(`[e2e:A] ephemeral chat cid=${cid}`);
    const sse = await readSSE("/api/v1/chat", {
      token,
      body: {
        conversationId: cid,
        slot: "cheap",
        ephemeral: true,
        messages: [{ role: "user", content: `${PREFIX} ping ephemeral — responda só "pong".` }],
      },
    });
    if (sse.error) throw new Error(`[e2e:A] SSE error: ${JSON.stringify(sse.error)}`);
    if (!sse.done) throw new Error("[e2e:A] SSE sem evento done");
    if (sse.conversationId !== cid)
      throw new Error(`[e2e:A] conversationId divergiu (${sse.conversationId} ≠ ${cid})`);
    console.log(
      `[e2e:A] done ok (tokens=${sse.tokens}, fullText=${(sse.done.fullText ?? "").length} chars)`,
    );
    const ids = await listIds();
    if (ids.includes(cid))
      throw new Error("[e2e:A] RASTRO! conversa ephemeral apareceu no histórico");
    console.log("[e2e:A] sem rastro ✓");
  }

  // ---- TESTE B: persiste → verifica → APAGA (delete em finally) ----
  {
    const cid = crypto.randomUUID();
    console.log(`[e2e:B] persist-then-delete cid=${cid}`);
    // Flag em vez de throw dentro do finally (throw lá é unsafe: mascara o
    // erro original do try). O finally sempre apaga; a verificação falha fora.
    let leftover = false;
    try {
      const sse = await readSSE("/api/v1/chat", {
        token,
        body: {
          conversationId: cid,
          slot: "cheap",
          messages: [{ role: "user", content: `${PREFIX} ping delete-me — responda só "pong".` }],
        },
      });
      if (sse.error) throw new Error(`[e2e:B] SSE error: ${JSON.stringify(sse.error)}`);
      if (!sse.done) throw new Error("[e2e:B] SSE sem evento done");
      const ids = await listIds();
      if (!ids.includes(cid))
        throw new Error("[e2e:B] conversa persistida NÃO apareceu no histórico");
      console.log("[e2e:B] persistiu ✓ — apagando…");
    } finally {
      const del = await req(`/api/v1/conversations/${cid}`, { method: "DELETE", token });
      if (!del.ok)
        console.error(
          `[e2e:B] WARN delete falhou: HTTP ${del.status} — rode: node scripts/cleanup-conversations.mjs`,
        );
      else console.log("[e2e:B] DELETE ok");
      const ids = await listIds();
      leftover = ids.includes(cid);
      if (!leftover) console.log("[e2e:B] apagada e verificada ✓");
    }
    if (leftover) throw new Error("[e2e:B] RASTRO! conversa continua no histórico após DELETE");
  }

  console.log("[e2e] VERDE — testou e apagou, nenhum rastro.");
}

main().catch((e) => {
  console.error(`[e2e] VERMELHO — ${e.message}`);
  console.error(`[e2e] Se sobrou rastro, limpe com: node scripts/cleanup-conversations.mjs --yes`);
  process.exit(1);
});
