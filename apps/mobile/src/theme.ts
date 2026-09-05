import { StyleSheet } from "react-native";

// Dark stone palette mirroring the web app (Nova style, base stone, .dark root).
export const colors = {
  bg: "#0c0a09",
  card: "#1c1917",
  cardSoft: "#292524",
  border: "#44403c",
  borderSoft: "#292524",
  text: "#fafaf9",
  muted: "#a8a29e",
  faint: "#78716c",
  primary: "#e7e5e4",
  primaryText: "#0c0a09",
  accent: "#34d399",
  danger: "#f87171",
  amber: "#fbbf24",
  sky: "#38bdf8",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  input: {
    backgroundColor: colors.cardSoft,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: colors.primaryText, fontWeight: "600", fontSize: 15 },
  ghostButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  ghostButtonText: { color: colors.text, fontSize: 14 },
  mutedText: { color: colors.muted, fontSize: 13 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: "85%",
  },
});
