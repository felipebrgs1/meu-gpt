import type { MiddlewareHandler } from "hono";
import { createDb } from "@meu-gpt/db";
import type { Env } from "../env.js";
import { clientIp } from "../services/brute-force.service.js";
import { checkRateLimit, type RateLimitSpec } from "../services/rate-limit.service.js";

// MIDDLEWARE — rate limit por IP com contador em D1 (global da instância).
// A trava dura contra brute-force é o lockout (brute-force.service); aqui
// seguramos volume. Para proteção no edge, ative Rate Limiting Rules na
// dashboard Cloudflare (ver DEPLOY §8).

type C = { Bindings: Env };

function makeLimiter(spec: RateLimitSpec, message: string): MiddlewareHandler<C> {
  return async (c, next) => {
    const db = createDb(c.env.DB);
    const r = await checkRateLimit(db, spec, clientIp(c));
    c.header("RateLimit-Limit", String(spec.limit));
    c.header("RateLimit-Remaining", String(r.remaining));
    c.header("RateLimit-Reset", String(Math.ceil(r.resetMs / 1000)));
    if (!r.allowed) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((r.resetMs - Date.now()) / 1000))));
      return c.json({ error: message }, 429);
    }
    return next();
  };
}

// Login: 10 tentativas / 15min por IP. Bot de força bruta morre aqui
// antes mesmo de encostar no lockout do D1 (5 erros consecutivos = 15min lock).
export const loginLimiter = makeLimiter(
  { name: "login", windowMs: 15 * 60 * 1000, limit: 10 },
  "muitas tentativas, tente mais tarde",
);

// Escrita cara (LLM/embed): 30 req/min por IP. Single-user nunca encosta;
// bot varrendo o chat paga 429 sem gastar seu OpenRouter.
export const writeLimiter = makeLimiter(
  { name: "write", windowMs: 60 * 1000, limit: 30 },
  "muitas requisições, tente mais tarde",
);
