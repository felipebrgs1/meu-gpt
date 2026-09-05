import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteDocument, listDocuments, type DocRecord } from "../src/lib/api";
import { colors, common, spacing } from "../src/theme";

// Document manager (mirror of the web sidebar sources section):
// list indexed docs, delete (removes R2 + chunks + Vectorize + D1).
export default function Documents() {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      setErr("");
      setDocs(await listDocuments());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha ao listar");
    }
  }, []);

  useEffect(() => {
    // Mount-fetch: setState roda após o await, sem cascata. Disable
    // cirúrgico (a regra implica com chamadas sem argumento no effect).
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function remove(id: string) {
    await deleteDocument(id).catch(() => {});
    void refresh();
  }

  return (
    <SafeAreaView style={common.screen}>
      <FlatList
        data={docs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        onRefresh={refresh}
        refreshing={false}
        ListEmptyComponent={
          <Text style={common.mutedText}>Nenhum documento indexado. Adicione pelo ＋ no chat.</Text>
        }
        renderItem={({ item: d }) => (
          <View style={styles.row}>
            <View style={styles.main}>
              <Text style={styles.title} numberOfLines={1}>
                {d.title}
              </Text>
              <Text style={styles.sub}>
                {d.chunkCount} chunks{d.pageCount ? ` · ${d.pageCount} págs` : ""} ·{" "}
                {(d.fileSize / 1024).toFixed(1)} KB
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {d.originalFilename}
              </Text>
            </View>
            <TouchableOpacity onPress={() => remove(d.id)}>
              <Text style={styles.delete}>apagar</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    padding: spacing.md,
  },
  main: { flex: 1 },
  title: { color: colors.text, fontSize: 15, fontWeight: "700" },
  sub: { color: colors.faint, fontSize: 12, marginTop: 2 },
  delete: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing.sm },
  err: { color: colors.danger, fontSize: 12, textAlign: "center", padding: spacing.md },
});
