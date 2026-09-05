import type { MiddlewareHandler } from "hono";
import { createDb } from "@meu-gpt/db";
import type { Env } from "../env.js";
import { authModel } from "../models/auth.model.js";
import { isValidToken, needsPasswordChange, sessionToken } from "../services/auth.service.js";

// MIDDLEWARE — single-user: Bearer == SESSION_TOKEN (secret, via Env).
// Login: POST /api/v1/auth/login (usuário fixo + senha em D1, default só na 1ª sessão).
// Enquanto a senha default não for trocada, tudo além de /health, /auth/login,
// /auth/status e /auth/change-password responde 403 password_change_required.
// Fail-closed: se o D1 falhar ao ler o estado, bloqueia (força a troca).
export const singleUserAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const path = c.req.path;
  if (path.endsWith("/auth/login") || path.endsWith("/health")) return next();
  const hdr = c.req.header("Authorization") ?? "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token) return c.json({ error: "missing bearer" }, 401);
  // Token esperado incorpora session_version do D1: após qualquer troca de
  // credencial, tokens antigos falham aqui com 401 e o front força o login.
  // Fail-open para null (tabela pode não existir antes da migration): cai no
  // formato legado (versão 0 = o próprio SESSION_TOKEN).
  const db = createDb(c.env.DB);
  const row = await authModel.get(db).catch(() => null);
  if (!isValidToken(token, sessionToken(c.env.SESSION_TOKEN, row))) {
    return c.json({ error: "invalid token" }, 401);
  }
  if (path.endsWith("/auth/status") || path.endsWith("/auth/change-password")) return next();
  try {
    if (await needsPasswordChange(db)) return c.json({ error: "password_change_required" }, 403);
  } catch (err) {
    console.error("[auth] mustChange check fail-closed:", err);
    return c.json({ error: "password_change_required" }, 403);
  }
  return next();
};
