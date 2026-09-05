import { useState } from "react";
import { CaretDown, Check, Copy, Cpu, Database, FileText, Globe, Sparkle } from "@phosphor-icons/react";
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
  busy: boolean;
  activeSlot: SlotOption;
  onQuickPrompt: (prompt: string) => void;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
}

// Render mínimo: blocos ```code``` viram <pre>, resto é texto com quebras.
function renderContent(content: string, msgKey: string) {
  const parts = content.split(/```(\w*)\n?([\s\S]*?)```/g);
  if (parts.length === 1) return <p className="whitespace-pre-wrap break-words">{content}</p>;
  const out = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) {
      out.push(
        <p key={`${msgKey}-t${i}`} className="whitespace-pre-wrap break-words">
          {parts[i]}
        </p>,
      );
    }
    if (i + 2 < parts.length && (parts[i + 1] !== undefined || parts[i + 2])) {
      out.push(
        <pre key={`${msgKey}-c${i}`} className="my-2 overflow-x-auto rounded-lg bg-black/60 p-3 text-[13px] leading-relaxed border border-border/40">
          {parts[i + 1] ? <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">{parts[i + 1]}</span> : null}
          <code>{parts[i + 2]}</code>
        </pre>,
      );
    }
  }
  return <>{out}</>;
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

// Área central: hero (log vazio) ou lista de mensagens com scroll.
export function ChatMessages({ log, busy, activeSlot, onQuickPrompt, copied, onCopy }: Props) {
  if (log.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 md:p-6 overflow-y-auto">
        <div className="w-full max-w-2xl flex flex-col items-center text-center space-y-5 animate-in fade-in-50 duration-300">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
            <Sparkle className="size-6" />
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
                          {renderContent(m.content || (busy && m.id === "streaming" ? "▍" : ""), m.id)}
                        </BubbleContent>
                      </Bubble>
                      {m.role === "assistant" && (m.model || m.content) && (
                        <MessageFooter className="gap-2 mt-1 px-1">
                          {m.model && (
                            <Badge variant="outline" className="text-[11px] font-mono opacity-70">
                              {m.model}
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
