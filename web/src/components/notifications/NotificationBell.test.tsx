import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";

const mockAuthFetch = jest.fn();
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock("../../services/pushNotifications", () => ({ onForegroundPush: jest.fn() }));
jest.mock("../../services/notificationsApi", () => ({
  fetchUnreadCount: jest.fn(),
  fetchNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

// CRA runs jest with resetMocks, so implementations are (re)installed per test.
beforeEach(() => {
  require("../../services/pushNotifications").onForegroundPush.mockResolvedValue(() => {});
  const api = require("../../services/notificationsApi");
  api.fetchUnreadCount.mockResolvedValue(2);
  api.fetchNotifications.mockResolvedValue([
    { id: "n1", type: "payment", title: "Payment received", body: "Your top-up went through.", deep_link: null, read: false, created_at: new Date().toISOString() },
  ]);
});

function setPhone(isPhone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isPhone && query.includes("max-width: 767px"),
    media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const renderBell = (mobileHref?: string) =>
  render(
    <MemoryRouter initialEntries={["/student/home"]}>
      <Routes>
        <Route path="/student/home" element={<NotificationBell mobileHref={mobileHref} />} />
        <Route path="/student/notifications" element={<div>NOTIFICATIONS PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("NotificationBell responsive behaviour", () => {
  it("on phones, navigates to the notifications page instead of opening a dropdown", async () => {
    setPhone(true);
    renderBell("/student/notifications");
    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    expect(await screen.findByText("NOTIFICATIONS PAGE")).toBeInTheDocument();
  });

  it("on desktop, keeps the dropdown", async () => {
    setPhone(false);
    renderBell("/student/notifications");
    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    expect(await screen.findByText("Payment received")).toBeInTheDocument();
    expect(screen.queryByText("NOTIFICATIONS PAGE")).toBeNull();
  });

  it("shells without a dedicated page (admin, hotel owner) keep the dropdown even on phones", async () => {
    setPhone(true);
    renderBell(undefined);
    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    expect(await screen.findByText("Payment received")).toBeInTheDocument();
  });
});
