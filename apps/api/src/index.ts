import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import { singleUserAuth } from "./middleware/auth.js";
import { routes } from "./routes/index.js";

// BOOTSTRAP — monta a aplicação (MVC: routes → controllers → services → models)

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());
app.use("/api/v1/*", singleUserAuth);
app.route("/", routes);

export default app;
