import { useEffect, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  CaretDown,
  Check,
  CodeBlock,
  Copy,
  Cpu,
  Database,
  DownloadSimple,
  DotsThreeVertical,
  FileDoc,
  FilePdf,
  FileText,
  Globe,
  Leaf,
  Lightning,
  Plus,
  SignOut,
  Sparkle,
  Terminal,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  deleteConversation,
  deleteDocument,
  documentRawUrl,
  getMessages,
  getToken,
  ingestDocument,
  listConversations,
  listDocuments,
  logout,
  mintDevToken,
  streamChat,
  uploadDocument,
  type DocRecord,
  type UIMessage,
} from "../lib/api";
import type { Citation, Conversation } from "@meu-gpt/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Message, MessageContent, MessageFooter, MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Slot = "fast" | "cheap" | "quality";

interface SlotOption {
  id: Slot;
  label: string;
  modelName: string;
  hint: string;
  icon: typeof Lightning;
}

const SLOTS: SlotOption[] = [
  { id: "fast", label: "Fast", modelName: "MiniMax-M3", hint: "Rápido e gratuito", icon: Lightning },
  { id: "cheap", label: "Cheap", modelName: "GLM-5.3-flash", hint: "Custo-benefício", icon: Leaf },
  { id: "quality", label: "Quality", modelName: "GLM-5.3-flash", hint: "Alta precisão", icon: Sparkle },
];

interface QuickPrompt {
  icon: typeof Sparkle;
  category: string;
  title: string;
  prompt: string;
}

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    icon: Database,
    category: "RAG & Vetores",
    title: "Como funciona a busca vetorial?",
    prompt: "Explique como o Cloudflare Vectorize (1024 dimensões + métrica cosine) funciona junto com o Perplexity Embed V1 0.6B neste projeto.",
  },
  {
    icon: BookOpen,
    category: "Documentação",
    title: "Exemplo de RAG com citações",
    prompt: "Me dê um exemplo prático de como o prompt de RAG formata as respostas citando fontes com [doc:chunk] e como o frontend exibe as citações.",
  },
  {
    icon: Terminal,
    category: "Arquitetura",
    title: "Stack Cloudflare Workers + D1",
    prompt: "Explique a arquitetura deste projeto: HonoJS na edge, Drizzle ORM sobre D1 SQLite, R2 para texto e SSE para streaming em tempo real.",
  },
  {
    icon: CodeBlock,
    category: "Código",
    title: "Gerar endpoint de streaming",
    prompt: "Escreva um exemplo em TypeScript com HonoJS implementando um ReadableStream com Server-Sent Events (SSE) compatível com Cloudflare Workers.",
  },
];

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

