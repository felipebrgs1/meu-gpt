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

// Branding via TOML: branding.gen.json é gerado por scripts/sync-branding.mjs
// a partir de branding.toml. Ausente/ilegível (CI limpo) = cai nos padrões.
function rootBranding() {
  const fallback = {
    name: "meu-gpt",
    slug: "meu-gpt",
    background: "#09090b",
    mobile: { icon: "./assets/icon.png" },
  };
  try {
    const genPath = resolve(__dirname, "..", "..", "branding.gen.json");
    if (!existsSync(genPath)) return fallback;
    const gen = JSON.parse(readFileSync(genPath, "utf8"));
    return {
      name: gen.name || fallback.name,
      slug: gen.slug || fallback.slug,
      background: gen.background || fallback.background,
      mobile: { icon: (gen.mobile && gen.mobile.icon) || fallback.mobile.icon },
    };
  } catch {
    return fallback;
  }
}

const branding = rootBranding();

module.exports = {
  expo: {
    name: branding.name,
    slug: branding.slug,
    version: "0.1.0",
    scheme: branding.slug,
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    icon: branding.mobile.icon,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: branding.background,
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      icon: branding.mobile.icon,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: branding.background,
      },
    },
    web: {
      favicon: "./assets/favicon.png",
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
