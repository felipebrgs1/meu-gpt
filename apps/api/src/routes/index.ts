import { Hono } from "hono";
import type { Env } from "../env.js";
import { health, login } from "../controllers/auth.controller.js";
import * as conversations from "../controllers/conversations.controller.js";
import * as documents from "../controllers/documents.controller.js";
import { chat } from "../controllers/chat.controller.js";

// ROUTES — mapeia HTTP → controller (sem lógica de negócio aqui)

export const routes = new Hono<{ Bindings: Env }>();

// público
routes.get("/api/v1/health", health);
routes.post("/api/v1/auth/login", login);

// protegido
routes.post("/api/v1/conversations", conversations.create);
routes.get("/api/v1/conversations", conversations.list);
routes.get("/api/v1/conversations/:id/messages", conversations.messagesOf);
routes.delete("/api/v1/conversations/:id", conversations.remove);

routes.post("/api/v1/documents/ingest", documents.ingestUpload);
routes.post("/api/v1/documents/ingest-text", documents.ingestPaste);
routes.get("/api/v1/documents", documents.list);
routes.get("/api/v1/documents/:id/raw", documents.raw);
routes.delete("/api/v1/documents/:id", documents.remove);

routes.post("/api/v1/chat", chat);