function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function enter() {
    if (!secret.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      await mintDevToken(secret.trim());
      onAuth();
    } catch {
      setErr("setupSecret inválido. Confira o JWT_SECRET do Worker.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border/60 shadow-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              <Sparkle className="size-5" />
            </div>
            <CardTitle className="text-xl">meu-gpt</CardTitle>
          </div>
          <CardDescription>Cole seu setupSecret (JWT_SECRET) para entrar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="setup">setupSecret</Label>
            <Input
              id="setup"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enter()}
              placeholder="Cole seu JWT_SECRET..."
              className="mt-1"
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </CardContent>
        <CardFooter>
          <Button onClick={enter} disabled={busy} className="w-full gap-2">
            {busy ? (
              <>
                <Spinner /> Entrando…
              </>
            ) : (
              <>Entrar no meu-gpt</>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export function Chat() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [log, setLog] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [slot, setSlot] = useState<Slot>("cheap");
  // RAG sempre ativo. Seletor de fontes: vazio = todos os documentos.
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const activeSlot = SLOTS.find((s) => s.id === slot) ?? SLOTS[1];

  async function refreshConvs() {
    try {
      setConvs(await listConversations());
    } catch {
      /* token expirado etc. */
    }
  }

  useEffect(() => {
    if (authed) {
      void refreshConvs();
      listDocuments().then(setDocs).catch(() => {});
    }
  }, [authed]);

  async function select(id: string) {
    setActiveId(id);
    setLog(await getMessages(id).catch(() => []));
  }

  function newChat() {
    setActiveId(null);
    setLog([]);
  }

  async function remove(id: string) {
    await deleteConversation(id).catch(() => {});
    if (activeId === id) newChat();
    void refreshConvs();
  }

  async function send(prefill?: string) {
    const text = (prefill ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    const userMsg: UIMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const history = [...log, userMsg];
    setLog([...history, { id: "streaming", role: "assistant", content: "" }]);
    setInput("");
    let acc = "";
    const fail = (msg: string) => {
      setLog((l) => {
        const c = [...l];
        c[c.length - 1] = { ...c[c.length - 1], id: crypto.randomUUID(), content: acc || `erro: ${msg}` };
        return c;
      });
      setBusy(false);
    };
    try {
      await streamChat(
        {
          slot,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          documentIds: sourceIds.length ? sourceIds : undefined,
          conversationId: activeId ?? undefined,
        },
        {
          onToken: (t) => {
            acc += t;
            setLog((l) => {
              const c = [...l];
              c[c.length - 1] = { ...c[c.length - 1], content: acc };
              return c;
            });
          },
          onDone: (full, citations, convId, model) => {
            setLog((l) => {
              const c = [...l];
              c[c.length - 1] = { id: crypto.randomUUID(), role: "assistant", content: full, citations, model };
              return c;
            });
            setActiveId(convId);
            setBusy(false);
            void refreshConvs();
          },
          onError: (m) => fail(m),
        },
      );
    } catch (e) {
      // fetch rejeitou (API fora do ar, rede, CORS): antes travava o busy para sempre
      fail(e instanceof Error ? e.message : "falha de rede");
    }
  }

  function copy(id: string, text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }

  if (!authed) return <AuthGate onAuth={() => setAuthed(true)} />;

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen className="dark h-screen w-screen overflow-hidden">
        <Sidebar className="border-r border-border/50 h-full overflow-hidden">
          <SidebarHeader className="p-3">
            <Button onClick={newChat} className="w-full justify-start gap-2 shadow-sm font-medium">
              <Plus className="size-4" /> Nova conversa
            </Button>
          </SidebarHeader>
          <SidebarContent className="overflow-y-auto">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs tracking-wider uppercase text-muted-foreground/70">
                Histórico
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {convs.map((c) => (
                    <SidebarMenuItem key={c.id} className="group/menu-item relative flex items-center min-w-0">
                      <SidebarMenuButton
                        isActive={activeId === c.id}
                        onClick={() => select(c.id)}
                        tooltip={c.title}
                        className="min-w-0 flex-1 pr-7"
                      >
                        <span className="block w-full min-w-0 truncate whitespace-nowrap text-left text-xs font-normal">
                          {c.title}
                        </span>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <SidebarMenuAction showOnHover className="size-6 text-muted-foreground hover:text-foreground">
                              <DotsThreeVertical className="size-3.5" />
                              <span className="sr-only">Opções</span>
                            </SidebarMenuAction>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem variant="destructive" onSelect={() => remove(c.id)}>
                            <Trash className="size-3.5" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                  {convs.length === 0 && (
                    <p className="px-3 py-6 text-xs text-muted-foreground/60 text-center">Nenhuma conversa gravada.</p>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-3 space-y-2">
            <Button variant="outline" onClick={() => setIngestOpen(true)} className="w-full justify-start gap-2 text-xs">
              <Database className="size-4 text-emerald-400" /> Base de conhecimento
            </Button>
            <SidebarSeparator />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                setAuthed(false);
              }}
              className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <SignOut className="size-4" /> Sair
            </Button>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex h-screen max-h-screen min-h-0 flex-1 flex-col overflow-hidden bg-background">
          {/* Top Header */}
          <header className="flex h-13 shrink-0 items-center justify-between border-b border-border/50 px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <ToggleGroup
                value={[slot]}
                onValueChange={(v) => {
                  const last = v[v.length - 1];
                  if (last) setSlot(last as Slot);
                }}
                variant="outline"
                size="sm"
                className="bg-muted/40 p-0.5 rounded-lg border-border/50"
              >
                {SLOTS.map((s) => (
                  <ToggleGroupItem key={s.id} value={s.id} aria-label={s.hint} className="gap-1.5 text-xs px-2.5 py-1">
                    <s.icon className="size-3.5" />
                    <span className="font-medium">{s.label}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex items-center gap-3">
              {/* Seletor de fontes RAG — sempre ativo */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 gap-1.5 rounded-full border px-3 text-xs ${
                        sourceIds.length ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-medium" : "border-border/60 bg-muted/30 text-muted-foreground"
                      }`}
                    />
                  }
                >
                  <Database className="size-3.5" />
                  <span>{sourceIds.length ? `${sourceIds.length} fonte${sourceIds.length > 1 ? "s" : ""}` : `RAG · ${docs.length} doc${docs.length === 1 ? "" : "s"}`}</span>
                  <CaretDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Fontes do RAG (sempre ativo)
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => setSourceIds([])}
                      className={sourceIds.length === 0 ? "bg-accent" : ""}
                    >
                      <Globe className="size-3.5" /> Todos os documentos
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {docs.map((d) => (
                    <DropdownMenuCheckboxItem
                      key={d.id}
                      checked={sourceIds.includes(d.id)}
                      onCheckedChange={(checked) => {
                        setSourceIds((ids) => (checked ? [...ids, d.id] : ids.filter((i) => i !== d.id)));
                      }}
                      onSelect={(e) => e.preventDefault()}
                      className="max-w-full"
                    >
                      <span className="truncate">{d.title}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  {docs.length === 0 && (
                    <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum documento indexado.</p>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {busy && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                  <Spinner className="size-3.5" />
                  <span>respondendo…</span>
                </div>
              )}
            </div>
          </header>

          {/* Main Content Area */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {log.length === 0 ? (
              /* HOME / HERO STATE - Perfectly centered, zero unnecessary scroll */
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 md:p-6 overflow-y-auto">
                <div className="w-full max-w-2xl flex flex-col items-center text-center space-y-5 animate-in fade-in-50 duration-300">
                  {/* Hero Icon */}
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
                    <Sparkle className="size-6" />
                  </div>

                  {/* Heading */}
                  <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                      Como posso ajudar hoje?
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                      RAG nativo na edge · Vectorize 1024d Cosine · Modelos OpenRouter
                    </p>
                  </div>

                  {/* Status Chips without colon splits */}
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

                  {/* Quick Prompts Grid */}
                  <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-left">
                    {QUICK_PROMPTS.map((q) => (
                      <Card
                        key={q.title}
                        size="sm"
                        onClick={() => send(q.prompt)}
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
            ) : (
              /* CHAT MESSAGES */
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
                                        onClick={() => copy(m.id, m.content)}
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
            )}
          </div>

          {/* Prompt Composer (Floating ChatGPT-style) */}
          <div className="shrink-0 border-t border-border/40 p-4 bg-background/80 backdrop-blur-sm">
            <div className="mx-auto max-w-3xl">
              <div className="relative flex flex-col rounded-2xl border border-border/70 bg-card p-3 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder={`Pergunte ao ${activeSlot.label} (${activeSlot.modelName})…`}
                  className="min-h-[50px] resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground/60"
                />

                {/* Composer Bottom Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-border/30 mt-1">
                  <div className="flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIngestOpen(true)}
                            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                          />
                        }
                      >
                        <UploadSimple className="size-3.5" />
                        <span>Adicionar doc</span>
                      </TooltipTrigger>
                      <TooltipContent>Indexar texto no Vectorize</TooltipContent>
                    </Tooltip>

                    <Button
                      variant={sourceIds.length ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setSourceIds([])}
                      className={`h-7 gap-1 px-2 text-xs transition-colors ${
                        sourceIds.length ? "bg-emerald-500/15 text-emerald-400 font-medium" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Database className="size-3.5" />
                      <span>RAG · {sourceIds.length ? `${sourceIds.length} fonte(s)` : "todos"}</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
                      <Kbd>Enter</Kbd> envia · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> quebra
                    </span>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon-sm"
                            onClick={() => send()}
                            disabled={busy || !input.trim()}
                            className="size-8 rounded-lg shrink-0 shadow-xs transition-all disabled:opacity-30"
                          />
                        }
                      >
                        <ArrowUp className="size-4" weight="bold" />
                      </TooltipTrigger>
                      <TooltipContent>Enviar mensagem</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
                meu-gpt pode cometer erros. Verifique fontes e citações via RAG.
              </p>
            </div>
          </div>
        </SidebarInset>

        <IngestDialog
          open={ingestOpen}
          onOpenChange={setIngestOpen}
          onChanged={() => listDocuments().then(setDocs).catch(() => {})}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}


const DOC_ACCEPT = ".pdf,.docx,.txt,.md,.csv,.json";
const MAX_MB = 10;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function docIcon(mime: string, filename: string) {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf") || mime.includes("pdf")) return <FilePdf className="size-4 text-red-400" />;
  if (f.endsWith(".docx") || mime.includes("wordprocessingml")) return <FileDoc className="size-4 text-sky-400" />;
  return <FileText className="size-4 text-zinc-400" />;
}

function IngestDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [docs, setDocs] = useState<DocRecord[]>([]);

  async function refreshDocs() {
    setDocs(await listDocuments().catch(() => []));
  }

  useEffect(() => {
    if (open) void refreshDocs();
  }, [open]);

  async function submitFile() {
    if (!file || busy) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setResult(`Erro: arquivo muito grande (${fmtBytes(file.size)}). Máximo ${MAX_MB}MB.`);
      return;
    }
    setBusy(true);
    setResult("");
    try {
      const r = await uploadDocument(file, title);
      setResult(`OK: "${r.title}" indexado (${r.chunkCount} chunks${r.pageCount ? `, ${r.pageCount} páginas` : ""}). Original preservado no R2.`);
      setFile(null);
      setTitle("");
      (document.getElementById("doc-file") as HTMLInputElement | null) && ((document.getElementById("doc-file") as HTMLInputElement).value = "");
      void refreshDocs();
      onChanged?.();
    } catch (e) {
      setResult(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitText() {
    if (!title.trim() || !text.trim() || busy) return;
    setBusy(true);
    setResult("");
    try {
      const r = await ingestDocument(title.trim(), text);
      setResult(`OK: ${r.chunkCount} chunks indexados. Original preservado no R2.`);
      setTitle("");
      setText("");
      void refreshDocs();
      onChanged?.();
    } catch (e) {
      setResult(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(id: string) {
    setBusy(true);
    try {
      await deleteDocument(id);
      void refreshDocs();
      onChanged?.();
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
              <Database className="size-4" />
            </div>
            <DialogTitle>Base de conhecimento (RAG)</DialogTitle>
          </div>
          <DialogDescription>
            Suba PDF, DOCX ou TXT/MD. O arquivo original é preservado no R2 e o texto vai para o Vectorize (1024d cosine).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file">
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1 gap-1.5">
              <UploadSimple className="size-3.5" /> Arquivo
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-1 gap-1.5">
              <FileText className="size-3.5" /> Colar texto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3 pt-2">
            <label
              htmlFor="doc-file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
            >
              <UploadSimple className="size-6 text-muted-foreground" />
              {file ? (
                <span className="flex items-center gap-2 text-sm">
                  {docIcon(file.type || "", file.name)}
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({fmtBytes(file.size)})</span>
                </span>
              ) : (
                <>
                  <span className="text-sm font-medium">Arraste um arquivo ou clique para escolher</span>
                  <span className="text-[11px] text-muted-foreground">PDF, DOCX, TXT, MD, CSV, JSON · até {MAX_MB}MB</span>
                </>
              )}
              <input
                id="doc-file"
                type="file"
                accept={DOC_ACCEPT}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title-file" className="text-xs font-medium">Título (opcional — usa o nome do arquivo)</Label>
              <Input id="doc-title-file" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Manual interno, Aula 3..." />
            </div>
            <Button onClick={submitFile} disabled={busy || !file} className="w-full gap-2">
              {busy ? (
                <>
                  <Spinner /> Extraindo texto e indexando…
                </>
              ) : (
                <>
                  <UploadSimple className="size-4" /> Indexar arquivo
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="text" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title" className="text-xs font-medium">Título do documento</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Resumo do Projeto, Artigo sobre RAG..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-text" className="text-xs font-medium">Conteúdo do texto</Label>
              <Textarea id="doc-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Cole o texto aqui…" className="resize-none" />
            </div>
            <Button onClick={submitText} disabled={busy || !title.trim() || !text.trim()} className="w-full gap-2">
              {busy ? (
                <>
                  <Spinner /> Indexando…
                </>
              ) : (
                <>
                  <UploadSimple className="size-4" /> Indexar texto
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {result && (
          <div className={`p-2.5 rounded-lg text-xs ${result.startsWith("OK") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-destructive/10 text-destructive"}`}>
            {result}
          </div>
        )}

        {/* Documentos indexados */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Documentos indexados ({docs.length})
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {docs.map((d) => (
              <div key={d.id} className="group flex items-center gap-2 rounded-lg border border-border/40 bg-card/50 px-2.5 py-2">
                {docIcon(d.mimeType, d.originalFilename)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.chunkCount} chunks{d.pageCount ? ` · ${d.pageCount} pág` : ""} · {fmtBytes(d.fileSize)}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger render={
                    <a
                      href={documentRawUrl(d.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <DownloadSimple className="size-3.5" />
                    </a>
                  } />
                  <TooltipContent>Baixar original (R2)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={() => removeDoc(d.id)}
                      disabled={busy}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash className="size-3.5" />
                    </button>
                  } />
                  <TooltipContent>Excluir do RAG + R2</TooltipContent>
                </Tooltip>
              </div>
            ))}
            {docs.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground/60">Nenhum documento indexado ainda.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
