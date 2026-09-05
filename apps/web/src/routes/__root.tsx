import { createRootRoute, Outlet } from "@tanstack/react-router";

// ROOT — layout base de todas as rotas (páginas entram como filhas).
export const Route = createRootRoute({ component: () => <Outlet /> });
