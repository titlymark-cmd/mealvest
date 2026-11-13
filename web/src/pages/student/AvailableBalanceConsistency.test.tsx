import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StudentHomeScreen from "./StudentHomeScreen";
import StudentPaymentsScreen from "./StudentPaymentsScreen";
import StudentMenuScreen from "./StudentMenuScreen";

const mockAuthFetch = jest.fn();
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch, user: { fullName: "Amina Test" } }) }));
jest.mock("../../assets/mealvest-logo.png", () => "logo.png");
jest.mock("../../services/budgetApi", () => ({ getActiveBudget: jest.fn(), getWithdrawalStatus: jest.fn(), listMyWithdrawals: jest.fn() }));
jest.mock("../../services/paymentsApi", () => ({ listMyPayments: jest.fn() }));
jest.mock("../../services/settingsApi", () => ({ fetchCustomerCarePhone: jest.fn() }));
jest.mock("../../services/hotelsApi", () => ({ fetchHotelMenu: jest.fn() }));
jest.mock("../../components/notifications/NotificationPermissionBanner", () => ({ NotificationPermissionBanner: () => null }));
jest.mock("../../components/student/HotelReviews", () => ({ HotelReviews: () => null }));

/**
 * Same student, same plan, three screens. The server says available_today is 200
 * (allowance 1,000 + carried 500 - spent 1,200 - held 100 = 200). The naive
 * frontend formulas the app used to carry would give 300 (ignoring the hold), so
 * seeing 200 everywhere proves the screens display the server figure and don't
 * re-derive money themselves.
 */
const SERVER_BUDGET = {
  id: "b1", hotel_id: "h1", total_amount: "3000", remaining_amount: "1800.00", amount_spent: "1200",
  daily_allowance: "1000", number_of_days: 3, start_date: "", end_date: "", status: "active", remainingDays: 2,
  spent_today: "1200", banked_amount: "500", pending_tomorrow_amount: "0", pending_rollover_amount: "0",
  last_spend_date: null, reserved_amount: "100",
  available_today: 200, free_plan_balance: 1700, carried_forward_amount: 500, held_amount: 100, today_total: 1500,
};

beforeEach(() => {
  const budget = require("../../services/budgetApi");
  budget.getActiveBudget.mockResolvedValue(SERVER_BUDGET);
  budget.getWithdrawalStatus.mockResolvedValue({ locked: true, reason: "CONTRACT_ACTIVE", feePercent: 10, latestWithdrawal: null });
  budget.listMyWithdrawals.mockResolvedValue([]);
  require("../../services/paymentsApi").listMyPayments.mockResolvedValue([]);
  require("../../services/settingsApi").fetchCustomerCarePhone.mockResolvedValue(null);
  require("../../services/hotelsApi").fetchHotelMenu.mockResolvedValue({
    hotel: { id: "h1", name: "Test Hotel", location: "Town", description: "", image_url: null },
    menu: [],
  });
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Available balance is the same server figure on Home, Wallet and Menu", () => {
  it("Home shows the server's available_today", async () => {
    wrap(<StudentHomeScreen />);
    expect(await screen.findByText("Available today")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.queryByText("300")).toBeNull();
  });

  it("Wallet shows the server's available_today", async () => {
    wrap(<StudentPaymentsScreen />);
    await userEvent.click(await screen.findByRole("button", { name: /show wallet amounts/i }));
    expect(await screen.findAllByText("KSh 200")).not.toHaveLength(0);
    expect(screen.queryByText("KSh 300")).toBeNull();
  });

  it("Menu shows the server's available_today", async () => {
    wrap(<StudentMenuScreen />);
    expect(await screen.findByText("KSh 200")).toBeInTheDocument();
    expect(screen.getByText(/left today/i)).toBeInTheDocument();
  });

  it("the retired 'move to tomorrow' control is gone from Home", async () => {
    wrap(<StudentHomeScreen />);
    await screen.findByText("Available today");
    expect(screen.queryByText(/move today's balance to tomorrow/i)).toBeNull();
  });
});
