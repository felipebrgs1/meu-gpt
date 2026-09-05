import { eq } from "drizzle-orm";
import { loginAttempts, type Db } from "@meu-gpt/db";

// SERVICE — anti-brute-force do login (single-user).
// Estado em D1 (não em memória): Workers escalam por isolates e o
// MemoryStore do rate-limiter morre com o isolate — o lock precisa persistir.
// Tudo fail-open: erro de D1 (ex.: migration não aplicada) nunca trava o login.

export const MAX_FAILS = 5; // tentativas erradas consecutivas até o lock
export const LOCK_MS = 15 * 60 * 1000; // duração do lock por IP

type HeaderReader = { req: { header(name: string): string | undefined } };

// IP real atrás da Cloudflare. Em `wrangler dev` cai em "unknown"
// (todo o tráfego local compartilha a cota — ok para dev).
export function clientIp(c: HeaderReader): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

// Epoch ms até quando o IP está bloqueado; 0 = liberado.
export async function checkLockout(db: Db, ip: string): Promise<number> {
  try {
    const rows = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip));
    const row = rows[0];
    if (!row?.lockedUntil) return 0;
    if (row.lockedUntil <= Date.now()) return 0; // lock expirado
    return row.lockedUntil;
  } catch (err) {
    console.error("[brute-force] checkLockout fail-open:", err);
    return 0;
  }
}

// Registra falha; retorna true se ESTA falha ativou o lock.
export async function recordFailedLogin(db: Db, ip: string): Promise<boolean> {
  try {
    const rows = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip));
    const fails = (rows[0]?.fails ?? 0) + 1;
    const now = new Date().toISOString();
    if (fails >= MAX_FAILS) {
      const lockedUntil = Date.now() + LOCK_MS;
      if (rows[0]) {
        await db
          .update(loginAttempts)
          .set({ fails, lockedUntil, updatedAt: now })
          .where(eq(loginAttempts.ip, ip));
      } else {
        await db.insert(loginAttempts).values({ ip, fails, lockedUntil, updatedAt: now });
      }
      return true;
    }
    if (rows[0]) {
      await db
        .update(loginAttempts)
        .set({ fails, lockedUntil: null, updatedAt: now })
        .where(eq(loginAttempts.ip, ip));
    } else {
      await db.insert(loginAttempts).values({ ip, fails, lockedUntil: null, updatedAt: now });
    }
    return false;
  } catch (err) {
    console.error("[brute-force] recordFailedLogin fail-open:", err);
    return false;
  }
}

// Login certo zera o contador do IP.
export async function recordSuccessfulLogin(db: Db, ip: string): Promise<void> {
  try {
    await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  } catch (err) {
    console.error("[brute-force] recordSuccessfulLogin fail-open:", err);
  }
}
