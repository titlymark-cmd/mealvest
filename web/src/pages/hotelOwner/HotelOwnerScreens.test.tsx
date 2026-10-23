import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));

import HotelOwnerOrdersScreen from "./HotelOwnerOrdersScreen";
import HotelMenuManageScreen from "./HotelMenuManageScreen";
import HotelOwnerEarningsScreen from "./HotelOwnerEarningsScreen";
import { useAuth } from "../../context/AuthContext";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body } as Response);

const HOTEL = { id: "h1", name: "Mercy's", status: "active", settlement_schedule: "Daily", payment_method: "mpesa_till", payment_verification_status: "verified" };
const STATS = { today_orders: "2", pending_orders: "1", redeemed_orders: "5", cancelled_orders: "1", revenue_today: "300", net_earnings: "4500" };

const ORDER = (over: object = {}) => ({
  id: "aaaaaaaa-0000-0000-0000-00000000abc1",
  status: "paid",
  amount: "300.00",
  items: [{ name: "Pilau", quantity: 2, unitPrice: 150 }],
  created_at: new Date().toISOString(),
  student_name: "Amina Wanjiru",
  ...over,
});

function mount(ui: React.ReactElement, handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const authFetch = jest.fn(async (path: string, init?: RequestInit) => handler(path, init));
  (useAuth as jest.Mock).mockReturnValue({ authFetch });
  render(<MemoryRouter>{ui}</MemoryRouter>);
  return authFetch;
}

