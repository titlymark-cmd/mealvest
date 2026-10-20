import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StudentPaymentsScreen from "./StudentPaymentsScreen";

const mockAuthFetch = jest.fn();
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock("../../assets/mealvest-logo.png", () => "logo.png");
jest.mock("../../services/budgetApi", () => ({ getActiveBudget: jest.fn(), getWithdrawalStatus: jest.fn(), listMyWithdrawals: jest.fn() }));
jest.mock("../../services/paymentsApi", () => ({ listMyPayments: jest.fn() }));

// CRA runs jest with resetMocks, so implementations are (re)installed per test.
beforeEach(() => {
  const budget = require("../../services/budgetApi");
  budget.getActiveBudget.mockResolvedValue({
    id: "b1", hotel_id: "h1", total_amount: "5000", remaining_amount: "2450.00", amount_spent: "2550",
    daily_allowance: "350", number_of_days: 14, start_date: "", end_date: "", status: "active", remainingDays: 7,
    spent_today: "100", banked_amount: "75", pending_tomorrow_amount: "0", pending_rollover_amount: "0", last_spend_date: null,
  });
  budget.getWithdrawalStatus.mockResolvedValue({ locked: true, reason: "CONTRACT_ACTIVE", feePercent: 10, latestWithdrawal: null });
  budget.listMyWithdrawals.mockResolvedValue([]);
  require("../../services/paymentsApi").listMyPayments.mockResolvedValue([
    { id: "p1", type: "plan_boost", amount: "500", status: "success", provider: "paystack", provider_reference: "REF1",
      provider_channel: "stk_push", number_of_days: null, result_description: null, created_at: "2026-10-01T10:00:00Z", updated_at: "", hotel_name: null },
  ]);
});

const renderPage = () => render(<MemoryRouter><StudentPaymentsScreen /></MemoryRouter>);

describe("Wallet balance privacy", () => {
  it("hides every monetary figure on open, reveals on request, and hides again", async () => {
    renderPage();
    const show = await screen.findByRole("button", { name: /show wallet amounts/i });

    // hidden by default: the real values are not in the DOM at all
    expect(screen.queryByText("2,450")).toBeNull();
    expect(screen.queryByText(/KSh 75/)).toBeNull();
    expect(screen.queryByText(/\+KSh 500/)).toBeNull();
    expect(show).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(show);
    expect(await screen.findByText("2,450")).toBeInTheDocument();
    expect(screen.getByText("KSh 75")).toBeInTheDocument();
    expect(screen.getByText(/\+KSh 500/)).toBeInTheDocument();

    const hide = screen.getByRole("button", { name: /hide wallet amounts/i });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hide);
    await waitFor(() => expect(screen.queryByText("2,450")).toBeNull());
  });
});
