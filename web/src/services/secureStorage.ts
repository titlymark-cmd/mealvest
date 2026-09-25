/**
 * Web port of the original app/src/services/secureStorage.ts. The
 * original branched on Platform.OS to pick expo-secure-store (native,
 * iOS Keychain / Android Keystore) vs localStorage (web, since
 * expo-secure-store has no web backing at all). This app is web-only
 * now, so only that web branch remains — same storage, same
 * behavior, same key names, just without the platform check.
 */
export async function getItemAsync(key: string): Promise<string | null> {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing / storage disabled — session just won't persist.
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage was never writable.
  }
}
