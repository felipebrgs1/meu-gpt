import type { MiddlewareHandler } from "hono";
import { verify } from "hono/jwt";
import type { Env } from "../env.js";

// MIDDLEWARE — single-user: Bearer JWT com sub == SINGLE_USER_ID.
// Mint inicial: POST /api/v1/auth/dev-token (setupSecret == JWT_SECRET).
export const singleUserAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.path.endsWith("/auth/dev-token") || c.req.path.endsWith("/health")) return next();
  const hdr = c.req.header("Authorization") ?? "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token) return c.json({ error: "missing bearer" }, 401);
  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    if (payload.sub !== c.env.SINGLE_USER_ID) return c.json({ error: "wrong sub" }, 403);
    return next();
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
};
