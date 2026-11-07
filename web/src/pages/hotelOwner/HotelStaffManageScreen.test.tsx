import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HotelStaffManageScreen from "./HotelStaffManageScreen";
import { makeFetch } from "../../testUtils/http";

let mockAuthFetch: ReturnType<typeof makeFetch>;
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch, user: { id: "owner-1", role: "hotel_owner" } }) }));

const member = (over: Record<string, unknown>) => ({
  userId: "x", fullName: "X", email: "x@h.test", phoneNumber: "254711000000", permissionLevel: "staff", status: "active",
  emailVerified: true, createdAt: "2026-10-01T08:00:00Z", activatedAt: "2026-10-01T09:00:00Z", deactivatedAt: null, redemptions: 0, ...over,
});
const OWNER = member({ userId: "owner-1", fullName: "Olive Owner", email: "olive@h.test", permissionLevel: "owner", status: "owner", redemptions: 4 });
const SAM = member({ userId: "s1", fullName: "Sam Staff", email: "sam@h.test", redemptions: 12 });
const INA = member({ userId: "s2", fullName: "Ina Invited", email: "ina@h.test", status: "invited", activatedAt: null, emailVerified: false });
const DAN = member({ userId: "s3", fullName: "Dan Gone", email: "dan@h.test", status: "deactivated", deactivatedAt: "2026-10-20T08:00:00Z" });

function setup(opts: { staff?: unknown[]; extra?: Record<string, any>; limit?: number } = {}) {
  let staff = opts.staff ?? [OWNER, SAM, INA, DAN];
  mockAuthFetch = makeFetch({
    "GET /api/hotel/staff": () => ({ body: { staff, limit: opts.limit ?? 20 } }),
    ...(opts.extra ?? {}),
  });
  return { setStaff: (s: unknown[]) => { staff = s; } };
}
const card = (name: string) => screen.getByRole("article", { name });

