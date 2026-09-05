import type { Context } from "hono";
import { sign } from "hono/jwt";
import type { Env } from "../env.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — auth (single-user JWT)

export async function devToken(c: C) {
  const body = await c.req
    .json<{ setupSecret?: string }>()
    .catch(() => ({}) as { setupSecret?: string });
  if (body.setupSecret !== c.env.JWT_SECRET) return c.json({ error: "bad secret" }, 403);
  const token = await sign({ sub: c.env.SINGLE_USER_ID, iat: Math.floor(Date.now() / 1000) }, c.env.JWT_SECRET);
  return c.json({ token });
}

export async function health(c: C) {
  return c.json({ ok: true, vectorize: "meu-gpt/1024/cosine" });
}
