import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * expo-secure-store has no web implementation — ExpoSecureStore.web.js
 * ships as an empty object, so every SecureStore call (get/set/delete)
 * throws "X is not a function" in a browser. On native it stays backed
 * by the iOS Keychain / Android Keystore, unchanged. On web, localStorage
 * is the only persistence option available to a bearer-token PWA with no
 * server-side cookie session; it isn't hardware-encrypted like Keychain/
 * Keystore, but it's what makes "stay signed in" possible on web at all.
 */
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private browsing / storage disabled — session just won't persist.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clean up if storage was never writable.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
