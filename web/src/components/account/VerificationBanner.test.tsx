import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { VerificationBanner } from "./VerificationBanner";
import { makeFetch } from "../../testUtils/http";

let mockAuthFetch: ReturnType<typeof makeFetch>;
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch, user: { id: "u1" } }) }));

const st = (over: Record<string, unknown> = {}) => ({ email: "a@b.test", emailVerified: false, emailVerifiedAt: null, phoneNumber: null, phoneVerified: false, authProvider: "password", emailDeliveryAvailable: true, smsDeliveryAvailable: true, resendCooldownSeconds: 60, ...over });
const setup = (over: Record<string, unknown> = {}, skin: "hotel" | "student" = "hotel") => {
  mockAuthFetch = makeFetch({ "GET /api/auth/verification-status": () => ({ body: st(over) }) });
  return render(<MemoryRouter><VerificationBanner skin={skin} to="/hotel-staff/settings" /></MemoryRouter>);
};

beforeEach(() => sessionStorage.clear());

describe("VerificationBanner", () => {
  test.each(["hotel", "student"] as const)("%s skin: nudges toward the settings screen and never sends anything itself", async (skin) => {
    setup({}, skin);
    const link = await screen.findByRole("link", { name: /verify/i });
    expect(link).toHaveAttribute("href", "/hotel-staff/settings");
    expect(mockAuthFetch.calls.map((c) => c.key)).toEqual(["GET /api/auth/verification-status"]);
  });

  test("hidden once the email is verified, and hidden when email can't be delivered anyway", async () => {
    const a = setup({ emailVerified: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("link", { name: /verify/i })).not.toBeInTheDocument();
    a.unmount();
    setup({ emailDeliveryAvailable: false });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("link", { name: /verify/i })).not.toBeInTheDocument();
  });

  test("'Later' dismisses it for the rest of the session — including after a remount — without any request", async () => {
    const a = setup();
    await userEvent.click(await screen.findByRole("button", { name: /later/i }));
    expect(screen.queryByRole("link", { name: /verify/i })).not.toBeInTheDocument();
    a.unmount();
    setup();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("link", { name: /verify/i })).not.toBeInTheDocument();
    expect(mockAuthFetch.calls).toHaveLength(0); // dismissed before any status call
  });

  test("a failing status call just shows nothing", async () => {
    mockAuthFetch = makeFetch({ "GET /api/auth/verification-status": () => ({ status: 500, body: {} }) });
    render(<MemoryRouter><VerificationBanner skin="hotel" to="/x" /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
