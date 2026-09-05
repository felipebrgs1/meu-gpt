import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { login } from "../lib/api";
import { colors, common, spacing } from "../theme";

// Single-user gate: username + password (hardcoded in the API) swapped for a
// session token stored in SecureStore (native) or localStorage (web).
export function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [user, setUser] = useState("felipeb");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter() {
    if (!user.trim() || !pass || busy) return;
    setBusy(true);
    setErr("");
    try {
      await login(user.trim(), pass);
      onAuth();
    } catch {
      setErr("usuário ou senha inválidos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={common.center}>
      <View style={styles.card}>
        <Text style={styles.title}>meu-gpt</Text>
        <Text style={common.mutedText}>Entre com seu usuário e senha.</Text>
        <Text style={styles.label}>usuário</Text>
        <TextInput
          value={user}
          onChangeText={setUser}
          placeholder="usuário"
          placeholderTextColor={colors.faint}
          style={common.input}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          onSubmitEditing={enter}
        />
        <Text style={styles.label}>senha</Text>
        <TextInput
          value={pass}
          onChangeText={setPass}
          secureTextEntry
          placeholder="senha"
          placeholderTextColor={colors.faint}
          style={common.input}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          onSubmitEditing={enter}
        />
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <TouchableOpacity style={[common.button, styles.cta]} onPress={enter} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={common.buttonText}>Entrar no meu-gpt</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", maxWidth: 360, gap: spacing.sm },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  label: { color: colors.muted, fontSize: 13, marginTop: spacing.sm },
  err: { color: colors.danger, fontSize: 12 },
  cta: { marginTop: spacing.md },
});
