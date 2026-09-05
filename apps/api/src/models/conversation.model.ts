import type { Db } from "@meu-gpt/db";
import { conversations, desc, eq } from "@meu-gpt/db";

export interface NewConversation {
  id: string;
  title: string;
  slot: string;
  createdAt: string;
}

// MODEL — acesso a dados de conversations (D1)
export const conversationModel = {
  async list(db: Db, limit = 50) {
    return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(limit);
  },

  async get(db: Db, id: string) {
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async create(db: Db, data: NewConversation) {
    await db
      .insert(conversations)
      .values({
        id: data.id,
        title: data.title,
        slot: data.slot,
        createdAt: data.createdAt,
        updatedAt: data.createdAt,
      })
      .onConflictDoNothing();
  },

  async touch(db: Db, id: string, updatedAt: string) {
    await db.update(conversations).set({ updatedAt }).where(eq(conversations.id, id));
  },

  async remove(db: Db, id: string) {
    await db.delete(conversations).where(eq(conversations.id, id));
  },
};

export type ConversationRow = Awaited<ReturnType<typeof conversationModel.list>>[number];
