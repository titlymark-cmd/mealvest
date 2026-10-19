/**
 * Browser-local draft for the multi-step sign-up flows.
 *
 * What this is: a convenience so someone who closes the tab can pick up
 * where they stopped ON THIS DEVICE. There is no server-side draft
 * endpoint, so it cannot follow them to another device.
 *
 * What it must never hold: passwords, PINs, or payout identifiers (till /
 * paybill / bank account numbers). Callers pass only the safe fields; this
 * module also expires drafts after 7 days.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored<T> {
  v: 1;
  savedAt: number;
  step: number;
  data: T;
}

export function loadDraft<T>(key: string): { step: number; data: T } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (parsed.v !== 1 || Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { step: parsed.step, data: parsed.data };
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, step: number, data: T) {
  try {
    const payload: Stored<T> = { v: 1, savedAt: Date.now(), step, data };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Storage unavailable (private mode): the flow still works, it just can't be resumed.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}
