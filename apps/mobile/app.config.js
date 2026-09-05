const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

// Dynamic Expo config: single source of truth stays the monorepo root .env
// (repo rule). Expo only auto-loads .env from apps/mobile/, so we parse the
// root file here and expose the public API URL via expo-constants `extra`.
// EXPO_PUBLIC_API_URL in the process env still wins when set.
function rootApiUrl() {
  try {
    const envPath = resolve(__dirname, "..", "..", ".env");
    if (!existsSync(envPath)) return "";
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t.startsWith("EXPO_PUBLIC_API_URL=")) continue;
      let v = t.slice("EXPO_PUBLIC_API_URL=".length).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  } catch {
    /* missing/unreadable .env (CI, EAS): fall through to "" */
  }
  return "";
}

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || rootApiUrl()).trim().replace(/\/$/, "");

// Backfill the bundler process env so babel-preset-expo inlines
// EXPO_PUBLIC_API_URL as a literal into every bundle (web + native).
// `expo start` never reads the monorepo-root .env, and on web dev
// Constants.expoConfig.extra isn't reliably populated — without this the
// client resolves API "" and every request hits the Expo server itself.
if (apiUrl && !process.env.EXPO_PUBLIC_API_URL) {
  process.env.EXPO_PUBLIC_API_URL = apiUrl;
}

module.exports = {
  expo: {
    name: "meu-gpt",
    slug: "meu-gpt",
    version: "0.1.0",
    scheme: "meu-gpt",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
    },
    plugins: ["expo-router", "expo-secure-store"],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      apiUrl,
    },
  },
};
