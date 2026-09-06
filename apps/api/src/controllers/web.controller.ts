import type { Context } from "hono";
import { webFetchRequestSchema, webSearchRequestSchema } from "@meu-gpt/shared";
import { fetchPage, searchWeb } from "../services/websearch.service.js";
import type { Env } from "../env.js";

type C = Context<{ Bindings: Env }>;

// CONTROLLER — web search e fetch de páginas (endpoints auxiliares e diretos)

export async function search(c: C) {
  const parsed = webSearchRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "body inválido", issues: parsed.error.issues.slice(0, 5) }, 400);
  }
  try {
    const res = await searchWeb(parsed.data.query, parsed.data.maxResults);
    return c.json(res);
  } catch (e) {
    return c.json(
      { error: "falha na busca web", reason: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
}

export async function fetchUrl(c: C) {
  const parsed = webFetchRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "body inválido", issues: parsed.error.issues.slice(0, 5) }, 400);
  }
  try {
    const res = await fetchPage(parsed.data.url);
    return c.json(res);
  } catch (e) {
    return c.json(
      { error: "falha ao buscar URL", reason: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
}
