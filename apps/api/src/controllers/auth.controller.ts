import type { Context } from "hono";
import type { Env } from "../env.js";
import { createDb } from "@meu-gpt/db";
import { checkLogin } from "../services/auth.service.js";
import {
  checkLockout,
  clientIp,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "../services/brute-force.service.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — auth (single-user: usuário + senha hardcoded)
// Ordem: lockout D1 (429) → credencial (403/429 no 5º erro) → token.

export async function login(c: C) {
  const db = createDb(c.env.DB);
  const ip = clientIp(c);
  const lockedUntil = await checkLockout(db, ip);
  if (lockedUntil > Date.now()) {
    c.header("Retry-After", String(Math.ceil((lockedUntil - Date.now()) / 1000)));
    return c.json({ error: "muitas tentativas, tente mais tarde" }, 429);
  }
  const body = await c.req
    .json<{ username?: string; password?: string }>()
    .catch(() => ({}) as { username?: string; password?: string });
  if (!checkLogin(body.username, body.password)) {
    const justLocked = await recordFailedLogin(db, ip);
    if (justLocked) return c.json({ error: "muitas tentativas, tente mais tarde" }, 429);
    return c.json({ error: "bad credentials" }, 403);
  }
  await recordSuccessfulLogin(db, ip);
  return c.json({ token: c.env.SESSION_TOKEN });
}

export async function health(c: C) {
  return c.json({ ok: true, vectorize: "meu-gpt/1024/cosine" });
}
