import { eq, lt } from "drizzle-orm";
import { rateLimits, type Db } from "@meu-gpt/db";

// SERVICE — rate limit de janela fixa em D1.
// Por que D1 e não hono-rate-limiter/MemoryStore? O MemoryStore cria
// setInterval no escopo global (proibido no runtime Workers) e, mesmo
// lazily, morre com o isolate — contadores por isolate não seguram bot.
// Em D1 o contador é global da instância. Tudo fail-open.

export interface RateLimitSpec {
  /** Prefixo da chave (ex.: "login"). Vira `rl:<name>:<ip>:<janela>`. */
  name: string;
  windowMs: number;
  limit: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Epoch ms do fim da janela (para Retry-After / RateLimit-Reset). */
  resetMs: number;
}

export async function checkRateLimit(
  db: Db,
  spec: RateLimitSpec,
  ip: string,
  now = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / spec.windowMs) * spec.windowMs;
  const resetMs = windowStart + spec.windowMs;
  const key = `rl:${spec.name}:${ip}:${windowStart}`;
  try {
    const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
    const hits = (rows[0]?.hits ?? 0) + 1;
    if (hits === 1) {
      // Rollover da janela: insere e limpa janelas expiradas deste limiter.
      await db.insert(rateLimits).values({
        key,
        windowStart,
        hits: 1,
        updatedAt: new Date(now).toISOString(),
      });
      await db
        .delete(rateLimits)
        .where(lt(rateLimits.windowStart, windowStart));
    } else {
      await db.update(rateLimits).set({ hits }).where(eq(rateLimits.key, key));
    }
    return { allowed: hits <= spec.limit, remaining: Math.max(0, spec.limit - hits), resetMs };
  } catch (err) {
    console.error("[rate-limit] checkRateLimit fail-open:", err);
    return { allowed: true, remaining: spec.limit, resetMs };
  }
}