describe("HotelStaffManageScreen", () => {
  test("lists everyone with truthful status; the owner row has no destructive actions", async () => {
    setup();
    render(<HotelStaffManageScreen />);
    expect(await screen.findByText("Sam Staff")).toBeInTheDocument();
    expect(within(card("Sam Staff")).getByText("Active")).toBeInTheDocument();
    expect(within(card("Ina Invited")).getByText("Invite pending")).toBeInTheDocument();
    expect(within(card("Dan Gone")).getByText("Deactivated")).toBeInTheDocument();
    expect(within(card("Olive Owner")).getByText("Owner")).toBeInTheDocument();
    expect(within(card("Olive Owner")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(card("Sam Staff")).getByText(/12 meals redeemed/)).toBeInTheDocument();
    expect(within(card("Ina Invited")).getByRole("button", { name: /resend invite/i })).toBeInTheDocument();
    expect(within(card("Dan Gone")).getByRole("button", { name: /reactivate/i })).toBeInTheDocument();
    expect(screen.getByText(/1 active · 1 invited/)).toBeInTheDocument();
  });

  test("filters by status", async () => {
    setup();
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff");
    await userEvent.click(screen.getByRole("button", { name: /^Deactivated/ }));
    expect(screen.getByText("Dan Gone")).toBeInTheDocument();
    expect(screen.queryByText("Sam Staff")).not.toBeInTheDocument();
    expect(screen.queryByText("Olive Owner")).not.toBeInTheDocument();
  });

  test("empty state, and an error state with retry", async () => {
    setup({ staff: [OWNER] });
    const { unmount } = render(<HotelStaffManageScreen />);
    expect(await screen.findByText(/no staff yet/i)).toBeInTheDocument();
    unmount();
    let fail = true;
    mockAuthFetch = makeFetch({ "GET /api/hotel/staff": () => (fail ? { status: 500, body: { error: { message: "Nope" } } } : { body: { staff: [OWNER, SAM], limit: 20 } }) });
    render(<HotelStaffManageScreen />);
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Sam Staff")).toBeInTheDocument();
  });

  test("add staff: validates before calling the server, then sends trimmed details and confirms the invite", async () => {
    const created = jest.fn();
    setup({
      extra: {
        "POST /api/hotel/staff": (init: RequestInit) => {
          created(JSON.parse(String(init.body)));
          return { status: 201, body: { staff: member({ userId: "s9", fullName: "New Person", email: "new@h.test", status: "invited", activatedAt: null }), inviteSent: true } };
        },
      },
    });
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff"); // (the Add button is disabled while the list loads)
    await userEvent.click(screen.getByRole("button", { name: /add staff/i }));
    const dialog = await screen.findByRole("dialog");
    const send = within(dialog).getByRole("button", { name: /send invitation/i });

    await userEvent.type(within(dialog).getByLabelText(/full name/i), "N");
    await userEvent.click(send);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/full name/i);
    await userEvent.type(within(dialog).getByLabelText(/full name/i), "ew Person");
    await userEvent.type(within(dialog).getByLabelText(/^email/i), "not-an-email");
    await userEvent.click(send);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/valid email/i);
    await userEvent.clear(within(dialog).getByLabelText(/^email/i));
    await userEvent.type(within(dialog).getByLabelText(/^email/i), "  new@h.test ");
    await userEvent.type(within(dialog).getByLabelText(/phone/i), "123");
    await userEvent.click(send);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/phone/i);
    expect(created).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText(/phone/i));
    await userEvent.type(within(dialog).getByLabelText(/phone/i), "0712 345 678");
    await userEvent.click(send);
    await waitFor(() => expect(created).toHaveBeenCalledWith({ fullName: "New Person", email: "new@h.test", phoneNumber: "0712 345 678" }));
    expect(await screen.findByText(/invitation sent to new@h\.test/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockAuthFetch.count("GET /api/hotel/staff")).toBe(2); // list reloaded
  });

  test("the account exists but the email failed: an honest warning, not a success toast", async () => {
    setup({
      extra: {
        "POST /api/hotel/staff": () => ({ status: 201, body: { staff: member({ userId: "s9", fullName: "New Person", status: "invited", activatedAt: null }), inviteSent: false, inviteError: "The account was created, but we couldn't send the invitation email. Use “Resend invite” to try again." } }),
      },
    });
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff"); // (the Add button is disabled while the list loads)
    await userEvent.click(screen.getByRole("button", { name: /add staff/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/full name/i), "New Person");
    await userEvent.type(within(dialog).getByLabelText(/^email/i), "new@h.test");
    await userEvent.type(within(dialog).getByLabelText(/phone/i), "0712345678");
    await userEvent.click(within(dialog).getByRole("button", { name: /send invitation/i }));
    expect(await screen.findByText(/couldn't send the invitation email/i)).toBeInTheDocument();
    expect(screen.queryByText(/invitation sent to/i)).not.toBeInTheDocument();
  });

  test("server errors (duplicate account, unverified owner email) stay in the dialog so nothing is lost", async () => {
    setup({
      extra: {
        "POST /api/hotel/staff": () => ({ status: 409, body: { error: { code: "ACCOUNT_EXISTS", message: "An account with this email or phone number already exists." } } }),
      },
    });
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff"); // (the Add button is disabled while the list loads)
    await userEvent.click(screen.getByRole("button", { name: /add staff/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/full name/i), "Dup Person");
    await userEvent.type(within(dialog).getByLabelText(/^email/i), "dup@h.test");
    await userEvent.type(within(dialog).getByLabelText(/phone/i), "0712345678");
    await userEvent.click(within(dialog).getByRole("button", { name: /send invitation/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already exists/i);
    expect(within(dialog).getByLabelText(/full name/i)).toHaveValue("Dup Person");
  });

  test("deactivate asks first, explains the consequence, then calls the server and refreshes", async () => {
    const deactivate = jest.fn();
    const ctl = setup({
      extra: {
        "POST /api/hotel/staff/s1/deactivate": () => { deactivate(); ctl.setStaff([OWNER, { ...SAM, status: "deactivated" }]); return { body: { staff: { ...SAM, status: "deactivated" } } }; },
      },
    });
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff");
    await userEvent.click(within(card("Sam Staff")).getByRole("button", { name: /deactivate/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/signed out everywhere immediately/i);
    expect(deactivate).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));
    await waitFor(() => expect(deactivate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/sam staff can no longer sign in/i)).toBeInTheDocument();
    expect(within(card("Sam Staff")).getByText("Deactivated")).toBeInTheDocument();
  });

  test("cancelling the confirmation changes nothing", async () => {
    setup({ extra: { "POST /api/hotel/staff/s1/deactivate": () => { throw new Error("must not be called"); } } });
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff");
    await userEvent.click(within(card("Sam Staff")).getByRole("button", { name: /deactivate/i }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /cancel/i }));
    expect(mockAuthFetch.count("POST /api/hotel/staff/s1/deactivate")).toBe(0);
  });

  test("reactivate, and resend invite (with the server's cooldown message on failure)", async () => {
    const reactivate = jest.fn();
    let resendFails = true;
    setup({
      extra: {
        "POST /api/hotel/staff/s3/reactivate": () => { reactivate(); return { body: { staff: { ...DAN, status: "active" } } }; },
        "POST /api/hotel/staff/s2/resend-invite": () => (resendFails
          ? { status: 429, body: { error: { code: "INVITE_COOLDOWN", message: "An invitation was just sent. Please wait a minute before resending." } } }
          : { body: { inviteSent: true } }),
      },
    });
    render(<HotelStaffManageScreen />);
    await screen.findByText("Dan Gone");
    await userEvent.click(within(card("Ina Invited")).getByRole("button", { name: /resend invite/i }));
    expect(await screen.findByText(/please wait a minute/i)).toBeInTheDocument();
    resendFails = false;
    await userEvent.click(within(card("Ina Invited")).getByRole("button", { name: /resend invite/i }));
    expect(await screen.findByText(/re-sent to ina@h\.test/i)).toBeInTheDocument();

    await userEvent.click(within(card("Dan Gone")).getByRole("button", { name: /reactivate/i }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^reactivate$/i }));
    await waitFor(() => expect(reactivate).toHaveBeenCalledTimes(1));
  });

  test("at the staff limit the Add button is disabled", async () => {
    setup({ staff: [OWNER, SAM, INA], limit: 2 });
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff");
    expect(screen.getByRole("button", { name: /add staff/i })).toBeDisabled();
  });

  test("details dialog shows the person's real facts", async () => {
    setup();
    render(<HotelStaffManageScreen />);
    await screen.findByText("Sam Staff");
    await userEvent.click(within(card("Sam Staff")).getByRole("button", { name: /view sam staff/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("sam@h.test");
    expect(dialog).toHaveTextContent(/meals redeemed/i);
    expect(dialog).toHaveTextContent("12");
  });
});
