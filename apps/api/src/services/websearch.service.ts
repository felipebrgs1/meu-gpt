import type { WebFetchResponse, WebSearchResponse, WebSearchResult } from "@meu-gpt/shared";

// SERVICE — web search/fetch de custo zero (DuckDuckGo Lite, sem key nem vendor).
// Busca: GET no endpoint lite com User-Agent Lynx (modo texto leve, parse com HTMLRewriter do Workers).
// Fetch: HTMLRewriter extrai o texto cru da página (com limite de caracteres).

const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
const LYNX_UA = "Lynx/2.9.0dev.12 libwww-FM/2.14 SSL-MM/1.4.1 GNUTLS/3.8.3";
const HTTP_TIMEOUT_MS = 15_000;
const MAX_SEARCH_RESULTS = 5;
const MAX_FETCH_CHARS = 8_000;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,text/plain,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
};

// Os links do lite vêm como redirect ("//duckduckgo.com/l/?uddg=<url>&rut=...").
function resolveDdgHref(href: string): string {
  const abs = href.startsWith("//") ? `https:${href}` : href;
  try {
    const u = new URL(abs, "https://duckduckgo.com");
    const target = u.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : u.toString();
  } catch {
    return abs;
  }
}

function tidy(s: string): string {
  return s
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchWeb(
  query: string,
  maxResults: number = MAX_SEARCH_RESULTS,
): Promise<WebSearchResponse> {
  const t0 = Date.now();
  const url = `${DDG_LITE_URL}?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": LYNX_UA,
      Accept: "text/html",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new Error(`duckduckgo ${res.status}`);

  const results: WebSearchResult[] = [];
  let cur: Partial<WebSearchResult> = {};
  const push = () => {
    if (cur.title && cur.url && results.length < maxResults) {
      results.push({ title: tidy(cur.title), url: cur.url, snippet: tidy(cur.snippet ?? "") });
    }
    cur = {};
  };

  const parse = new HTMLRewriter()
    .on("a.result-link", {
      element(el) {
        push();
        cur.url = resolveDdgHref(el.getAttribute("href") ?? "");
      },
      text(t) {
        cur.title = (cur.title ?? "") + t.text;
      },
    })
    .on("td.result-snippet", {
      text(t) {
        cur.snippet = (cur.snippet ?? "") + t.text;
      },
    });
  await parse.transform(res).text();
  push();

  return { query, results, tookMs: Date.now() - t0 };
}

export async function fetchPage(url: string): Promise<WebFetchResponse> {
  const t0 = Date.now();
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error("URL inválida");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`protocolo não suportado: ${target.protocol}`);
  }

  const res = await fetch(target.toString(), {
    headers: FETCH_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  const plain =
    ct.includes("text/plain") || ct.includes("text/markdown") || ct.includes("application/json");
  if (plain) {
    const raw = await res.text();
    return {
      url: target.toString(),
      finalUrl: res.url,
      title: null,
      content: raw.slice(0, MAX_FETCH_CHARS),
      truncated: raw.length > MAX_FETCH_CHARS,
      tookMs: Date.now() - t0,
    };
  }
  if (!ct.includes("text/html") && !ct.includes("application/xhtml+xml")) {
    throw new Error(`content-type não suportado: ${ct || "desconhecido"}`);
  }

  let title = "";
  let skipDepth = 0;
  let text = "";
  let truncated = false;

  const rw = new HTMLRewriter()
    .on("title", {
      text(t) {
        title += t.text;
      },
    })
    .on("script, style, noscript, template, head, nav, footer, header, svg", {
      element(el) {
        skipDepth++;
        el.onEndTag(() => {
          skipDepth--;
        });
      },
    })
    .on("*", {
      text(t) {
        if (skipDepth > 0 || truncated) return;
        text += t.lastInTextNode ? `${t.text}\n` : t.text;
        if (text.length >= MAX_FETCH_CHARS) {
          truncated = true;
          text = text.slice(0, MAX_FETCH_CHARS);
        }
      },
    });
  await rw.transform(res).text();

  if (!text.trim() && !title.trim()) {
    throw new Error("não foi possível extrair texto da página");
  }

  const content = text
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return {
    url: target.toString(),
    finalUrl: res.url,
    title: tidy(title) || null,
    content,
    truncated,
    tookMs: Date.now() - t0,
  };
}

// Tool schemas no formato OpenAI (passados ao OpenRouter no /chat/completions)
export const WEB_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Busca na web (DuckDuckGo) e devolve títulos, URLs e resumos. Use para informações atuais, recentes ou que você não tem certeza (ex. changelogs, notícias, lançamentos).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Termo de busca" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_page",
      description:
        "Abre uma URL http(s) e devolve o texto do conteúdo da página. Use após web_search para ler detalhes de um link relevante.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL completa http(s)" } },
        required: ["url"],
      },
    },
  },
];
