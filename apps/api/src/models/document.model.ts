import type { Env } from "../env.js";
import type { Db } from "@meu-gpt/db";
import { documents, desc, eq } from "@meu-gpt/db";

export interface NewDocument {
  id: string;
  title: string;
  r2Key: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  pageCount: number | null;
  chunkCount: number;
  createdAt: string;
}

// MODEL — acesso a dados de documents (D1)
export const documentModel = {
  async list(db: Db, limit = 100) {
    return db.select().from(documents).orderBy(desc(documents.createdAt)).limit(limit);
  },

  async get(db: Db, id: string) {
    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async insert(db: Db, data: NewDocument) {
    await db.insert(documents).values(data);
  },

  async remove(db: Db, id: string) {
    await db.delete(documents).where(eq(documents.id, id));
  },
};

export type DocumentRow = Awaited<ReturnType<typeof documentModel.list>>[number];
