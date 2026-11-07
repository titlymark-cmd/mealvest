import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationSettingsSection } from "./NotificationSettingsSection";
import { makeFetch } from "../../testUtils/http";

let mockAuthFetch: ReturnType<typeof makeFetch>;
let mockPush: any;
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock("../../hooks/usePushControl", () => ({ usePushControl: () => mockPush }));

const prefs = { push_enabled: false, sms_enabled: false, meal_reminders: true, payment_updates: true, wallet_alerts: true, announcements: true, security_alerts: true, reminder_time: "12:00:00" };
const push = (over: Record<string, unknown> = {}) => ({ status: "off", explanation: null, availability: { state: "ready", permission: "default" }, busy: false, error: null, turnOn: jest.fn(), turnOff: jest.fn(), ...over });

beforeEach(() => {
  mockPush = push();
  mockAuthFetch = makeFetch({ "GET /api/notifications/preferences": () => ({ body: { preferences: prefs } }) });
});

describe("student NotificationSettingsSection — push row", () => {
  test("is a real, working switch now (no 'Coming soon' badge)", async () => {
    render(<NotificationSettingsSection />);
    await screen.findByText("Push notifications");
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("switch")[0]);
    expect(mockPush.turnOn).toHaveBeenCalledTimes(1);
  });

  test("when push can't work here it says why instead of showing a dead switch", async () => {
    mockPush = push({ status: "unavailable", explanation: "On iPhone and iPad, notifications only work once MEALVEST is added to your Home Screen (iOS 16.4 or later)." });
    render(<NotificationSettingsSection />);
    expect(await screen.findByText(/added to your Home Screen/i)).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  test("the test button reports reality, never a blanket 'Test sent'", async () => {
    mockAuthFetch = makeFetch({
      "GET /api/notifications/preferences": () => ({ body: { preferences: prefs } }),
      "POST /api/notifications/test": () => ({ body: { sent: false, push: { status: "skipped", devices: 0, delivered: 0, reason: "No registered devices" }, sms: "skipped" } }),
    });
    render(<NotificationSettingsSection />);
    await userEvent.click(await screen.findByRole("button", { name: /send a test notification/i }));
    expect(await screen.findByText(/no device is registered for push/i)).toBeInTheDocument();
    expect(screen.queryByText(/test sent/i)).not.toBeInTheDocument();
  });
});
