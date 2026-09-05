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
import { Feather } from "@expo/vector-icons";
import { ACCEPTED_DOC_TYPES } from "@meu-gpt/shared";
import { ingestDocument, uploadDocument, type DocRecord, type UploadPayload } from "../lib/api";
import { colors, common, spacing } from "../theme";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const ACCEPT_LIST = [...ACCEPTED_DOC_TYPES];
const MAX_MB = 10;

function fmtBytes(n?: number | null): string | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function kindOf(name: string, mime?: string | null): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime?.includes("pdf")) return "PDF";
  if (lower.endsWith(".docx") || mime?.includes("wordprocessingml")) return "DOCX";
  const ext = lower.split(".").pop();
  return ext ? ext.toUpperCase().slice(0, 5) : "DOC";
}

interface PickedDoc {
  payload: UploadPayload;
  name: string;
  size: string | null;
  kind: string;
}

// Ingest sheet: arquivo (default) + texto manual atrás do toggle.
// Sem campo de título: o próprio doc é o título (nome do arquivo; no texto
// colado, a primeira linha).
export function IngestSheet({ open, onClose, onChanged }: Props) {
  // Arquivo (PDF/DOCX/...) é o default; texto manual fica atrás do toggle.
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  function reset(msg = "") {
    setText("");
    setPicked(null);
    setErr("");
    setOk(msg);
  }

  async function sendText() {
    const content = text.trim();
    if (!content || busy) return;
    // Título derivado da primeira linha com conteúdo (API exige title).
    const derived =
      content
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean)
        ?.slice(0, 80) ?? "Texto colado";
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await ingestDocument(derived, content);
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
    const res = await DocumentPicker.getDocumentAsync({
      type: ACCEPT_LIST,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (a.size != null && a.size > MAX_MB * 1024 * 1024) {
      setPicked(null);
      setErr(`Arquivo muito grande (${fmtBytes(a.size)}). Máximo ${MAX_MB}MB.`);
      return;
    }
    // Nome com fallback (basename do uri): sem filename a parte chega ao
    // servidor sem nome. No Expo web o asset traz o File real — sem ele o
    // FormData do browser stringifica o objeto e dá "campo 'file' ausente".
    const webFile = (a as { file?: File }).file;
    const uriName = a.uri.split("/").pop()?.split("?")[0]?.trim() ?? "";
    const name = a.name?.trim() || (webFile as File | undefined)?.name || uriName || "document";
    const mime = a.mimeType ?? "application/octet-stream";
    setPicked({
      payload: webFile ?? { uri: a.uri, name, mimeType: mime },
      name,
      size: fmtBytes(a.size),
      kind: kindOf(name, a.mimeType),
    });
  }

  async function uploadPicked() {
    if (!picked || busy) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await uploadDocument(picked.payload);
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
          {mode === "file" ? (
            <>
              {!picked ? (
                <TouchableOpacity
                  style={styles.dropbox}
                  onPress={pickFile}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  <View style={styles.dropIconWrap}>
                    <Feather name="upload" size={26} color={colors.muted} />
                  </View>
                  <Text style={styles.dropTitle}>Toque para escolher o arquivo</Text>
                  <Text style={styles.dropHint}>
                    PDF, DOCX, TXT, MD, CSV, JSON · até {MAX_MB}MB
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={styles.fileCard}>
                    <View style={styles.kindBadge}>
                      <Text style={styles.kindText}>{picked.kind}</Text>
                    </View>
                    <View style={styles.fileMeta}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {picked.name}
                      </Text>
                      {picked.size ? <Text style={styles.fileSize}>{picked.size}</Text> : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => setPicked(null)}
                      disabled={busy}
                      style={styles.fileRemove}
                    >
                      <Feather name="x" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[common.button, styles.indexButton]}
                    onPress={uploadPicked}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.primaryText} />
                    ) : (
                      <Text style={common.buttonText}>Indexar arquivo</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={() => setMode("text")} disabled={busy}>
                <Text style={styles.link}>ou cole o texto manualmente</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Cole o texto</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Cole o conteúdo para indexar no RAG…"
                placeholderTextColor={colors.faint}
                style={[common.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity style={common.button} onPress={sendText} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={common.buttonText}>Indexar texto</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode("file")} disabled={busy}>
                <Text style={styles.link}>ou envie um arquivo</Text>
              </TouchableOpacity>
            </>
          )}
          {err ? <Text style={styles.err}>{err}</Text> : null}
          {ok ? <Text style={styles.ok}>{ok}</Text> : null}
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
  // Caixa de upload (padrão dropzone): borda tracejada + ícone central.
  dropbox: {
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: `${colors.cardSoft}66`,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  dropIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dropTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  dropHint: { color: colors.faint, fontSize: 12, textAlign: "center" },
  // Card do arquivo escolhido: selo do tipo + nome/tamanho + remover.
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  kindBadge: {
    backgroundColor: `${colors.accent}26`,
    borderWidth: 1,
    borderColor: `${colors.accent}55`,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  kindText: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  fileMeta: { flex: 1, minWidth: 0 },
  fileName: { color: colors.text, fontSize: 14, fontWeight: "500" },
  fileSize: { color: colors.muted, fontSize: 12, marginTop: 2 },
  fileRemove: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  indexButton: { marginTop: spacing.sm },
  link: { color: colors.accent, fontSize: 13, textAlign: "center", marginTop: spacing.sm },
});