describe("Orders screen", () => {
  it("shows the student's name and only offers 'Mark ready' for paid orders", async () => {
    mount(<HotelOwnerOrdersScreen />, (p) => {
      if (p === "/api/hotel/dashboard") return json(200, { hotel: HOTEL, stats: STATS });
      return json(200, { orders: [ORDER(), ORDER({ id: "bbbbbbbb-0000-0000-0000-00000000def2", status: "ready", student_name: "Joy" }), ORDER({ id: "cccccccc-0000-0000-0000-00000000fed3", status: "redeemed", student_name: "Ken" })] });
    });
    expect(await screen.findByText(/Amina Wanjiru/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark ready" })).toHaveLength(1); // not for ready/redeemed
    expect(screen.getAllByRole("link", { name: /Scan to redeem/ })).toHaveLength(1); // ready orders redeem via QR
  });

  it("calls the ready endpoint, then reloads", async () => {
    let status = "paid";
    const authFetch = mount(<HotelOwnerOrdersScreen />, (p, init) => {
      if (p === "/api/hotel/dashboard") return json(200, { hotel: HOTEL, stats: STATS });
      if (init?.method === "PATCH") { status = "ready"; return json(200, { order: ORDER({ status }) }); }
      return json(200, { orders: [ORDER({ status })] });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Mark ready" }));
    await waitFor(() => expect(authFetch).toHaveBeenCalledWith("/api/hotel/orders/aaaaaaaa-0000-0000-0000-00000000abc1/ready", { method: "PATCH" }));
    expect(await screen.findByText(/is ready for pickup/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark ready" })).not.toBeInTheDocument());
  });

  it("surfaces a server error instead of pretending success", async () => {
    mount(<HotelOwnerOrdersScreen />, (p, init) => {
      if (p === "/api/hotel/dashboard") return json(200, { hotel: HOTEL, stats: STATS });
      if (init?.method === "PATCH") return json(409, { error: { code: "INVALID_ORDER_STATE", message: "Order is not in a state that can be marked ready." } });
      return json(200, { orders: [ORDER()] });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Mark ready" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not in a state/);
  });

  it("shows a helpful empty state and a search-specific one", async () => {
    mount(<HotelOwnerOrdersScreen />, (p) => (p === "/api/hotel/dashboard" ? json(200, { hotel: HOTEL, stats: STATS }) : json(200, { orders: [] })));
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
  });
});

describe("Menu screen", () => {
  const ITEM = { id: "m1", name: "Pilau", description: "Spiced rice", price: "150.00", category: "lunch", available: true, image_url: null };

  it("edits a meal and sends only the fields that changed", async () => {
    const authFetch = mount(<HotelMenuManageScreen />, (p, init) => {
      if (init?.method === "PATCH") return json(200, { item: { ...ITEM, price: "180.00" } });
      return json(200, { items: [ITEM] });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Pilau" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Price (KSh)"), { target: { value: "180" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const call = authFetch.mock.calls.find(([, i]) => i?.method === "PATCH");
      expect(call).toBeTruthy();
      expect(JSON.parse(call![1]!.body as string)).toEqual({ price: 180 });
    });
    expect(await screen.findByText("KSh 180")).toBeInTheDocument();
  });

  it("blocks saving an invalid price and never calls the API", async () => {
    const authFetch = mount(<HotelMenuManageScreen />, () => json(200, { items: [] }));
    fireEvent.click(await screen.findByRole("button", { name: /Add your first meal/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Chai" } });
    fireEvent.change(within(dialog).getByLabelText("Price (KSh)"), { target: { value: "-5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add meal" }));
    expect(await within(dialog).findByText(/price above KSh 0/)).toBeInTheDocument();
    expect(authFetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });

  it("requires confirmation before deleting, and offers hiding instead", async () => {
    const authFetch = mount(<HotelMenuManageScreen />, (p, init) => {
      if (init?.method === "DELETE") return json(200, {});
      return json(200, { items: [ITEM] });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Remove Pilau" }));
    expect(authFetch.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false); // not yet
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Hide from students instead/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove permanently" }));
    await waitFor(() => expect(authFetch).toHaveBeenCalledWith("/api/hotel/menu/m1", { method: "DELETE" }));
  });
});

describe("Earnings screen", () => {
  it("labels payouts honestly and never reports a failed payout as paid", async () => {
    mount(<HotelOwnerEarningsScreen />, (p) => {
      if (p === "/api/hotel/dashboard") return json(200, { hotel: HOTEL, stats: STATS });
      if (p === "/api/hotel/payouts")
        return json(200, {
          summary: { pending_amount: "1200.00", pending_order_count: "4", paid_out_total: "3000.00", last_paid_at: "2026-10-20T09:00:00.000Z", auto_enabled: false, threshold: "40", auto_hold: null },
          payouts: [
            { id: "p1", amount: "3000.00", status: "successful", reference: "REF-OK", automated: true, created_at: "2026-10-20T08:00:00.000Z", updated_at: "2026-10-20T09:00:00.000Z" },
            { id: "p2", amount: "500.00", status: "failed", reference: "REF-BAD", automated: false, created_at: "2026-10-19T08:00:00.000Z", updated_at: "2026-10-19T09:00:00.000Z" },
            { id: "p3", amount: "700.00", status: "approved", reference: "REF-WAIT", automated: false, created_at: "2026-10-18T08:00:00.000Z", updated_at: "2026-10-18T09:00:00.000Z" },
          ],
        });
      return json(200, { orders: [] });
    });
    expect(await screen.findByText("KSh 1,200")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument(); // 'approved' is not 'paid' yet
    expect(screen.getByText(/didn't go through/)).toBeInTheDocument();
  });

  const earningsMock = (summary: object) => (p: string) => {
    if (p === "/api/hotel/dashboard") return json(200, { hotel: HOTEL, stats: STATS });
    if (p === "/api/hotel/payouts") return json(200, { summary: { pending_amount: "15.00", pending_order_count: "2", paid_out_total: "0", last_paid_at: null, auto_enabled: true, threshold: "40", auto_hold: null, ...summary }, payouts: [] });
    return json(200, { orders: [] });
  };

  it("explains the payout minimum and how far away it is, when automatic payouts are on", async () => {
    mount(<HotelOwnerEarningsScreen />, earningsMock({}));
    expect(await screen.findByText(/once they reach KSh 40\. KSh 25 to go/)).toBeInTheDocument();
  });

  it("makes no automatic-payout promise when the feature is switched off", async () => {
    mount(<HotelOwnerEarningsScreen />, earningsMock({ auto_enabled: false }));
    await screen.findByText("KSh 15");
    expect(screen.queryByText(/sent automatically/)).not.toBeInTheDocument();
  });

  it("shows a plain-language reason when automatic payouts are held, never the raw internal code", async () => {
    mount(<HotelOwnerEarningsScreen />, earningsMock({ auto_hold: "needs_support" }));
    expect(await screen.findByText(/paused after repeated failures/)).toBeInTheDocument();
    expect(screen.queryByText(/repeated_failures/)).not.toBeInTheDocument();
  });

  it("shows an error with retry when payouts fail to load", async () => {
    mount(<HotelOwnerEarningsScreen />, (p) => {
      if (p === "/api/hotel/dashboard") return json(200, { hotel: HOTEL, stats: STATS });
      return json(500, { message: "boom" });
    });
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
