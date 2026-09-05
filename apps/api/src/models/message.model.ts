import type { Env } from "../env.js";
import type { Db } from "@meu-gpt/db";
import { messages, eq } from "@meu-gpt/db";
import type { Citation } from "@meu-gpt/shared";

export interface NewMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  costUsd: number | null;
  citations: Citation[] | null;
  createdAt: string;
}

// MODEL — acesso a dados de messages (D1)
export const messageModel = {
  async listByConversation(db: Db, conversationId: string, limit = 200) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).limit(limit);
  },

  async insert(db: Db, data: NewMessage) {
    await db.insert(messages).values({
      id: data.id,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      model: data.model,
      tokensIn: data.tokensIn,
      tokensOut: data.tokensOut,
      latencyMs: data.latencyMs,
      costUsd: data.costUsd,
      citationsJson: data.citations ? JSON.stringify(data.citations) : null,
      createdAt: data.createdAt,
    });
  },

  async removeByConversation(db: Db, conversationId: string) {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
  },
};

export type MessageRow = Awaited<ReturnType<typeof messageModel.listByConversation>>[number];
