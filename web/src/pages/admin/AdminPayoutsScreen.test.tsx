import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPayoutsScreen, { PAYOUT_POLL_MS } from "./AdminPayoutsScreen";

const mockAuthFetch = jest.fn();
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));

const payout = (over: Record<string, unknown> = {}) => ({
  id: "p1", hotel_id: "h1", hotel_name: "Mama Ngina's", amount: "60.00", status: "processing", provider: "cyzora",
  transfer_reference: "PO-1", recipient_code: null, transfer_code: "po_abc", failure_reason: null,
  automated: true, needs_attention: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
});
const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

function serve(opts: { payouts: () => unknown[]; hotels?: unknown[] }) {
  mockAuthFetch.mockImplementation((path: string) => {
    if (path === "/api/admin/payouts/pending") return json({ hotels: opts.hotels ?? [], threshold_kes: 40, auto_payouts_enabled: true });
    if (path === "/api/admin/payouts") return json({ payouts: opts.payouts() });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAuthFetch.mockReset();
});
afterEach(() => jest.useRealTimers());

describe("Admin payouts monitoring", () => {
  it("a payout that finishes after the page loaded moves from processing to successful WITHOUT a reload", async () => {
    let status = "processing";
    serve({ payouts: () => [payout({ status })] });
    render(<AdminPayoutsScreen />);
    expect(await screen.findByText("processing")).toBeInTheDocument();

    status = "successful"; // the provider webhook lands server-side
    await act(async () => { jest.advanceTimersByTime(PAYOUT_POLL_MS + 50); });
    expect(await screen.findByText("successful")).toBeInTheDocument();
    expect(screen.queryByText("processing")).toBeNull();
  });

  it("stops polling once nothing is in flight", async () => {
    serve({ payouts: () => [payout({ status: "successful" })] });
    render(<AdminPayoutsScreen />);
    await screen.findByText("successful");
    const calls = mockAuthFetch.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(PAYOUT_POLL_MS * 3); });
    expect(mockAuthFetch.mock.calls.length).toBe(calls);
  });

  it("shows automatic marker, provider reference, reconciliation label, and filters", async () => {
    serve({ payouts: () => [payout({ id: "a", status: "unknown", needs_attention: true, failure_reason: "Outcome unknown: timeout" }), payout({ id: "b", status: "failed", hotel_name: "Other Hotel", failure_reason: "Invalid destination" })] });
    render(<AdminPayoutsScreen />);
    expect(await screen.findByText("needs reconciliation")).toBeInTheDocument();
    expect(screen.getAllByText(/provider ref po_abc/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/automatic/).length).toBeGreaterThan(0);
    userEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(screen.queryByText("needs reconciliation")).toBeNull();
    expect(screen.getByText("Other Hotel")).toBeInTheDocument();
  });

  it("a below-threshold hotel shows as accumulating and cannot be paid out manually", async () => {
    serve({
      payouts: () => [],
      hotels: [{ hotel_id: "h9", hotel_name: "Small Hotel", payment_method: "send_money", payment_details: null, pending_amount: "27.00", pending_order_count: "2", payout_supported: true, below_threshold: true, auto_payout_blocked_reason: null }],
    });
    render(<AdminPayoutsScreen />);
    expect(await screen.findByText(/accumulating; pays automatically at KSh 40/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay out/i })).toBeDisabled();
  });
});
