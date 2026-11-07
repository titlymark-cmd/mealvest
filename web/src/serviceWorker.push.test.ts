/**
 * Executes the REAL public/service-worker.js against a fake service-worker global, so the push and
 * notificationclick behaviour is tested as shipped (not a copy of it).
 */
import fs from "fs";
import path from "path";
import vm from "vm";

type Listener = (event: any) => void;

function loadWorker(opts: { windows?: any[] } = {}) {
  const listeners: Record<string, Listener> = {};
  const shown: Array<{ title: string; options: any }> = [];
  const opened: string[] = [];
  const windows = opts.windows ?? [];
  const self: any = {
    location: { origin: "https://mealvest.co.ke" },
    registration: { showNotification: (title: string, options: any) => { shown.push({ title, options }); return Promise.resolve(); } },
    clients: {
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => { opened.push(url); return Promise.resolve(); },
      claim: () => Promise.resolve(),
    },
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; },
    skipWaiting: () => {},
  };
  const code = fs.readFileSync(path.join(__dirname, "../public/service-worker.js"), "utf8");
  vm.runInNewContext(code, { self, caches: { open: () => Promise.resolve({ addAll: () => Promise.resolve() }), keys: () => Promise.resolve([]), match: () => Promise.resolve(undefined) }, URL, fetch: () => Promise.reject(new Error("offline")), Promise, JSON });
  return { listeners, shown, opened };
}

async function fire(listeners: Record<string, Listener>, type: string, event: any) {
  const waits: Promise<unknown>[] = [];
  listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}
const pushEvent = (payload: unknown) => ({ data: { json: () => payload } });
const clickEvent = (deepLink: unknown) => ({ notification: { data: { deepLink }, close: jest.fn() } });

describe("service worker — push", () => {
  test("shows the notification with the server's title/body and a safe deep link", async () => {
    const { listeners, shown } = loadWorker();
    await fire(listeners, "push", pushEvent({ notification: { title: "New order received", body: "A student paid KSh 500" }, data: { deepLink: "/hotel-staff/orders" } }));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("New order received");
    expect(shown[0].options.body).toBe("A student paid KSh 500");
    expect(shown[0].options.icon).toBe("/logo192.png");
    expect(shown[0].options.data.deepLink).toBe("/hotel-staff/orders");
  });

  test("tells every open window a push arrived (so the bell badge updates live)", async () => {
    const win = { postMessage: jest.fn() };
    const { listeners } = loadWorker({ windows: [win, win] });
    await fire(listeners, "push", pushEvent({ notification: { title: "t", body: "b" }, data: {} }));
    expect(win.postMessage).toHaveBeenCalledWith({ type: "mealvest:push-received" });
    expect(win.postMessage).toHaveBeenCalledTimes(2);
  });

  test("falls back to a default title and the app root; ignores empty or malformed payloads", async () => {
    const a = loadWorker();
    await fire(a.listeners, "push", pushEvent({}));
    expect(a.shown[0].title).toBe("MEALVEST");
    expect(a.shown[0].options.data.deepLink).toBe("/");
    const b = loadWorker();
    await fire(b.listeners, "push", { data: null });
    await fire(b.listeners, "push", { data: { json: () => { throw new Error("not json"); } } });
    expect(b.shown).toHaveLength(0);
  });

  test("a malicious deep link in the payload is neutralised to the app root", async () => {
    for (const evil of ["//evil.com/phish", "https://evil.com", "javascript:alert(1)", "/\\evil.com", 42, null]) {
      const { listeners, shown } = loadWorker();
      await fire(listeners, "push", pushEvent({ notification: { title: "t", body: "b" }, data: { deepLink: evil } }));
      expect(shown[0].options.data.deepLink).toBe("/");
    }
  });
});

describe("service worker — notification click", () => {
  test("app already open: focuses it and asks it to navigate IN-APP (no hard reload)", async () => {
    const win = { focus: jest.fn().mockResolvedValue(undefined), postMessage: jest.fn(), navigate: jest.fn() };
    const { listeners, opened } = loadWorker({ windows: [win] });
    const evt = clickEvent("/hotel-staff/orders");
    await fire(listeners, "notificationclick", evt);
    expect(evt.notification.close).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.postMessage).toHaveBeenCalledWith({ type: "mealvest:navigate", path: "/hotel-staff/orders" });
    expect(win.navigate).not.toHaveBeenCalled();
    expect(opened).toHaveLength(0);
  });

  test("app closed: opens a new window at the absolute same-origin deep link", async () => {
    const { listeners, opened } = loadWorker({ windows: [] });
    await fire(listeners, "notificationclick", clickEvent("/hotel-owner/orders"));
    expect(opened).toEqual(["https://mealvest.co.ke/hotel-owner/orders"]);
  });

  test("a tampered notification can never open or navigate off-origin", async () => {
    const win = { focus: jest.fn().mockResolvedValue(undefined), postMessage: jest.fn() };
    const open = loadWorker({ windows: [win] });
    await fire(open.listeners, "notificationclick", clickEvent("//evil.com"));
    expect(win.postMessage).toHaveBeenCalledWith({ type: "mealvest:navigate", path: "/" });
    const closed = loadWorker({ windows: [] });
    await fire(closed.listeners, "notificationclick", clickEvent("https://evil.com"));
    expect(closed.opened).toEqual(["https://mealvest.co.ke/"]);
  });
});
