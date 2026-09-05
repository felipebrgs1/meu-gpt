import type { Context } from "hono";
import type { Env } from "../env.js";
import { SESSION_TOKEN, checkLogin } from "../services/auth.service.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — auth (single-user: usuário + senha hardcoded)

export async function login(c: C) {
  const body = await c.req
    .json<{ username?: string; password?: string }>()
    .catch(() => ({}) as { username?: string; password?: string });
  if (!checkLogin(body.username, body.password)) return c.json({ error: "bad credentials" }, 403);
  return c.json({ token: SESSION_TOKEN });
}

export async function health(c: C) {
  return c.json({ ok: true, vectorize: "meu-gpt/1024/cosine" });
}
