import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { Conversation } from "@meu-gpt/shared";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGate } from "../components/AuthGate";
import { ChatHeader } from "../components/chat/ChatHeader";
import { ChatMessages } from "../components/chat/ChatMessages";
import { ChatSidebar } from "../components/chat/ChatSidebar";
import { Composer } from "../components/chat/Composer";
import { IngestDialog } from "../components/chat/IngestDialog";
import {
  deleteConversation,
  getMessages,
  getToken,
  listConversations,
  listDocuments,
  logout,
  streamChat,
  type DocRecord,
  type UIMessage,
} from "../lib/api";
import { SLOTS, type Slot } from "../lib/slots";

// Página / — orquestra estado (auth, conversas, stream) e compõe os blocos do chat.
// Blocos visuais moram em components/chat/*; novas páginas entram em pages/ + router.tsx.
export function ChatPage() {
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
  const [loadingConv, setLoadingConv] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // URL é a fonte da verdade: /c/:id = conversa aberta, / = nova conversa.
  const navigate = useNavigate();
  const { conversationId: paramId } = useParams({ strict: false }) as { conversationId?: string };
  const activeIdRef = useRef<string | null>(null);

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
    activeIdRef.current = id;
    setActiveId(id);
    if (paramId !== id) void navigate({ to: "/c/$conversationId", params: { conversationId: id } });
    setLoadingConv(true);
    try {
      setLog(await getMessages(id));
    } catch {
      // Id fantasma (conversa apagada em outro lugar): volta pro / em vez de
      // prender a URL. Erro transitório mantém o estado e só limpa o log.
      const cs = await listConversations().catch(() => null);
      if (cs && !cs.some((c) => c.id === id)) {
        newChat();
        return;
      }
      setLog([]);
    } finally {
      setLoadingConv(false);
    }
  }

  function newChat() {
    activeIdRef.current = null;
    setActiveId(null);
    setLog([]);
    if (paramId) void navigate({ to: "/" });
  }

  // Deep link / voltar-avançar: sincroniza o estado com a URL.
  useEffect(() => {
    if (!authed) return;
    if (paramId) {
      if (activeIdRef.current !== paramId) void select(paramId);
    } else if (activeIdRef.current !== null) {
      activeIdRef.current = null;
      setActiveId(null);
      setLog([]);
    }
    // select/newChat via ref mirror: sem deps reativas além da URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, authed]);

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
    const fromId = activeIdRef.current;
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
          onDone: (full, citations, convId, model, usage) => {
            setLog((l) => {
              const c = [...l];
              c[c.length - 1] = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: full,
                citations,
                model,
                tokensIn: usage?.tokensIn ?? null,
                tokensOut: usage?.tokensOut ?? null,
                latencyMs: usage?.latencyMs ?? null,
                tps: usage?.tps ?? null,
                costUsd: usage?.costUsd ?? null,
                cachedTokens: usage?.cachedTokens ?? null,
              };
              return c;
            });
            setActiveId(convId);
            // Primeira msg: URL muda de / para /c/:id (deep link copiável).
            // fromId = conversa aberta no disparo; ref evita depender do state.
            activeIdRef.current = convId;
            if (fromId !== convId) void navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
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
        <ChatSidebar
          convs={convs}
          activeId={activeId}
          docsCount={docs.length}
          onNew={newChat}
          onSelect={select}
          onRemove={remove}
          onOpenIngest={() => setIngestOpen(true)}
          onLogout={() => {
            logout();
            setAuthed(false);
          }}
        />

        <SidebarInset className="flex h-screen max-h-screen min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <ChatHeader
            slot={slot}
            onSlot={setSlot}
            docs={docs}
            sourceIds={sourceIds}
            onSourceIds={setSourceIds}
            busy={busy}
            shareable={activeId !== null}
            linkCopied={copied === "link"}
            onCopyLink={() => copy("link", window.location.href)}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatMessages
              log={log}
              loading={loadingConv}
              activeSlot={activeSlot}
              onQuickPrompt={send}
              copied={copied}
              onCopy={copy}
            />
          </div>

          <Composer
            input={input}
            onInput={setInput}
            onSend={() => send()}
            busy={busy}
            activeSlot={activeSlot}
            sourceCount={sourceIds.length}
            onResetSources={() => setSourceIds([])}
            onOpenIngest={() => setIngestOpen(true)}
          />
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
