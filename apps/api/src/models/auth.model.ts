import type { Db } from "@meu-gpt/db";
import { authState, eq } from "@meu-gpt/db";

// MODEL — acesso a dados do estado de auth single-user (D1).
// Uma única linha id='single'. Ausência = senha default ainda ativa.
export const SINGLE_AUTH_ID = "single";

export const authModel = {
  async get(db: Db) {
    const rows = await db.select().from(authState).where(eq(authState.id, SINGLE_AUTH_ID)).limit(1);
    return rows[0] ?? null;
  },

  async upsert(db: Db, data: { passwordHash: string; passwordSalt: string; mustChange: number; updatedAt: string }) {
    const existing = await this.get(db);
    if (existing) {
      await db
        .update(authState)
        .set({ passwordHash: data.passwordHash, passwordSalt: data.passwordSalt, mustChange: data.mustChange, updatedAt: data.updatedAt })
        .where(eq(authState.id, SINGLE_AUTH_ID));
    } else {
      await db.insert(authState).values({ id: SINGLE_AUTH_ID, ...data });
    }
  },
};

export type AuthStateRow = NonNullable<Awaited<ReturnType<typeof authModel.get>>>;
