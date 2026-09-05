import type { Context } from "hono";
import type { Env } from "../env.js";
import { createDb } from "@meu-gpt/db";
import { changePasswordRequestSchema, loginRequestSchema } from "@meu-gpt/shared";
import { changePassword, needsPasswordChange, verifyCredentials } from "../services/auth.service.js";
import {
  checkLockout,
  clientIp,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "../services/brute-force.service.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — auth (single-user: usuário fixo + senha mutável em D1).
// Ordem no login: lockout D1 (429) → credencial (403/429 no 5º erro) → token + mustChangePassword.
// Primeira sessão: mustChangePassword=true até POST /auth/change-password.

export async function login(c: C) {
  const db = createDb(c.env.DB);
  const ip = clientIp(c);
  const lockedUntil = await checkLockout(db, ip);
  if (lockedUntil > Date.now()) {
    c.header("Retry-After", String(Math.ceil((lockedUntil - Date.now()) / 1000)));
    return c.json({ error: "muitas tentativas, tente mais tarde" }, 429);
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = loginRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const justLocked = await recordFailedLogin(db, ip);
    if (justLocked) return c.json({ error: "muitas tentativas, tente mais tarde" }, 429);
    return c.json({ error: "bad credentials" }, 403);
  }
  if (!(await verifyCredentials(db, parsed.data.username, parsed.data.password))) {
    const justLocked = await recordFailedLogin(db, ip);
    if (justLocked) return c.json({ error: "muitas tentativas, tente mais tarde" }, 429);
    return c.json({ error: "bad credentials" }, 403);
  }
  await recordSuccessfulLogin(db, ip);
  return c.json({ token: c.env.SESSION_TOKEN, mustChangePassword: await needsPasswordChange(db) });
}

export async function status(c: C) {
  const db = createDb(c.env.DB);
  return c.json({ mustChangePassword: await needsPasswordChange(db) });
}

export async function changeUserPassword(c: C) {
  const db = createDb(c.env.DB);
  const raw = await c.req.json().catch(() => ({}));
  const parsed = changePasswordRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "dados inválidos";
    return c.json({ error: msg }, 400);
  }
  const out = await changePassword(db, parsed.data.currentPassword, parsed.data.newPassword);
  if (!out.ok) {
    const code = out.reason === "senha atual incorreta" ? 403 : out.reason.includes("indisponível") ? 500 : 400;
    return c.json({ error: out.reason }, code as 400 | 403 | 500);
  }
  return c.json({ ok: true });
}

export async function health(c: C) {
  return c.json({ ok: true, vectorize: "meu-gpt/1024/cosine" });
}
