import type { Context } from "hono";
import { createDb } from "@meu-gpt/db";
import { conversationModel } from "../models/conversation.model.js";
import { messageModel } from "../models/message.model.js";
import { toConversationDTO, toMessageDTO } from "../views/json.view.js";
import type { Env } from "../env.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — conversations (histórico)

export async function list(c: C) {
  const db = createDb(c.env.DB);
  const rows = await conversationModel.list(db);
  return c.json(rows.map(toConversationDTO));
}

export async function messagesOf(c: C) {
  const db = createDb(c.env.DB);
  const rows = await messageModel.listByConversation(db, c.req.param("id") ?? "");
  return c.json(rows.map(toMessageDTO));
}

export async function create(c: C) {
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await conversationModel.create(db, {
    id,
    title: "Nova conversa",
    slot: "cheap",
    createdAt: new Date().toISOString(),
  });
  return c.json({ id });
}

export async function remove(c: C) {
  const db = createDb(c.env.DB);
  const id = c.req.param("id") ?? "";
  await messageModel.removeByConversation(db, id);
  await conversationModel.remove(db, id);
  return c.json({ ok: true });
}
