import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Conversation } from "@meu-gpt/shared";
import { colors, common, spacing } from "../theme";

interface Props {
  open: boolean;
  convs: Conversation[];
  activeId: string | null;
  docsCount?: number;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenIngest?: () => void;
  onLogout: () => void;
}

const DRAWER_WIDTH = Math.min(340, Math.floor(Dimensions.get("window").width * 0.86));

interface Group {
  label: string;
  items: Conversation[];
}

// Same grouping as the web sidebar: Hoje / Ontem / Últimos 7 dias / Últimos 30 dias / Antigas.
function groupByDate(convs: Conversation[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets: Record<string, Conversation[]> = {
    Hoje: [],
    Ontem: [],
    "Últimos 7 dias": [],
    "Últimos 30 dias": [],
    Antigas: [],
  };
  for (const c of convs) {
    const t = new Date(c.updatedAt ?? c.createdAt).getTime();
    if (Number.isNaN(t) || t >= startOfToday) buckets["Hoje"].push(c);
    else if (t >= startOfToday - day) buckets["Ontem"].push(c);
    else if (t >= startOfToday - 7 * day) buckets["Últimos 7 dias"].push(c);
    else if (t >= startOfToday - 30 * day) buckets["Últimos 30 dias"].push(c);
    else buckets["Antigas"].push(c);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

// Lateral drawer (mirror of the web sidebar): slides in from the LEFT,
// not bottom-up. Overlay fades, panel translates X from -width to 0.
export function ConversationsSheet({
  open,
  convs,
  activeId,
  docsCount = 0,
  onClose,
  onNew,
  onSelect,
  onRemove,
  onOpenIngest,
  onLogout,
}: Props) {
  const [rendered, setRendered] = useState(open);
  const [query, setQuery] = useState("");
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setQuery("");
      setRendered(true);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 230, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(slide, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
    // slide/fade refs are stable; rendered guards the exit animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) => (c.title || "").toLowerCase().includes(q));
  }, [convs, query]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: fade }]}>
          <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slide }] }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Text style={styles.iconText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.title}>meu-gpt</Text>
            <TouchableOpacity onPress={onNew} style={styles.iconBtn}>
              <Text style={styles.iconText}>✎</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar conversas"
            placeholderTextColor={colors.faint}
            style={styles.search}
          />

          <TouchableOpacity style={common.button} onPress={onNew}>
            <Text style={common.buttonText}>＋ Novo chat</Text>
          </TouchableOpacity>

          {onOpenIngest && (
            <TouchableOpacity style={styles.kbRow} onPress={onOpenIngest}>
              <Text style={styles.kbLabel}>Base de conhecimento</Text>
              <Text style={styles.kbCount}>{docsCount}</Text>
            </TouchableOpacity>
          )}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {groups.map((g) => (
              <View key={g.label}>
                <Text style={styles.groupLabel}>{g.label}</Text>
                {g.items.map((c) => (
                  <View key={c.id} style={[styles.row, c.id === activeId ? styles.rowActive : null]}>
                    <TouchableOpacity style={styles.rowMain} onPress={() => onSelect(c.id)}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {c.title || "Sem título"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onRemove(c.id)} style={styles.delete}>
                      <Text style={styles.deleteText}>apagar</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
            {filtered.length === 0 && (
              <Text style={common.mutedText}>
                {query.trim() ? "Nenhuma conversa bate com a busca." : "Nenhuma conversa ainda. Comece um novo chat."}
              </Text>
            )}
          </ScrollView>

          <TouchableOpacity style={common.ghostButton} onPress={onLogout}>
            <Text style={[common.ghostButtonText, { color: colors.danger }]}>Sair (apagar token)</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000aa",
  },
  backdropTouch: { flex: 1 },
  drawer: {
    width: DRAWER_WIDTH,
    height: "100%",
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  iconText: { color: colors.muted, fontSize: 18 },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  search: {
    backgroundColor: colors.cardSoft,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
  },
  kbRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardSoft,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  kbLabel: { color: colors.text, fontSize: 14 },
  kbCount: {
    color: colors.muted,
    fontSize: 12,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  list: { flex: 1 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.md },
  groupLabel: { color: colors.faint, fontSize: 11, marginTop: spacing.sm, marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: spacing.sm,
  },
  rowActive: { borderColor: colors.accent },
  rowMain: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  delete: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  deleteText: { color: colors.danger, fontSize: 12 },
});
