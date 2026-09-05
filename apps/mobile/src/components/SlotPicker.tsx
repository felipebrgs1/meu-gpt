import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SLOTS, type Slot } from "../lib/slots";
import { colors, common, spacing } from "../theme";

interface Props {
  open: boolean;
  slot: Slot;
  onPick: (s: Slot) => void;
  onClose: () => void;
}

// Slot picker replacing the web header model menu (fast|cheap|quality).
export function SlotPicker({ open, slot, onPick, onClose }: Props) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[common.sheet, styles.sheet]}>
          <Text style={styles.title}>Modelo</Text>
          {SLOTS.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.row, s.id === slot ? styles.rowActive : null]}
              onPress={() => {
                onPick(s.id);
                onClose();
              }}
            >
              <Text style={styles.rowLabel}>
                {s.label} · {s.modelName}
              </Text>
              <Text style={styles.rowHint}>{s.hint}</Text>
              {s.id === slot ? <Text style={styles.check}>✓</Text> : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={common.ghostButton} onPress={onClose}>
            <Text style={common.ghostButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  sheet: { padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: spacing.sm },
  row: { backgroundColor: colors.cardSoft, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, padding: spacing.md },
  rowActive: { borderColor: colors.accent },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  check: { color: colors.accent, fontSize: 14, fontWeight: "700", marginTop: 4 },
});
