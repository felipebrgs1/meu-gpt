import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { DocRecord } from "../lib/api";
import { colors, common, spacing } from "../theme";

interface Props {
  open: boolean;
  docs: DocRecord[];
  sourceIds: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}

// RAG always on. Source filter: empty = all documents (same as web header).
export function SourcesSheet({ open, docs, sourceIds, onToggle, onReset, onClose }: Props) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[common.sheet, styles.sheet]}>
          <View style={styles.header}>
            <Text style={styles.title}>Fontes do RAG</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>fechar ✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={common.mutedText}>
            {sourceIds.length === 0
              ? "Buscando em todos os documentos."
              : `${sourceIds.length} fonte(s) selecionada(s).`}
          </Text>
          {docs.length === 0 ? (
            <Text style={common.mutedText}>Nenhum documento indexado ainda.</Text>
          ) : (
            docs.map((d) => {
              const on = sourceIds.includes(d.id);
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.row, on ? styles.rowActive : null]}
                  onPress={() => onToggle(d.id)}
                >
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {on ? "✓ " : ""}
                    {d.title}
                  </Text>
                  <Text style={styles.rowSub}>
                    {d.chunkCount} chunks{d.pageCount ? ` · ${d.pageCount} págs` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
          <TouchableOpacity style={common.ghostButton} onPress={onReset}>
            <Text style={common.ghostButtonText}>Limpar filtro (todos)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  sheet: { padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  close: { color: colors.muted, fontSize: 14 },
  row: {
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: spacing.sm,
  },
  rowActive: { borderColor: colors.accent },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowSub: { color: colors.faint, fontSize: 11, marginTop: 2 },
});
