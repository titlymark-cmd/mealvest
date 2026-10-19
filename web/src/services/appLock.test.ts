import {
  BACKGROUND_LOCK_MS_BROWSER,
  BACKGROUND_LOCK_MS_STANDALONE,
  clearLockState,
  getHiddenAt,
  isPinLockEnabled,
  isWindowUnlocked,
  markWindowUnlocked,
  recordHidden,
  setPinLockMarker,
  shouldLockOnLaunch,
  shouldLockOnReturn,
  LaunchInputs,
} from "./appLock";

const base: LaunchInputs = {
  hasRefreshToken: true,
  lockEnabled: true,
  windowUnlocked: false,
  hiddenAt: null,
  now: 1_000_000,
  standalone: true,
  timeoutMs: BACKGROUND_LOCK_MS_STANDALONE,
};

describe("shouldLockOnLaunch", () => {
  it("never locks when there is no stored session (that is just logged-out)", () => {
    expect(shouldLockOnLaunch({ ...base, hasRefreshToken: false })).toBe(false);
  });
  it("locks a freshly opened installed PWA that has a session (closed and reopened)", () => {
    expect(shouldLockOnLaunch(base)).toBe(true);
  });
  it("does not lock a brand-new browser tab (opening a tab is not reopening the app)", () => {
    expect(shouldLockOnLaunch({ ...base, standalone: false })).toBe(false);
  });
  it("does not lock a plain refresh in an already-unlocked window", () => {
    expect(shouldLockOnLaunch({ ...base, windowUnlocked: true, hiddenAt: base.now - 1500 })).toBe(false);
    expect(shouldLockOnLaunch({ ...base, windowUnlocked: true, hiddenAt: null })).toBe(false);
  });
  it("locks an unlocked window that was backgrounded longer than the timeout", () => {
    expect(shouldLockOnLaunch({ ...base, windowUnlocked: true, hiddenAt: base.now - BACKGROUND_LOCK_MS_STANDALONE - 1 })).toBe(true);
  });
  it("respects accounts known to have no PIN", () => {
    expect(shouldLockOnLaunch({ ...base, lockEnabled: false })).toBe(false);
  });
});

describe("shouldLockOnReturn", () => {
  it("locks only after the timeout", () => {
    expect(shouldLockOnReturn(null, 10, 100)).toBe(false);
    expect(shouldLockOnReturn(0, 100, 100)).toBe(false);
    expect(shouldLockOnReturn(0, 101, 100)).toBe(true);
  });
  it("browser tabs get a more relaxed timeout than the installed app", () => {
    expect(BACKGROUND_LOCK_MS_BROWSER).toBeGreaterThan(BACKGROUND_LOCK_MS_STANDALONE);
  });
});

describe("storage helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
  it("tracks the unlocked window and the hidden timestamp, and clears both on sign-out", () => {
    expect(isWindowUnlocked()).toBe(false);
    recordHidden(123);
    expect(getHiddenAt()).toBe(123);
    markWindowUnlocked(); // unlocking also drops a stale hidden stamp
    expect(isWindowUnlocked()).toBe(true);
    expect(getHiddenAt()).toBeNull();
    setPinLockMarker(true);
    clearLockState();
    expect(isWindowUnlocked()).toBe(false);
    expect(window.localStorage.getItem("mealvest_pin_lock")).toBeNull();
  });
  it("treats an unknown PIN status as enabled (fail closed) and 0 as disabled", () => {
    expect(isPinLockEnabled()).toBe(true);
    setPinLockMarker(false);
    expect(isPinLockEnabled()).toBe(false);
  });
  it("never writes a PIN anywhere", () => {
    markWindowUnlocked();
    setPinLockMarker(true);
    recordHidden();
    const all = JSON.stringify({ ...window.localStorage, ...window.sessionStorage });
    expect(all).not.toMatch(/pin":"\d{4}/);
  });
});
