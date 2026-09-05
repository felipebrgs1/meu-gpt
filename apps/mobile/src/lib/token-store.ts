import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Token storage with per-platform backend:
// - native (Android/iOS): SecureStore (encrypted keychain/keystore)
// - web: localStorage (SecureStore has no web implementation — calling it
//   throws "getValueWithKeyAsync is not a function")
const TOKEN_KEY = "meu-gpt-token";
const isWeb = Platform.OS === "web";

export async function getStoredToken(): Promise<string> {
  if (isWeb) {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  }
  return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? "";
}

export async function setStoredToken(token: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode etc. */
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  if (isWeb) {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
