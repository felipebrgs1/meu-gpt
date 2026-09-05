import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { SlotOption } from "../lib/slots";
import { colors, spacing } from "../theme";

interface Props {
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  activeSlot: SlotOption;
  sourceCount: number;
  onOpenSources: () => void;
  onOpenIngest: () => void;
}

// Floating composer mirroring web Composer: input + RAG/ingest actions + send.
export function Composer({
  input,
  onInput,
  onSend,
  busy,
  activeSlot,
  sourceCount,
  onOpenSources,
  onOpenIngest,
}: Props) {
  const canSend = !busy && !!input.trim();
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <TextInput
          value={input}
          onChangeText={onInput}
          multiline
          placeholder={`Pergunte ao ${activeSlot.label} (${activeSlot.modelName})…`}
          placeholderTextColor={colors.faint}
          style={styles.input}
          editable={!busy}
          onSubmitEditing={onSend}
        />
        <View style={styles.actions}>
          <View style={styles.left}>
            <TouchableOpacity onPress={onOpenIngest} style={styles.chip}>
              <Text style={styles.chipText}>＋ Adicionar doc</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onOpenSources}
              style={[styles.chip, sourceCount ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, sourceCount ? styles.chipActiveText : null]}>
                RAG · {sourceCount ? `${sourceCount} fonte(s)` : "todos"}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={onSend}
            disabled={!canSend}
            style={[styles.send, !canSend ? styles.sendDisabled : null]}
          >
            <Text style={styles.sendText}>{busy ? "…" : "↑"}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.disclaimer}>
        meu-gpt pode cometer erros. Verifique fontes e citações via RAG.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bg,
  },
  box: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.md,
  },
  input: { color: colors.text, fontSize: 15, minHeight: 48, maxHeight: 140 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  left: { flexDirection: "row", gap: spacing.sm, flex: 1, flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: colors.muted, fontSize: 12 },
  chipActive: { backgroundColor: "#064e3b55", borderColor: colors.accent },
  chipActiveText: { color: colors.accent, fontWeight: "600" },
  send: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.3 },
  sendText: { color: colors.primaryText, fontSize: 18, fontWeight: "700" },
  disclaimer: { color: colors.faint, fontSize: 10, textAlign: "center", marginTop: 6 },
});
