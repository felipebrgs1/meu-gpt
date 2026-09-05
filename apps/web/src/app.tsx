import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// APP — fino: router gerado pelo plugin a partir de routes/ (file-based).
// Nova página = novo arquivo em routes/ (ex: routes/docs.tsx vira /docs).
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return <RouterProvider router={router} />;
}
