import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

jest.mock("../services/pushNotifications", () => ({ disablePushOnThisDevice: jest.fn() }));

import { AuthProvider, useAuth } from "./AuthContext";

const TOKEN_KEY = "mealvest_refresh_token";
const USER = { id: "u1", role: "student", fullName: "Test Student", email: "t@example.com" };

let api: ReturnType<typeof jest.fn>;
let ctx: ReturnType<typeof useAuth>;

function Probe() {
  ctx = useAuth();
  return (
    <div>
      <span data-testid="state">{ctx.isLoading ? "loading" : ctx.isLocked ? "locked" : ctx.user ? "in" : "out"}</span>
    </div>
  );
}
const state = () => screen.getByTestId("state").textContent;

function setStandalone(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes("standalone"),
    media: q,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);
}
const calls = (path: string) => api.mock.calls.filter(([url]) => String(url).endsWith(path));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  api = jest.fn((url: string) => {
    if (url.endsWith("/api/auth/refresh")) return json(200, { accessToken: "a2", refreshToken: "r2", user: USER });
    if (url.endsWith("/api/auth/pin/verify")) return json(200, { accessToken: "a3", refreshToken: "r3", user: USER });
    if (url.endsWith("/api/auth/logout")) return json(200, {});
    return json(404, {});
  });
  (global as unknown as { fetch: unknown }).fetch = api;
});

const mount = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

describe("PWA PIN lock", () => {
  it("logged out: no stored session is just 'out', never 'locked'", async () => {
    setStandalone(true);
    mount();
    await waitFor(() => expect(state()).toBe("out"));
  });

  it("reopened installed PWA with a stored session opens LOCKED, without calling the server or clearing the session", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    mount();
    await waitFor(() => expect(state()).toBe("locked"));
    expect(ctx.user).toBeNull();
    expect(ctx.accessToken).toBeNull();
    expect(calls("/api/auth/refresh")).toHaveLength(0);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("r1"); // not logged out
  });

  it("a new ordinary browser tab restores silently (no PIN prompt)", async () => {
    setStandalone(false);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    mount();
    await waitFor(() => expect(state()).toBe("in"));
    expect(calls("/api/auth/refresh")).toHaveLength(1);
  });

  it("a reload of an already-unlocked installed window does not ask again", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    window.sessionStorage.setItem("mealvest_unlocked_window", "1");
    window.sessionStorage.setItem("mealvest_hidden_at", String(Date.now() - 2000));
    mount();
    await waitFor(() => expect(state()).toBe("in"));
  });

  it("an unlocked window backgrounded past the timeout opens locked", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    window.sessionStorage.setItem("mealvest_unlocked_window", "1");
    window.sessionStorage.setItem("mealvest_hidden_at", String(Date.now() - 10 * 60 * 1000));
    mount();
    await waitFor(() => expect(state()).toBe("locked"));
  });

  it("correct PIN restores the session via the server and rotates the stored token", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    mount();
    await waitFor(() => expect(state()).toBe("locked"));
    await act(async () => {
      await ctx.unlockWithPin("1234");
    });
    expect(state()).toBe("in");
    const [, init] = calls("/api/auth/pin/verify")[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ refreshToken: "r1", pin: "1234" });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("r3");
    // the PIN itself is never persisted
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain("1234");
  });

  it("wrong PIN stays locked, keeps the session and surfaces the server message", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    api.mockImplementation((url: string) =>
      url.endsWith("/api/auth/pin/verify")
        ? json(401, { error: { code: "PIN_INCORRECT", message: "Incorrect PIN. 3 attempts left." } })
        : json(404, {})
    );
    mount();
    await waitFor(() => expect(state()).toBe("locked"));
    await act(async () => {
      await expect(ctx.unlockWithPin("0000")).rejects.toMatchObject({ code: "PIN_INCORRECT", message: "Incorrect PIN. 3 attempts left." });
    });
    expect(state()).toBe("locked");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("r1");
  });

  it("an expired/revoked session during unlock falls back to the normal logged-out flow", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    api.mockImplementation((url: string) =>
      url.endsWith("/api/auth/pin/verify") ? json(401, { error: { code: "INVALID_REFRESH_TOKEN", message: "Session expired. Please log in again." } }) : json(404, {})
    );
    mount();
    await waitFor(() => expect(state()).toBe("locked"));
    await act(async () => {
      await expect(ctx.unlockWithPin("1234")).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
    });
    expect(state()).toBe("out");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("an account with no PIN does not get stuck: it restores through the normal refresh and stops locking", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    api.mockImplementation((url: string) => {
      if (url.endsWith("/api/auth/pin/verify")) return json(400, { error: { code: "PIN_NOT_SET", message: "No PIN has been set for this account yet." } });
      if (url.endsWith("/api/auth/refresh")) return json(200, { accessToken: "a2", refreshToken: "r2", user: USER });
      return json(404, {});
    });
    mount();
    await waitFor(() => expect(state()).toBe("locked"));
    await act(async () => {
      await ctx.unlockWithPin("1234");
    });
    expect(state()).toBe("in");
    expect(window.localStorage.getItem("mealvest_pin_lock")).toBe("0");
  });

  it("lockApp locks a live session without logging out", async () => {
    setStandalone(false);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    mount();
    await waitFor(() => expect(state()).toBe("in"));
    act(() => ctx.lockApp());
    expect(state()).toBe("locked");
    expect(ctx.user).toBeNull();
    expect(window.localStorage.getItem(TOKEN_KEY)).not.toBeNull();
    expect(calls("/api/auth/logout")).toHaveLength(0);
  });

  it("explicit logout while locked revokes the session and clears all lock state", async () => {
    setStandalone(true);
    window.localStorage.setItem(TOKEN_KEY, "r1");
    mount();
    await waitFor(() => expect(state()).toBe("locked"));
    await act(async () => {
      await ctx.logout();
    });
    expect(state()).toBe("out");
    expect(calls("/api/auth/logout")).toHaveLength(1);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
