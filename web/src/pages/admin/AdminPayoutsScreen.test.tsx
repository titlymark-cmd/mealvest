import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPayoutsScreen, { PAYOUT_POLL_MS } from "./AdminPayoutsScreen";

const mockAuthFetch = jest.fn();
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));

const payout = (over: Record<string, unknown> = {}) => ({
  id: "p1", hotel_id: "h1", hotel_name: "Mama Ngina's", amount: "60.00", status: "processing", provider: "cyzora",
  payout_fee_amount: "6.67", provider_fee_amount: null, provider_fee_status: "unknown", provider_fee_shortfall_amount: null, mealvest_net_amount: null,
  transfer_reference: "PO-1", recipient_code: null, transfer_code: "po_abc", failure_reason: null,
  automated: true, needs_attention: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
});
const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const financialSummary = {
  total_hotel_payouts: "0.00",
  total_mealvest_commission: "0.00",
  total_confirmed_cyzora_fees: "0.00",
  mealvest_net_confirmed: "0.00",
  unknown_provider_fee_payout_count: 0,
};

function serve(opts: { payouts: () => unknown[]; hotels?: unknown[]; summary?: typeof financialSummary }) {
  mockAuthFetch.mockImplementation((path: string) => {
    if (path === "/api/admin/payouts/pending") return json({ hotels: opts.hotels ?? [], threshold_kes: 40, auto_payouts_enabled: true });
    if (path === "/api/admin/payouts") return json({ payouts: opts.payouts(), financialSummary: opts.summary ?? financialSummary });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAuthFetch.mockReset();
  (window as any).confirm = jest.fn(() => true);
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
    expect(screen.getByText(/Invalid destination/)).toBeInTheDocument();
  });

  it("a below-threshold hotel shows as accumulating and cannot be paid out manually", async () => {
    serve({
      payouts: () => [],
      hotels: [{ hotel_id: "h9", hotel_name: "Small Hotel", payment_method: "send_money", payment_details: null, pending_amount: "27.00", pending_order_count: "2", payout_supported: true, below_threshold: true, auto_payout_blocked_reason: null }],
    });
    render(<AdminPayoutsScreen />);
    expect(await screen.findByText(/below KSh 40, carries forward/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay out/i })).toBeDisabled();
  });

  it("clicking Pay out triggers the admin manual payout API", async () => {
    mockAuthFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/admin/payouts/pending") return json({ hotels: [{ hotel_id: "h7", hotel_name: "Manual Hotel", payment_method: "send_money", payment_details: null, pending_amount: "60.00", pending_order_count: "3", payout_supported: true, below_threshold: false, auto_payout_blocked_reason: null }], threshold_kes: 40, auto_payouts_enabled: true });
      if (path === "/api/admin/payouts") return json({ payouts: [], financialSummary });
      if (path === "/api/admin/payouts/trigger") return json({ payout: payout({ id: "p2", hotel_id: "h7", hotel_name: "Manual Hotel", amount: "60.00", status: "processing" }) });
      return Promise.reject(new Error(`unexpected ${path}`));
    });

    render(<AdminPayoutsScreen />);
    const button = await screen.findByRole("button", { name: /pay out/i });
    await userEvent.click(button);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/admin/payouts/trigger", expect.objectContaining({ method: "POST" }));
  });

  it("shows a confirmed fee, negative Mealvest net, shortfall, and the full hotel amount", async () => {
    serve({
      payouts: () => [
        payout({
          amount: "90.00",
          payout_fee_amount: "10.00",
          provider_fee_amount: "21.37",
          provider_fee_status: "confirmed",
          provider_fee_shortfall_amount: "11.37",
          mealvest_net_amount: "-11.37",
          status: "successful",
        }),
      ],
    });
    render(<AdminPayoutsScreen />);
    expect(await screen.findByText("Hotel payout: KES 90.00")).toBeInTheDocument();
    expect(screen.getByText("Mealvest commission: KES 10.00")).toBeInTheDocument();
    expect(screen.getByText("Cyzora fee: KES 21.37 (actual)")).toBeInTheDocument();
    expect(screen.getByText("Mealvest net: -KES 11.37").style.color).toBeTruthy();
    const shortfall = screen.getByText("Provider-fee shortfall: KES 11.37");
    expect(shortfall).toBeInTheDocument();
    expect(shortfall.style.color).toBe("");
  });

  it("labels unavailable fees and net as unknown, not zero", async () => {
    serve({
      payouts: () => [payout({ provider_fee_status: "unknown", provider_fee_amount: null, mealvest_net_amount: null })],
      summary: { ...financialSummary, total_hotel_payouts: "90.00", total_mealvest_commission: "10.00", unknown_provider_fee_payout_count: 1 },
    });
    render(<AdminPayoutsScreen />);
    expect(await screen.findByText("Cyzora fee: Unknown (not confirmed)")).toBeInTheDocument();
    expect(screen.getByText("Mealvest net: Unknown")).toBeInTheDocument();
    expect(screen.getByText(/actual provider fees are unknown for 1 successful payout/i)).toBeInTheDocument();
  });

  it("reads Cyzora wallet balances only on request without triggering a payout", async () => {
    mockAuthFetch.mockImplementation((path: string) => {
      if (path === "/api/admin/payouts/pending") {
        return json({ hotels: [], threshold_kes: 40, auto_payouts_enabled: true });
      }
      if (path === "/api/admin/payouts") return json({ payouts: [], financialSummary });
      if (path === "/api/admin/payouts/cyzora-wallets") {
        return json({
          wallets: {
            collectionsKes: 360.74,
            collectionsPendingKes: 12,
            payoutsKes: 5.5,
            apiPayoutWallet: "collections",
          },
          checked_at: "2026-11-15T20:30:00.000Z",
        });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });

    render(<AdminPayoutsScreen />);
    await userEvent.click(await screen.findByRole("button", { name: /refresh balance/i }));

    expect(await screen.findByText("KES 360.74")).toBeInTheDocument();
    expect(screen.getByText("KES 12.00")).toBeInTheDocument();
    expect(screen.getByText("KES 5.50")).toBeInTheDocument();
    expect(screen.getByText("collections")).toBeInTheDocument();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/admin/payouts/cyzora-wallets");
    expect(mockAuthFetch).not.toHaveBeenCalledWith("/api/admin/payouts/trigger", expect.anything());
  });
});
