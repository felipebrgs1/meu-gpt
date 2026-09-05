import { memo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import type { Citation } from "@meu-gpt/shared";
import type { UIMessage } from "../lib/api";
import { QUICK_PROMPTS, type SlotOption } from "../lib/slots";
import { colors, spacing } from "../theme";

const markdownStyles = {
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  heading1: { color: colors.text, fontSize: 19, fontWeight: "700" as const, marginVertical: 4 },
  heading2: { color: colors.text, fontSize: 16, fontWeight: "700" as const, marginVertical: 4 },
  heading3: { color: colors.text, fontSize: 14, fontWeight: "700" as const, marginVertical: 2 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { color: colors.text, fontSize: 14 },
  code_inline: {
    backgroundColor: "#00000088",
    color: colors.text,
    fontSize: 12.5,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: "#00000099",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  code_block: { color: colors.text, fontSize: 12.5 },
  blockquote: {
    borderLeftColor: colors.primary,
    borderLeftWidth: 2,
    paddingLeft: 8,
    opacity: 0.85,
  },
  link: { color: colors.sky },
  table: { borderColor: colors.border, borderWidth: 1, borderRadius: 8 },
  th: { color: colors.text, fontWeight: "700" as const, padding: 6 },
  td: { color: colors.text, padding: 6 },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: 8 },
};

// Completed messages render once (memo) so each stream token doesn't
// re-render the whole conversation — same rationale as web MessageBody.
const MessageBody = memo(function MessageBody({ content }: { content: string }) {
  return <Markdown style={markdownStyles}>{content}</Markdown>;
});

function formatTps(tps: number): string {
  return `${tps.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t/s`;
}
function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toPrecision(2)}`;
}
function formatCache(n: number): string {
  if (n >= 1000)
    return `cache ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return `cache ${n}`;
}

function Citations({ items }: { items: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <View style={styles.citeWrap}>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} style={styles.citeToggle}>
        <Text style={styles.citeToggleText}>
          Fontes ({items.length}) {open ? "▾" : "▸"}
        </Text>
      </TouchableOpacity>
      {open
        ? items.map((c) => (
            <View key={c.chunkId} style={styles.citeRow}>
              <Text style={styles.citeTitle} numberOfLines={1}>
                [{c.title}]
              </Text>
              <Text style={styles.citeScore}>score {c.score.toFixed(3)}</Text>
            </View>
          ))
        : null}
    </View>
  );
}

function AssistantMeta({ msg }: { msg: UIMessage }) {
  const [copied, setCopied] = useState(false);
  const bits: string[] = [];
  if (msg.model) bits.push(msg.model);
  if (msg.tps != null) bits.push(`⚡ ${formatTps(msg.tps)}`);
  if (msg.costUsd != null) bits.push(`$ ${formatCost(msg.costUsd)}`);
  if (msg.cachedTokens != null && msg.cachedTokens > 0) bits.push(formatCache(msg.cachedTokens));
  return (
    <View style={styles.metaRow}>
      {bits.map((b) => (
        <Text key={b} style={styles.meta} numberOfLines={1}>
          {b}
        </Text>
      ))}
      {msg.content && msg.id !== "streaming" ? (
        <TouchableOpacity
          onPress={() => {
            void Clipboard.setStringAsync(msg.content).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Text style={styles.copy}>{copied ? "copiado ✓" : "copiar"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface Props {
  log: UIMessage[];
  busy: boolean;
  activeSlot: SlotOption;
  onQuickPrompt: (prompt: string) => void;
  listRef: React.RefObject<FlatList<UIMessage> | null>;
}

export function ChatMessages({ log, busy: _busy, activeSlot, onQuickPrompt, listRef }: Props) {
  void _busy;
  if (log.length === 0) {
    return (
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Como posso ajudar hoje?</Text>
        <Text style={styles.heroSub}>RAG nativo na edge · Vectorize 1024d Cosine · OpenRouter</Text>
        <Text style={styles.heroSlot}>
          {activeSlot.modelName} ({activeSlot.label})
        </Text>
        <View style={styles.prompts}>
          {QUICK_PROMPTS.map((q) => (
            <TouchableOpacity
              key={q.title}
              style={styles.prompt}
              onPress={() => onQuickPrompt(q.prompt)}
            >
              <Text style={styles.promptCat}>{q.category}</Text>
              <Text style={styles.promptTitle}>{q.title}</Text>
              <Text style={styles.promptBody} numberOfLines={2}>
                {q.prompt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }
  return (
    <FlatList
      ref={listRef}
      data={log}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      renderItem={({ item: m }) => (
        <View style={[styles.row, m.role === "user" ? styles.rowEnd : styles.rowStart]}>
          <View
            style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.assistantBubble]}
          >
            {m.id === "streaming" && !m.content ? (
              <Text style={styles.thinking}>pensando…</Text>
            ) : (
              <MessageBody content={m.content} />
            )}
            {m.id === "streaming" && m.content ? <Text style={styles.cursor}>▍</Text> : null}
          </View>
          {m.role === "assistant" && (m.model || m.content) ? <AssistantMeta msg={m} /> : null}
          {m.citations && m.citations.length > 0 ? <Citations items={m.citations} /> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  row: { maxWidth: "92%" },
  rowEnd: { alignSelf: "flex-end", alignItems: "flex-end" },
  rowStart: { alignSelf: "flex-start", alignItems: "flex-start", width: "100%" },
  bubble: { borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: 10 },
  userBubble: { backgroundColor: colors.cardSoft, borderWidth: 1, borderColor: colors.border },
  assistantBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    width: "100%",
  },
  thinking: { color: colors.muted, fontSize: 14 },
  cursor: { color: colors.primary, marginTop: 2 },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: 4,
    alignItems: "center",
  },
  meta: { color: colors.faint, fontSize: 11, fontFamily: "monospace" },
  copy: { color: colors.muted, fontSize: 12 },
  citeWrap: { marginTop: 6, width: "100%" },
  citeToggle: { paddingVertical: 4 },
  citeToggleText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  citeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.cardSoft,
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  citeTitle: { color: colors.text, fontSize: 12, fontWeight: "600", flex: 1 },
  citeScore: { color: colors.faint, fontSize: 11, fontFamily: "monospace" },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: { color: colors.text, fontSize: 22, fontWeight: "700", textAlign: "center" },
  heroSub: { color: colors.muted, fontSize: 12, textAlign: "center" },
  heroSlot: {
    color: colors.muted,
    fontSize: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  prompts: { width: "100%", gap: spacing.sm, marginTop: spacing.md },
  prompt: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    padding: spacing.md,
  },
  promptCat: { color: colors.faint, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  promptTitle: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 },
  promptBody: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
