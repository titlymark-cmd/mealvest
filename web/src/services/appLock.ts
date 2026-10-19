/**
 * App-lock bookkeeping (the PWA "PIN on reopen" feature).
 *
 * The lock is a LOCAL SCREEN LOCK layered on top of the existing
 * authentication — it never replaces it:
 *   - The refresh token (services/secureStorage) is still the only thing
 *     that proves a session; nothing here is a credential.
 *   - Unlocking always goes through the server (POST /api/auth/pin/verify,
 *     which has per-account attempt lockout + IP rate limiting).
 *   - The PIN itself is never stored anywhere by this module.
 *
 * What a browser can and cannot tell us:
 *   Browsers give NO reliable "the installed PWA was closed" event
 *   (beforeunload/pagehide also fire on a plain refresh). So instead of
 *   trying to detect closing we detect its two observable consequences:
 *
 *   1. A COLD START. sessionStorage is scoped to one window/tab session
 *      and is discarded when the installed PWA window is closed, but it
 *      survives a refresh. "Signed in, but this window has not been
 *      unlocked yet" therefore means "the app was (re)opened" — and a
 *      reload in the same window does not look like that.
 *   2. TIME IN THE BACKGROUND. If the app was hidden for longer than a
 *      short timeout we lock on return, which also covers platforms that
 *      suspend/restore the app without clearing sessionStorage.
 *
 * Both signals live in sessionStorage on purpose: they must not leak
 * between tabs or outlive the window.
 */

const UNLOCKED_KEY = "mealvest_unlocked_window";
const HIDDEN_AT_KEY = "mealvest_hidden_at";
/** localStorage: "1" = account is known to have a PIN, "0" = known not to. Absent = unknown. Not sensitive. */
const PIN_LOCK_KEY = "mealvest_pin_lock";

/** Installed-PWA background timeout. Short: a phone that was put away. */
export const BACKGROUND_LOCK_MS_STANDALONE = 2 * 60 * 1000;
/** Ordinary browser tab: much more relaxed so normal tab switching is not punished. */
export const BACKGROUND_LOCK_MS_BROWSER = 15 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function session(): Store | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
function local(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True when running as an installed PWA (Android/desktop standalone, iOS "Add to Home Screen"). */
export function isStandaloneDisplay(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function backgroundLockMs(): number {
  return isStandaloneDisplay() ? BACKGROUND_LOCK_MS_STANDALONE : BACKGROUND_LOCK_MS_BROWSER;
}

// ---- "this window has been unlocked" ---------------------------------------

export function markWindowUnlocked(): void {
  session()?.setItem(UNLOCKED_KEY, "1");
  session()?.removeItem(HIDDEN_AT_KEY);
}
export function isWindowUnlocked(): boolean {
  return session()?.getItem(UNLOCKED_KEY) === "1";
}

// ---- background timestamp ---------------------------------------------------

export function recordHidden(now: number = Date.now()): void {
  session()?.setItem(HIDDEN_AT_KEY, String(now));
}
export function clearHidden(): void {
  session()?.removeItem(HIDDEN_AT_KEY);
}
export function getHiddenAt(): number | null {
  const raw = session()?.getItem(HIDDEN_AT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ---- "does this account have a PIN" marker ---------------------------------

export function setPinLockMarker(hasPin: boolean): void {
  local()?.setItem(PIN_LOCK_KEY, hasPin ? "1" : "0");
}
/** Unknown (absent) counts as enabled: fail closed, and an account with no PIN downgrades itself on first unlock attempt. */
export function isPinLockEnabled(): boolean {
  return local()?.getItem(PIN_LOCK_KEY) !== "0";
}

/** Everything here is forgotten on logout / forced sign-out. */
export function clearLockState(): void {
  session()?.removeItem(UNLOCKED_KEY);
  session()?.removeItem(HIDDEN_AT_KEY);
  local()?.removeItem(PIN_LOCK_KEY);
}

// ---- decision logic (pure, unit-tested) -------------------------------------

export interface LaunchInputs {
  hasRefreshToken: boolean;
  lockEnabled: boolean;
  windowUnlocked: boolean;
  hiddenAt: number | null;
  now: number;
  standalone: boolean;
  timeoutMs: number;
}

/**
 * Should the app open locked (instead of silently restoring the session)?
 *  - no stored session            -> never (nothing to lock; normal logged-out flow)
 *  - lock not applicable          -> never
 *  - fresh window, installed PWA  -> YES (this is the "closed and reopened" case)
 *  - fresh window, browser tab    -> no (opening a new tab is not "reopening the app")
 *  - same window (a reload)       -> only if it was backgrounded past the timeout
 */
export function shouldLockOnLaunch(i: LaunchInputs): boolean {
  if (!i.hasRefreshToken || !i.lockEnabled) return false;
  if (!i.windowUnlocked) return i.standalone;
  return i.hiddenAt !== null && i.now - i.hiddenAt > i.timeoutMs;
}

/** Should coming back to the foreground lock a live, unlocked session? */
export function shouldLockOnReturn(hiddenAt: number | null, now: number, timeoutMs: number): boolean {
  return hiddenAt !== null && now - hiddenAt > timeoutMs;
}
