/**
 * Push availability + enable/disable flows. The module reads REACT_APP_FIREBASE_VAPID_KEY at load,
 * so each scenario loads a fresh copy with the env it needs.
 */
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";

interface Env {
  vapid?: string;
  firebase?: boolean;
  ua?: string;
  permission?: NotificationPermission | null; // null → no Notification API
  pushManager?: boolean;
  standalone?: boolean;
}

function setBrowser(env: Env) {
  Object.defineProperty(window.navigator, "userAgent", { value: env.ua ?? CHROME_UA, configurable: true });
  Object.defineProperty(window.navigator, "serviceWorker", { value: { ready: Promise.resolve({ scope: "/" }), addEventListener: jest.fn(), removeEventListener: jest.fn() }, configurable: true });
  Object.defineProperty(window.navigator, "standalone", { value: Boolean(env.standalone), configurable: true });
  window.matchMedia = ((q: string) => ({ matches: Boolean(env.standalone) && q.includes("standalone"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  if (env.permission === null) delete (window as any).Notification;
  else (window as any).Notification = { permission: env.permission ?? "default", requestPermission: jest.fn().mockResolvedValue(env.permission === "denied" ? "denied" : "granted") };
  if (env.pushManager === false) delete (window as any).PushManager;
  else (window as any).PushManager = function PushManager() {};
}

function load(env: Env) {
  setBrowser(env);
  const mocks = {
    getToken: jest.fn().mockResolvedValue("tok-123"),
    deleteToken: jest.fn().mockResolvedValue(true),
    registerDevice: jest.fn().mockResolvedValue({}),
    disableDevice: jest.fn().mockResolvedValue(undefined),
    listDevices: jest.fn().mockResolvedValue([]),
  };
  let mod!: typeof import("./pushNotifications");
  jest.isolateModules(() => {
    if (env.vapid) process.env.REACT_APP_FIREBASE_VAPID_KEY = env.vapid;
    else delete process.env.REACT_APP_FIREBASE_VAPID_KEY;
    jest.doMock("firebase/messaging", () => ({ getToken: mocks.getToken, deleteToken: mocks.deleteToken }));
    jest.doMock("./firebase", () => ({ isFirebaseConfigured: () => env.firebase !== false, getMessagingInstance: () => Promise.resolve({}) }));
    jest.doMock("./notificationsApi", () => ({ registerDevice: mocks.registerDevice, disableDevice: mocks.disableDevice, listDevices: mocks.listDevices }));
    mod = require("./pushNotifications");
  });
  return { mod, mocks };
}
const authFetch = jest.fn();

describe("getPushAvailability", () => {
  test("not_configured when the VAPID key is missing (even with Firebase configured)", () => {
    expect(load({ firebase: true }).mod.getPushAvailability()).toEqual({ state: "not_configured" });
  });
  test("not_configured when Firebase isn't configured", () => {
    expect(load({ vapid: "k", firebase: false }).mod.getPushAvailability()).toEqual({ state: "not_configured" });
  });
  test("iPhone in an ordinary Safari tab: install required (web push doesn't exist there)", () => {
    expect(load({ vapid: "k", ua: IPHONE_UA, standalone: false, pushManager: false }).mod.getPushAvailability()).toEqual({ state: "ios_install_required" });
  });
  test("iPhone with the app on the Home Screen: ready", () => {
    expect(load({ vapid: "k", ua: IPHONE_UA, standalone: true }).mod.getPushAvailability()).toEqual({ state: "ready", permission: "default" });
  });
  test("a browser without the Push API: unsupported", () => {
    expect(load({ vapid: "k", pushManager: false }).mod.getPushAvailability()).toEqual({ state: "unsupported" });
    expect(load({ vapid: "k", permission: null }).mod.getPushAvailability()).toEqual({ state: "unsupported" });
  });
  test("blocked by the user: denied", () => {
    expect(load({ vapid: "k", permission: "denied" }).mod.getPushAvailability()).toEqual({ state: "denied" });
  });
  test("undecided and already-granted are both ready", () => {
    expect(load({ vapid: "k", permission: "default" }).mod.getPushAvailability()).toEqual({ state: "ready", permission: "default" });
    expect(load({ vapid: "k", permission: "granted" }).mod.getPushAvailability()).toEqual({ state: "ready", permission: "granted" });
  });
});

describe("describeAvailability", () => {
  test("gives honest, specific wording per state (and nothing when ready)", () => {
    const { mod } = load({ vapid: "k" });
    expect(mod.describeAvailability({ state: "ready", permission: "default" })).toBeNull();
    expect(mod.describeAvailability({ state: "ios_install_required" })).toMatch(/Home Screen.*iOS 16\.4/s);
    expect(mod.describeAvailability({ state: "denied" })).toMatch(/blocked/i);
    expect(mod.describeAvailability({ state: "unsupported" })).toMatch(/doesn't support/i);
    expect(mod.describeAvailability({ state: "not_configured" })).toMatch(/aren't set up/i);
  });
});

describe("enablePush", () => {
  test("registers this device with the token + label after permission is granted", async () => {
    const { mod, mocks } = load({ vapid: "VAPID", permission: "default" });
    const r = await mod.enablePush(authFetch);
    expect(r).toEqual({ ok: true });
    expect((window as any).Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocks.getToken).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ vapidKey: "VAPID" }));
    expect(mocks.registerDevice).toHaveBeenCalledWith(authFetch, expect.objectContaining({ pushToken: "tok-123", platform: "web", deviceLabel: "Chrome on Android" }));
  });
  test("does not re-prompt when already granted", async () => {
    const { mod } = load({ vapid: "k", permission: "granted" });
    await mod.enablePush(authFetch);
    expect((window as any).Notification.requestPermission).not.toHaveBeenCalled();
  });
  test("permission refused: typed failure, no token requested, nothing registered", async () => {
    const { mod, mocks } = load({ vapid: "k", permission: "default" });
    (window as any).Notification.requestPermission.mockResolvedValue("denied");
    const r = await mod.enablePush(authFetch);
    expect(r).toMatchObject({ ok: false, reason: "permission_denied" });
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.registerDevice).not.toHaveBeenCalled();
  });
  test("not configured / iOS tab: never asks for permission and says why", async () => {
    const a = load({ firebase: false });
    expect(await a.mod.enablePush(authFetch)).toMatchObject({ ok: false, reason: "not_configured" });
    const b = load({ vapid: "k", ua: IPHONE_UA, standalone: false, pushManager: false });
    const r = await b.mod.enablePush(authFetch);
    expect(r).toMatchObject({ ok: false, reason: "unsupported" });
    expect((r as any).message).toMatch(/Home Screen/);
    expect((window as any).Notification.requestPermission).not.toHaveBeenCalled();
  });
  test("token or registration failure is returned, not thrown", async () => {
    const { mod, mocks } = load({ vapid: "k", permission: "granted" });
    mocks.getToken.mockRejectedValue(new Error("boom"));
    expect(await mod.enablePush(authFetch)).toEqual({ ok: false, reason: "error", message: "boom" });
    mocks.getToken.mockResolvedValue("t");
    mocks.registerDevice.mockRejectedValue(new Error("server said no"));
    expect(await mod.enablePush(authFetch)).toMatchObject({ ok: false, message: "server said no" });
  });
});

describe("disable / status", () => {
  test("turning off unregisters THIS device's token with the backend and from FCM", async () => {
    const { mod, mocks } = load({ vapid: "k", permission: "granted" });
    await mod.disablePushOnThisDevice(authFetch);
    expect(mocks.disableDevice).toHaveBeenCalledWith(authFetch, "tok-123");
    expect(mocks.deleteToken).toHaveBeenCalled();
  });
  test("never creates a token (or prompts) when permission was never granted", async () => {
    const { mod, mocks } = load({ vapid: "k", permission: "default" });
    await mod.disablePushOnThisDevice(authFetch);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.disableDevice).not.toHaveBeenCalled();
  });
  test("isEnabledOnThisDevice is true only for a token the backend lists as enabled", async () => {
    const { mod, mocks } = load({ vapid: "k", permission: "granted" });
    mocks.listDevices.mockResolvedValue([{ push_token: "other", enabled: true }]);
    expect(await mod.isEnabledOnThisDevice(authFetch)).toBe(false);
    mocks.listDevices.mockResolvedValue([{ push_token: "tok-123", enabled: false }]);
    expect(await mod.isEnabledOnThisDevice(authFetch)).toBe(false);
    mocks.listDevices.mockResolvedValue([{ push_token: "tok-123", enabled: true }]);
    expect(await mod.isEnabledOnThisDevice(authFetch)).toBe(true);
  });
});

describe("service-worker messaging", () => {
  test("onForegroundPush fires on the worker's push message only, and unsubscribes", async () => {
    const { mod } = load({ vapid: "k" });
    const add = (navigator.serviceWorker as any).addEventListener as jest.Mock;
    const cb = jest.fn();
    const off = await mod.onForegroundPush(cb);
    const handler = add.mock.calls[add.mock.calls.length - 1][1];
    handler({ data: { type: "other" } });
    expect(cb).not.toHaveBeenCalled();
    handler({ data: { type: "mealvest:push-received" } });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect((navigator.serviceWorker as any).removeEventListener).toHaveBeenCalledWith("message", handler);
  });
  test("onNotificationNavigate honours only same-origin paths", () => {
    const { mod } = load({ vapid: "k" });
    const add = (navigator.serviceWorker as any).addEventListener as jest.Mock;
    const cb = jest.fn();
    mod.onNotificationNavigate(cb);
    const handler = add.mock.calls[add.mock.calls.length - 1][1];
    handler({ data: { type: "mealvest:navigate", path: "//evil.com" } });
    handler({ data: { type: "mealvest:navigate", path: "https://evil.com" } });
    handler({ data: { type: "mealvest:navigate", path: 5 } });
    expect(cb).not.toHaveBeenCalled();
    handler({ data: { type: "mealvest:navigate", path: "/hotel-staff/orders" } });
    expect(cb).toHaveBeenCalledWith("/hotel-staff/orders");
  });
});

export {};
