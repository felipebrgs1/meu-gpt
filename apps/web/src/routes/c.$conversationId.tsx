import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "../pages/ChatPage";

// PAGE /c/:id — deep link da conversa (mesmo ChatPage do /, com initial via URL).
// Permite copiar a URL, recarregar e debugar uma conversa específica.
export const Route = createFileRoute("/c/$conversationId")({ component: ChatPage });
