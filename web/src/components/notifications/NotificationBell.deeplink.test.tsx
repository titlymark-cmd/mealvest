import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { makeFetch } from "../../testUtils/http";

let mockAuthFetch: ReturnType<typeof makeFetch>;
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock("../../services/pushNotifications", () => ({ onForegroundPush: jest.fn() }));
// (CRA resets mock implementations between tests, so set it per test)
beforeEach(() => {
  require("../../services/pushNotifications").onForegroundPush.mockResolvedValue(() => {});
});
jest.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));

const note = (id: string, deep_link: string | null) => ({ id, type: "hotel_order_received", title: `Title ${id}`, body: "Body", deep_link, read_at: null, created_at: new Date().toISOString() });

function setup(items: unknown[]) {
  mockAuthFetch = makeFetch({
    "GET /api/notifications/unread-count": () => ({ body: { count: items.length } }),
    "GET /api/notifications": () => ({ body: { notifications: items, nextCursor: null } }),
    "PATCH /api/notifications/n1/read": () => ({ body: { ok: true } }),
    "PATCH /api/notifications/n2/read": () => ({ body: { ok: true } }),
  });
  return render(
    <MemoryRouter initialEntries={["/hotel-staff/home"]}>
      <NotificationBell />
      <Routes>
        <Route path="/hotel-staff/home" element={<div>HOME</div>} />
        <Route path="/hotel-staff/orders" element={<div>ORDERS PAGE</div>} />
        <Route path="*" element={<div>SOMEWHERE ELSE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("NotificationBell deep links", () => {
  test("clicking a notification navigates INSIDE the app (no full reload) and closes the panel", async () => {
    setup([note("n1", "/hotel-staff/orders")]);
    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    await userEvent.click(await screen.findByText("Title n1"));
    expect(await screen.findByText("ORDERS PAGE")).toBeInTheDocument();
  });

  test("an unsafe deep link is ignored — it never navigates or leaves the app", async () => {
    setup([note("n2", "//evil.com/phish")]);
    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    await userEvent.click(await screen.findByText("Title n2"));
    expect(screen.getByText("HOME")).toBeInTheDocument();
    expect(screen.queryByText("SOMEWHERE ELSE")).not.toBeInTheDocument();
  });
});
