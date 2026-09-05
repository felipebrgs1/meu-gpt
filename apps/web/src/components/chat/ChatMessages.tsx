import { memo, useEffect, useId, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { CaretDown, Check, Copy, Cpu, CurrencyDollar, Database, FileText, Globe, Lightning, Sparkle, Stack } from "@phosphor-icons/react";
import { OracleIcon } from "@/components/OracleIcon";
import type { Citation } from "@meu-gpt/shared";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Message, MessageContent, MessageFooter, MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { UIMessage } from "../../lib/api";
import { QUICK_PROMPTS, type SlotOption } from "../../lib/slots";

interface Props {
  log: UIMessage[];
  loading: boolean;
  activeSlot: SlotOption;
  onQuickPrompt: (prompt: string) => void;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
}

mermaid.initialize({ startOnLoad: false, theme: "dark" });

// Bloco ```mermaid vira diagrama SVG. Erro de sintaxe ou stream parcial:
// cai para o visual de código com aviso (nunca quebra a mensagem).
function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const rawId = useId();
  useEffect(() => {
    let alive = true;
    setSvg(null);
    setFailed(false);
    mermaid
      .render(`mmd-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`, code)
      .then(({ svg }) => {
        if (alive) setSvg(svg);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [code, rawId]);
  if (failed) {
    return (
      <div>
        <pre className="overflow-x-auto rounded-lg border border-border/40 bg-black/60 p-3 text-[13px] leading-relaxed">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">mermaid</span>
          <code>{code}</code>
        </pre>
        <p className="mt-1 text-[11px] text-muted-foreground">não foi possível renderizar o diagrama.</p>
      </div>
    );
  }
  if (!svg) return <p className="text-muted-foreground">renderizando diagrama…</p>;
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border/40 bg-muted/20 p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Render markdown (GFM: tabelas, listas, autolinks, ```code```).
// Sem HTML cru de propósito: react-markdown ignora tags sem rehype-raw (anti-XSS).
// Bloco de código mantém o visual atual (<pre> escuro + label da linguagem).
function CodeSpan({
  className,
  children,
  renderDiagram,
}: {
  className?: string;
  children?: ReactNode;
  renderDiagram: boolean;
}) {
  const text = String(children ?? "").replace(/\n$/, "");
  const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
  // Diagrama só com bloco final (fora do streaming): parcial vira código.
  if (lang === "mermaid" && renderDiagram && text.trim()) return <Mermaid code={text} />;
  if (!lang && !text.includes("\n")) {
    return <code className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[12.5px]">{children}</code>;
  }
  return (
    <pre className="overflow-x-auto rounded-lg border border-border/40 bg-black/60 p-3 text-[13px] leading-relaxed">
      {lang ? <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">{lang}</span> : null}
      <code>{text}</code>
    </pre>
  );
}

// Thinking real: 3 dots saltando + label (em vez do cursor ▍ solitário).
// Aparece só na fase sem tokens; com tokens, o cursor pulsa após o texto.
function Thinking() {
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="pensando">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-current"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      pensando…
    </span>
  );
}

function renderContent(content: string, msgKey: string, isStreaming: boolean) {
  if (!content && isStreaming) return <Thinking key={msgKey} />;
  return (
    <div key={msgKey} className="space-y-2 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          h1: ({ children }) => <h1 className="text-lg font-semibold tracking-tight">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 text-muted-foreground">{children}</blockquote>
          ),
          hr: () => <hr className="border-border/40" />,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border/50 bg-muted/40 px-2.5 py-1.5 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-border/30 px-2.5 py-1.5 align-top last:border-b-0">{children}</td>,
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => (
            <CodeSpan className={className} renderDiagram={!isStreaming}>
              {children}
            </CodeSpan>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && content ? (
        <span className="ml-1 inline-block animate-pulse text-primary" aria-hidden>
          ▍
        </span>
      ) : null}
    </div>
  );
}

// Corpo memoizado: msg concluída (props imutáveis) renderiza UMA vez.
// Sem isso, cada token do stream re-renderizava a conversa inteira.
const MessageBody = memo(function MessageBody({
  content,
  msgKey,
  isStreaming,
}: {
  content: string;
  msgKey: string;
  isStreaming: boolean;
}) {
  return renderContent(content, msgKey, isStreaming);
});

// Formatação PT-BR dos badges de usage (tps, custo, cache hit).
function formatTps(tps: number): string {
  return `${tps.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t/s`;
}
function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toPrecision(2)}`;
}
function formatCache(n: number): string {
  if (n >= 1000) return `cache ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return `cache ${n}`;
}

function Citations({ items }: { items: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger render={<Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground" />}>
        <FileText className="size-3.5" />
        Fontes ({items.length}) <CaretDown className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5">
        <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-xs space-y-1">
          {items.map((c) => (
            <div key={c.chunkId} className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="truncate font-medium text-foreground">[{c.title}]</span>
              <span className="shrink-0 font-mono text-[11px] opacity-70">score {c.score.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Área central: skeleton (carregando deep link), hero (log vazio) ou mensagens.
export function ChatMessages({ log, loading, activeSlot, onQuickPrompt, copied, onCopy }: Props) {
  if (log.length === 0) {
    // Deep link / recarregamento: esqueletos em vez do herói piscando.
    if (loading) {
      return (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-5" aria-label="carregando conversa">
            <div className="ml-auto h-10 w-2/3 animate-pulse rounded-2xl bg-muted/50" />
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-11/12 animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
            </div>
            <div className="ml-auto h-8 w-1/2 animate-pulse rounded-2xl bg-muted/50" />
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-muted/50" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 md:p-6 overflow-y-auto">
        <div className="w-full max-w-2xl flex flex-col items-center text-center space-y-5 animate-in fade-in-50 duration-300">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
            <OracleIcon className="size-6" />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Como posso ajudar hoje?
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
              RAG nativo na edge · Vectorize 1024d Cosine · Modelos OpenRouter
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs bg-muted/40 font-normal whitespace-nowrap">
              <Cpu className="size-3.5 text-primary" />
              <span>{activeSlot.modelName} ({activeSlot.label})</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs bg-muted/40 font-normal whitespace-nowrap">
              <Database className="size-3.5 text-emerald-400" />
              <span>Vectorize 1024d</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs bg-muted/40 font-normal whitespace-nowrap">
              <Globe className="size-3.5 text-sky-400" />
              <span>Cloudflare Workers</span>
            </Badge>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-left">
            {QUICK_PROMPTS.map((q) => (
              <Card
                key={q.title}
                size="sm"
                onClick={() => onQuickPrompt(q.prompt)}
                className="group cursor-pointer border-border/50 bg-card/60 hover:border-primary/50 hover:bg-muted/30 transition-all p-3 shadow-none"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {q.category}
                  </span>
                  <q.icon className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {q.title}
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                  {q.prompt}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <MessageScrollerProvider>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            <MessageGroup className="space-y-5">
              {log.map((m) => (
                <MessageScrollerItem key={m.id}>
                  <Message align={m.role === "user" ? "end" : "start"} className="gap-3">
                    <MessageContent>
                      <Bubble
                        variant={m.role === "user" ? "default" : "secondary"}
                        align={m.role === "user" ? "end" : "start"}
                        className="max-w-[85%] rounded-2xl shadow-xs"
                      >
                        <BubbleContent className="text-sm leading-relaxed p-3.5">
                          {<MessageBody content={m.content} msgKey={m.id} isStreaming={m.id === "streaming"} />}
                        </BubbleContent>
                      </Bubble>
                      {m.role === "assistant" && (m.model || m.content) && (
                        <MessageFooter className="gap-2 mt-1 px-1">
                          {m.model && (
                            <Badge variant="outline" className="text-[11px] font-mono opacity-70">
                              {m.model}
                            </Badge>
                          )}
                          {m.tps != null && (
                            <Badge
                              variant="outline"
                              className="text-[11px] font-mono opacity-70"
                              title={m.tokensIn != null || m.tokensOut != null ? `tokens in ${m.tokensIn ?? "?"} · out ${m.tokensOut ?? "?"}` : undefined}
                            >
                              <Lightning className="size-3 text-amber-400" />
                              {formatTps(m.tps)}
                            </Badge>
                          )}
                          {m.costUsd != null && (
                            <Badge variant="outline" className="text-[11px] font-mono opacity-70" title="custo da resposta (OpenRouter)">
                              <CurrencyDollar className="size-3 text-emerald-400" />
                              {formatCost(m.costUsd)}
                            </Badge>
                          )}
                          {m.cachedTokens != null && m.cachedTokens > 0 && (
                            <Badge variant="outline" className="text-[11px] font-mono opacity-70" title={`${m.cachedTokens} tokens do prompt reaproveitados do cache`}>
                              <Stack className="size-3 text-sky-400" />
                              {formatCache(m.cachedTokens)}
                            </Badge>
                          )}
                          {m.content && m.id !== "streaming" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => onCopy(m.id, m.content)}
                            >
                              {copied === m.id ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                              {copied === m.id ? "copiado" : "copiar"}
                            </Button>
                          )}
                        </MessageFooter>
                      )}
                      {m.citations && m.citations.length > 0 && <Citations items={m.citations} />}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
            </MessageGroup>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
