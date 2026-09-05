import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "../pages/ChatPage";

// PAGE / — nova página = novo arquivo aqui (ex: routes/docs.tsx -> /docs).
export const Route = createFileRoute("/")({ component: ChatPage });
