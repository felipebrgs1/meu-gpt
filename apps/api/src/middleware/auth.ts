import type { MiddlewareHandler } from "hono";
import type { Env } from "../env.js";
import { isValidToken } from "../services/auth.service.js";

// MIDDLEWARE — single-user: Bearer == SESSION_TOKEN (secret, via Env).
// Login: POST /api/v1/auth/login (username + password hardcoded).
export const singleUserAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.path.endsWith("/auth/login") || c.req.path.endsWith("/health")) return next();
  const hdr = c.req.header("Authorization") ?? "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token) return c.json({ error: "missing bearer" }, 401);
  if (!isValidToken(token, c.env.SESSION_TOKEN)) return c.json({ error: "invalid token" }, 401);
  return next();
};
