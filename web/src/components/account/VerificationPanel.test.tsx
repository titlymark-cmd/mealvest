import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificationPanel } from "./VerificationPanel";
import { makeFetch } from "../../testUtils/http";

let mockAuthFetch: ReturnType<typeof makeFetch>;
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));

const status = (over: Record<string, unknown> = {}) => ({
  email: "owner@hotel.test",
  emailVerified: false,
  emailVerifiedAt: null,
  phoneNumber: "254712345678",
  phoneVerified: false,
  authProvider: "password",
  emailDeliveryAvailable: true,
  smsDeliveryAvailable: true,
  resendCooldownSeconds: 60,
  ...over,
});

describe.each(["hotel", "student"] as const)("VerificationPanel (%s skin)", (skin) => {
  test("shows the true status for both channels, and never sends anything by itself", async () => {
    mockAuthFetch = makeFetch({ "GET /api/auth/verification-status": () => ({ body: status() }) });
    render(<VerificationPanel skin={skin} />);
    expect(await screen.findByText(/owner@hotel\.test/)).toBeInTheDocument();
    expect(screen.getByText(/254712345678|text a 6-digit code/i)).toBeInTheDocument();
    expect(mockAuthFetch.calls.map((c) => c.key)).toEqual(["GET /api/auth/verification-status"]);
  });

  test("email: an explicit tap sends one request, then shows an honest 'check your inbox' and a resend countdown", async () => {
    mockAuthFetch = makeFetch({
      "GET /api/auth/verification-status": () => ({ body: status() }),
      "POST /api/auth/verify-email/request": () => ({ body: { sent: true, alreadyVerified: false, resendAfterSeconds: 60 } }),
    });
    render(<VerificationPanel skin={skin} />);
    await userEvent.click(await screen.findByRole("button", { name: /send link/i }));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(mockAuthFetch.count("POST /api/auth/verify-email/request")).toBe(1);
    expect(screen.getByRole("button", { name: /resend in \d+s/i })).toBeDisabled();
  });

  test("a delivery failure is shown as an error — never as 'sent'", async () => {
    mockAuthFetch = makeFetch({
      "GET /api/auth/verification-status": () => ({ body: status() }),
      "POST /api/auth/verify-email/request": () => ({ status: 502, body: { error: { code: "EMAIL_SEND_FAILED", message: "We couldn't send the email right now. Please try again in a few minutes." } } }),
    });
    render(<VerificationPanel skin={skin} />);
    await userEvent.click(await screen.findByRole("button", { name: /send link/i }));
    expect(await screen.findByText(/couldn't send the email right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send link/i })).toBeEnabled();
  });

  test("a server cooldown (429) turns into a visible countdown", async () => {
    mockAuthFetch = makeFetch({
      "GET /api/auth/verification-status": () => ({ body: status() }),
      "POST /api/auth/verify-email/request": () => ({ status: 429, body: { error: { code: "VERIFICATION_COOLDOWN", message: "Please wait 42 seconds before requesting another one." } } }),
    });
    render(<VerificationPanel skin={skin} />);
    await userEvent.click(await screen.findByRole("button", { name: /send link/i }));
    expect(await screen.findByRole("button", { name: /resend in 4\ds/i })).toBeDisabled();
  });

  test("when the server can't deliver email, the action is disabled with an explanation", async () => {
    mockAuthFetch = makeFetch({ "GET /api/auth/verification-status": () => ({ body: status({ emailDeliveryAvailable: false, smsDeliveryAvailable: false }) }) });
    render(<VerificationPanel skin={skin} />);
    expect(await screen.findByRole("button", { name: /send link/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send code/i })).toBeDisabled();
    expect(screen.getAllByText(/isn't available right now/i).length).toBeGreaterThanOrEqual(2);
  });

  test("phone: send code → enter it → server verdicts are shown → success refreshes status and notifies", async () => {
    let verified = false;
    const confirm = jest.fn();
    mockAuthFetch = makeFetch({
      "GET /api/auth/verification-status": () => ({ body: status({ phoneVerified: verified }) }),
      "POST /api/auth/verify-phone/request": () => ({ body: { sent: true, alreadyVerified: false, resendAfterSeconds: 60 } }),
      "POST /api/auth/verify-phone/confirm": (init) => {
        const { code } = JSON.parse(String(init?.body));
        confirm(code);
        if (code === "111111") return { status: 400, body: { error: { code: "INVALID_VERIFICATION_CODE", message: "That code is incorrect. 4 attempts left." } } };
        verified = true;
        return { body: { verified: true } };
      },
    });
    const onVerified = jest.fn();
    render(<VerificationPanel skin={skin} onVerified={onVerified} />);
    await userEvent.click(await screen.findByRole("button", { name: /send code/i }));
    const input = await screen.findByLabelText(/verification code/i);
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeDisabled();
    await userEvent.type(input, "11a1111");
    expect(input).toHaveValue("111111"); // digits only, max 6
    await userEvent.click(screen.getByRole("button", { name: /^verify$/i }));
    expect(await screen.findByText(/4 attempts left/i)).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "222222");
    await userEvent.click(screen.getByRole("button", { name: /^verify$/i }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenLastCalledWith("222222");
    await waitFor(() => expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument());
  });

  test("already verified: clear 'verified' state, no send buttons; no phone: says so and offers no code", async () => {
    mockAuthFetch = makeFetch({ "GET /api/auth/verification-status": () => ({ body: status({ emailVerified: true, phoneVerified: true }) }) });
    const { unmount } = render(<VerificationPanel skin={skin} />);
    await screen.findByText(/owner@hotel\.test/);
    expect(screen.queryByRole("button", { name: /send link|send code/i })).not.toBeInTheDocument();
    // both channels read as verified (a labelled check icon in the student skin, a pill in the hotel skin)
    expect(screen.queryAllByLabelText(/^verified$/i).length + screen.queryAllByText(/^verified$/i).length).toBe(2);
    expect(screen.queryByText(/not verified/i)).not.toBeInTheDocument();
    unmount();

    mockAuthFetch = makeFetch({ "GET /api/auth/verification-status": () => ({ body: status({ phoneNumber: null }) }) });
    render(<VerificationPanel skin={skin} />);
    expect(await screen.findByText(/no phone number on this account/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send code/i })).not.toBeInTheDocument();
  });

  test("a status-load failure is reported with a retry", async () => {
    let fail = true;
    mockAuthFetch = makeFetch({
      "GET /api/auth/verification-status": () => (fail ? { status: 500, body: { error: { message: "Server exploded" } } } : { body: status() }),
    });
    render(<VerificationPanel skin={skin} />);
    expect(await screen.findByText(/server exploded/i)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/owner@hotel\.test/)).toBeInTheDocument();
  });
});
