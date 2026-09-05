import { useEffect, useRef, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Conversation } from "@meu-gpt/shared";
import { AuthGate } from "../components/AuthGate";
import { ChatMessages } from "../components/ChatMessages";
import { Composer } from "../components/Composer";
import { ConversationsSheet } from "../components/ConversationsSheet";
import { IngestSheet } from "../components/IngestSheet";
import { SlotPicker } from "../components/SlotPicker";
import { SourcesSheet } from "../components/SourcesSheet";
import {
  deleteConversation,
  getMessages,
  hasToken,
  listConversations,
  listDocuments,
  logout,
  streamChat,
  type DocRecord,
  type UIMessage,
} from "../lib/api";
import { SLOTS, type Slot } from "../lib/slots";
import { colors, spacing } from "../theme";

// Chat screen — same state machine as web ChatPage (auth, conversations,
// stream, sources, ingest). Navigation replaces URL deep links: the active
// conversation lives in state, no /c/:id route needed on native.
export function ChatScreen() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [log, setLog] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [slot, setSlot] = useState<Slot>("cheap");
  // RAG always on. Source filter: empty = all documents.
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [sheets, setSheets] = useState({
    convs: false,
    slot: false,
    ingest: false,
    sources: false,
  });
  const activeIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList<UIMessage> | null>(null);

  const activeSlot = SLOTS.find((s) => s.id === slot) ?? SLOTS[1];
  const open = (k: keyof typeof sheets) => setSheets((s) => ({ ...s, [k]: true }));
  const close = (k: keyof typeof sheets) => setSheets((s) => ({ ...s, [k]: false }));

  // Token invalidado (ex: senha trocada em outra sessão): limpa e volta ao login.
  async function forceLogout() {
    await logout().catch(() => {});
    newChat();
    setAuthed(false);
  }

  async function refreshConvs() {
    try {
      setConvs(await listConversations());
    } catch (e) {
      if (e instanceof Error && e.message.includes("unauthorized")) void forceLogout();
    }
  }

  async function refreshDocs() {
    try {
      setDocs(await listDocuments());
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    // Callback aninhado (não referência direta): o setState roda após o
    // await, sem render em cascata — react/set-state-in-effect.
    void hasToken().then((t) => setAuthed(t));
  }, []);

  useEffect(() => {
    if (!authed) return;
    // Fetch com setState nos handlers do .then (fora do corpo síncrono do
    // effect — react/set-state-in-effect). Erro mantém o estado atual.
    listConversations().then(
      (convs) => setConvs(convs),
      () => {
        /* token expirado etc.: mantém a lista atual */
      },
    );
    listDocuments().then(
      (docs) => setDocs(docs),
      () => {
        /* noop */
      },
    );
  }, [authed]);

  async function select(id: string) {
    activeIdRef.current = id;
    setActiveId(id);
    close("convs");
    try {
      setLog(await getMessages(id));
    } catch (e) {
      if (e instanceof Error && e.message.includes("unauthorized")) {
        void forceLogout();
        return;
      }
      const cs = await listConversations().catch(() => null);
      if (cs && !cs.some((c) => c.id === id)) {
        newChat();
        return;
      }
      setLog([]);
    }
  }

  function newChat() {
    activeIdRef.current = null;
    setActiveId(null);
    setLog([]);
    close("convs");
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
    const userMsg: UIMessage = { id: `${Date.now()}-user`, role: "user", content: text };
    const history = [...log, userMsg];
    const fromId = activeIdRef.current;
    setLog([...history, { id: "streaming", role: "assistant", content: "" }]);
    setInput("");
    let acc = "";
    const fail = (msg: string) => {
      // Chat com token invalidado: volta ao login em vez de mostrar "erro:".
      if (msg.includes("unauthorized")) {
        setBusy(false);
        void forceLogout();
        return;
      }
      setLog((l) => {
        const c = [...l];
        c[c.length - 1] = {
          ...c[c.length - 1],
          id: `${Date.now()}-err`,
          content: acc || `erro: ${msg}`,
        };
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
                id: `${Date.now()}-asst`,
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
            activeIdRef.current = convId;
            void fromId; // first message adopts the server conversation id (web navigates / -> /c/:id)
            setBusy(false);
            void refreshConvs();
          },
          onError: (m) => fail(m),
        },
      );
    } catch (e) {
      fail(e instanceof Error ? e.message : "falha de rede");
    }
  }

  if (authed === null) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>carregando…</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!authed) return <AuthGate onAuth={() => setAuthed(true)} />;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => open("convs")} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>☰</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => open("slot")} style={styles.headerTitle}>
          <View style={styles.titleRow}>
            <Image source={require("../../assets/favicon.png")} style={styles.headerIcon} />
            <Text style={styles.title}>meu-gpt</Text>
          </View>
          <Text style={styles.slot}>
            {activeSlot.label} · {activeSlot.modelName} ▾
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => open("ingest")} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <ChatMessages
          log={log}
          busy={busy}
          activeSlot={activeSlot}
          onQuickPrompt={send}
          listRef={listRef}
        />
      </View>

      <Composer
        input={input}
        onInput={setInput}
        onSend={() => send()}
        busy={busy}
        activeSlot={activeSlot}
        sourceCount={sourceIds.length}
        onOpenSources={() => open("sources")}
        onOpenIngest={() => open("ingest")}
      />

      <ConversationsSheet
        open={sheets.convs}
        convs={convs}
        activeId={activeId}
        docsCount={docs.length}
        onClose={() => close("convs")}
        onNew={newChat}
        onSelect={select}
        onRemove={remove}
        onOpenIngest={() => {
          close("convs");
          open("ingest");
        }}
        onLogout={() => {
          void logout().then(() => {
            setAuthed(false);
            newChat();
          });
        }}
      />
      <SlotPicker open={sheets.slot} slot={slot} onPick={setSlot} onClose={() => close("slot")} />
      <IngestSheet open={sheets.ingest} onClose={() => close("ingest")} onChanged={refreshDocs} />
      <SourcesSheet
        open={sheets.sources}
        docs={docs}
        sourceIds={sourceIds}
        onToggle={(id) =>
          setSourceIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
        }
        onReset={() => setSourceIds([])}
        onClose={() => close("sources")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.muted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.borderSoft,
  },
  headerBtn: { width: 40, alignItems: "center" },
  headerBtnText: { color: colors.text, fontSize: 20 },
  headerTitle: { flex: 1, alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerIcon: { width: 18, height: 18, borderRadius: 4 },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  slot: { color: colors.muted, fontSize: 11, marginTop: 1 },
  body: { flex: 1 },
});
