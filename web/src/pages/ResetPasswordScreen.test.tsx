import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ResetPasswordScreen } from "./ResetPasswordScreen";

const mockLogout = jest.fn().mockResolvedValue(undefined);
let mockUser: unknown = null;
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: mockUser, logout: mockLogout }) }));

const fetchMock = jest.fn();
beforeEach(() => {
  mockUser = null;
  mockLogout.mockClear();
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
});
const ok = () => ({ ok: true, status: 200, json: async () => ({}) });
const bad = (code: string, message: string) => ({ ok: false, status: 400, json: async () => ({ error: { code, message } }) });

function open(search: string) {
  window.history.pushState({}, "", `/reset-password${search}`);
  return render(<MemoryRouter initialEntries={[`/reset-password${search}`]}><ResetPasswordScreen /></MemoryRouter>);
}
const fill = async (pw: string, confirm = pw) => {
  await userEvent.type(screen.getByPlaceholderText("New password"), pw);
  await userEvent.type(screen.getByPlaceholderText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /reset password|set password/i }));
};

describe("ResetPasswordScreen", () => {
  test("the secret token is removed from the address bar immediately, and the page asks not to leak a referrer", () => {
    const { unmount } = open("?token=SECRET123");
    expect(window.location.search).toBe("");
    expect(document.querySelector('meta[name="referrer"][content="no-referrer"]')).toBeTruthy();
    unmount();
    expect(document.querySelector('meta[name="referrer"]')).toBeNull();
  });

  test("still uses the captured token after the URL was cleaned", async () => {
    fetchMock.mockResolvedValue(ok());
    open("?token=SECRET123");
    await fill("a-good-password");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: "SECRET123", newPassword: "a-good-password" });
    expect(await screen.findByText(/password reset/i)).toBeInTheDocument();
  });

  test("a staff invitation (&invite=1) says 'set your password' and mentions the PIN", async () => {
    fetchMock.mockResolvedValue(ok());
    open("?token=T&invite=1");
    expect(screen.getByRole("heading", { name: /set your password/i })).toBeInTheDocument();
    await fill("a-good-password");
    expect(await screen.findByText(/create a 4-digit pin/i)).toBeInTheDocument();
  });

  test("no token (e.g. the page was reloaded) explains what to do instead of a blank form", () => {
    open("");
    expect(screen.getByText(/needs the link from your email/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("New password")).not.toBeInTheDocument();
  });

  test("validates locally: too short and mismatched never reach the server", async () => {
    open("?token=T");
    await fill("short");
    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText("New password"));
    await userEvent.clear(screen.getByPlaceholderText("Confirm new password"));
    await fill("long-enough-1", "long-enough-2");
    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an expired/used link says so, offers a new link (reset) or the owner (invite)", async () => {
    fetchMock.mockResolvedValue(bad("INVALID_RESET_TOKEN", "This reset link is invalid or has expired. Please request a new one."));
    const a = open("?token=T");
    await fill("a-good-password");
    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request a new link/i })).toBeInTheDocument();
    a.unmount();
    open("?token=T&invite=1");
    await fill("a-good-password");
    expect(await screen.findByText(/ask the hotel owner to resend/i)).toBeInTheDocument();
  });

  test("if someone is signed in on this device, this device is signed out after the reset (the server revoked all sessions)", async () => {
    mockUser = { id: "u1" };
    fetchMock.mockResolvedValue(ok());
    open("?token=T");
    await fill("a-good-password");
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  });
});
