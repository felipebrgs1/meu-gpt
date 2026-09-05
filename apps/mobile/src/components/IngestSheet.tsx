import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ACCEPTED_DOC_TYPES } from "@meu-gpt/shared";
import { ingestDocument, uploadDocument, type DocRecord } from "../lib/api";
import { colors, common, spacing } from "../theme";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const ACCEPT_LIST = [...ACCEPTED_DOC_TYPES];

// Ingest sheet: paste-text (like web "colar texto") + file upload
// (pdf/docx/txt/md). Replaces web IngestDialog.
export function IngestSheet({ open, onClose, onChanged }: Props) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  function reset(msg = "") {
    setTitle("");
    setText("");
    setErr("");
    setOk(msg);
  }

  async function sendText() {
    if (!title.trim() || !text.trim() || busy) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await ingestDocument(title.trim(), text.trim());
      onChanged();
      reset(`Indexado: ${r.chunkCount} chunk(s).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha ao indexar");
    } finally {
      setBusy(false);
    }
  }

  async function pickFile() {
    if (busy) return;
    setErr("");
    setOk("");
    const picked = await DocumentPicker.getDocumentAsync({
      type: ACCEPT_LIST,
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const a = picked.assets[0];
    setBusy(true);
    try {
      const r = await uploadDocument(
        { uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream" },
        title.trim() || undefined,
      );
      onChanged();
      reset(`"${r.title}": ${r.chunkCount} chunk(s).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha no upload");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[common.sheet, styles.sheet]}>
          <View style={styles.header}>
            <Text style={styles.title}>Adicionar documento</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>fechar ✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>Título (opcional p/ arquivo)</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Manual do Vectorize"
            placeholderTextColor={colors.faint}
            style={common.input}
          />
          <Text style={styles.label}>Ou cole o texto</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Cole o conteúdo para indexar no RAG…"
            placeholderTextColor={colors.faint}
            style={[common.input, styles.textarea]}
            multiline
            textAlignVertical="top"
          />
          {err ? <Text style={styles.err}>{err}</Text> : null}
          {ok ? <Text style={styles.ok}>{ok}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity style={[common.button, styles.flex]} onPress={sendText} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={common.buttonText}>Indexar texto</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[common.ghostButton, styles.flex]} onPress={pickFile} disabled={busy}>
              <Text style={common.ghostButtonText}>Escolher arquivo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export type { DocRecord };

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  sheet: { padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  close: { color: colors.muted, fontSize: 14 },
  label: { color: colors.muted, fontSize: 13, marginTop: spacing.sm },
  textarea: { minHeight: 110 },
  err: { color: colors.danger, fontSize: 12 },
  ok: { color: colors.accent, fontSize: 12 },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
});
