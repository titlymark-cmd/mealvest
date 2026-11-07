import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotelNotificationSettings } from "./HotelNotificationSettings";
import { makeFetch } from "../../testUtils/http";

let mockAuthFetch: ReturnType<typeof makeFetch>;
let mockPush: any;
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock("../../hooks/usePushControl", () => ({ usePushControl: () => mockPush }));

const prefs = { push_enabled: true, sms_enabled: false, meal_reminders: true, payment_updates: true, wallet_alerts: true, announcements: true, security_alerts: true, reminder_time: "12:00:00" };
const push = (over: Record<string, unknown> = {}) => ({
  status: "off", explanation: null, availability: { state: "ready", permission: "default" }, busy: false, error: null, turnOn: jest.fn(), turnOff: jest.fn(), ...over,
});

beforeEach(() => {
  mockPush = push();
  mockAuthFetch = makeFetch({ "GET /api/notifications/preferences": () => ({ body: { preferences: prefs } }) });
});

describe("HotelNotificationSettings", () => {
  test("shows only what a hotel account can receive — never student-only categories", async () => {
    render(<HotelNotificationSettings />);
    expect(await screen.findByText("Orders & redemptions")).toBeInTheDocument();
    expect(screen.getByText("Announcements")).toBeInTheDocument();
    expect(screen.getByText("Security alerts")).toBeInTheDocument();
    expect(screen.queryByText(/meal reminders/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wallet alerts/i)).not.toBeInTheDocument();
  });

  test("push off → the switch asks to turn on; push on → it asks to turn off", async () => {
    render(<HotelNotificationSettings />);
    await screen.findByText("Orders & redemptions");
    const sw = screen.getAllByRole("switch")[0];
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(mockPush.turnOn).toHaveBeenCalledTimes(1);
  });
  test("push on", async () => {
    mockPush = push({ status: "on" });
    render(<HotelNotificationSettings />);
    await screen.findByText("Orders & redemptions");
    const sw = screen.getAllByRole("switch")[0];
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sw);
    expect(mockPush.turnOff).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["unavailable", "On iPhone and iPad, notifications only work once MEALVEST is added to your Home Screen"],
    ["blocked", "Notifications are blocked for this site."],
  ])("when push is %s there's no dead switch — just the honest reason", async (status, explanation) => {
    mockPush = push({ status, explanation });
    render(<HotelNotificationSettings />);
    expect(await screen.findByText(new RegExp(explanation.slice(0, 40)))).toBeInTheDocument();
    await screen.findByText("Orders & redemptions"); // preferences have loaded
    // only the 3 category switches remain
    expect(screen.getAllByRole("switch")).toHaveLength(3);
  });

  test("a category toggle saves with the server's field name; a failed save reverts and says so", async () => {
    const patches: unknown[] = [];
    let fail = false;
    mockAuthFetch = makeFetch({
      "GET /api/notifications/preferences": () => ({ body: { preferences: prefs } }),
      "PATCH /api/notifications/preferences": (init) => {
        patches.push(JSON.parse(String(init?.body)));
        return fail ? { status: 500, body: { error: { message: "Could not save" } } } : { body: { preferences: { ...prefs, payment_updates: false } } };
      },
    });
    render(<HotelNotificationSettings />);
    await screen.findByText("Orders & redemptions");
    const orders = screen.getAllByRole("switch")[1];
    await userEvent.click(orders);
    await waitFor(() => expect(patches).toEqual([{ paymentUpdates: false }]));
    await waitFor(() => expect(orders).toHaveAttribute("aria-checked", "false"));
    fail = true;
    await userEvent.click(screen.getAllByRole("switch")[2]); // announcements
    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("switch")[2]).toHaveAttribute("aria-checked", "true"));
  });

  test("test notification reports the truth", async () => {
    let result: any = { sent: true, push: { status: "sent", devices: 1, delivered: 1 }, sms: "skipped" };
    mockAuthFetch = makeFetch({
      "GET /api/notifications/preferences": () => ({ body: { preferences: prefs } }),
      "POST /api/notifications/test": () => ({ body: result }),
    });
    render(<HotelNotificationSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /send test/i }));
    expect(await screen.findByText(/sent to 1 device/i)).toBeInTheDocument();
    result = { sent: false, push: { status: "skipped", devices: 0, delivered: 0, reason: "No registered devices" }, sms: "skipped" };
    await userEvent.click(screen.getByRole("button", { name: /send test/i }));
    expect(await screen.findByText(/no device is registered for push/i)).toBeInTheDocument();
    result = { sent: false, push: { status: "skipped", devices: 0, delivered: 0, reason: "Push not configured" }, sms: "skipped" };
    await userEvent.click(screen.getByRole("button", { name: /send test/i }));
    expect(await screen.findByText(/aren't set up on the server yet/i)).toBeInTheDocument();
  });

  test("a push error from the hook is surfaced", async () => {
    mockPush = push({ error: "Notifications are blocked. Allow them in your browser's site settings." });
    render(<HotelNotificationSettings />);
    expect(await screen.findByText(/allow them in your browser's site settings/i)).toBeInTheDocument();
  });
});
