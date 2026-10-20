import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WithdrawSavingsScreen from "./WithdrawSavingsScreen";

const mockAuthFetch = jest.fn();
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock("../../services/budgetApi", () => ({ getWithdrawalStatus: jest.fn(), requestWithdrawal: jest.fn() }));
jest.mock("../../services/studentProfileApi", () => ({ fetchStudentProfile: jest.fn() }));
jest.mock("../../components/GoogleSignInButton", () => ({ GoogleSignInButton: () => null }));

const unlocked = { locked: false, reason: null, availableSavings: "2000", feePercent: 10, feeAmount: 200, netAmount: 1800, latestWithdrawal: null };

beforeEach(() => {
  require("../../services/studentProfileApi").fetchStudentProfile.mockResolvedValue({ phone_number: "0712345678", has_pin: true, has_google: false });
});

const renderScreen = () => render(<MemoryRouter><WithdrawSavingsScreen /></MemoryRouter>);

describe("Withdraw savings", () => {
  it("shows the lock and no form while the plan is still running", async () => {
    require("../../services/budgetApi").getWithdrawalStatus.mockResolvedValue({ ...unlocked, locked: true, reason: "CONTRACT_ACTIVE", contractEndDate: "2099-01-01" });
    renderScreen();
    expect(await screen.findByText(/unlocks at the end of your plan/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/4-digit PIN/i)).toBeNull();
  });

  it("asks for confirmation before anything is sent, then sends PIN + fee acceptance", async () => {
    const budget = require("../../services/budgetApi");
    budget.getWithdrawalStatus.mockResolvedValue(unlocked);
    budget.requestWithdrawal.mockResolvedValue({ gross_savings: "2000", platform_fee_percent: 10, platform_fee_amount: "200", student_amount: "1800" });
    renderScreen();

    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.type(screen.getByLabelText(/4-digit PIN/i), "1234");
    await userEvent.click(screen.getByRole("button", { name: /withdraw ksh 1,800/i }));

    // nothing has gone to the server yet: the confirmation sheet is showing
    expect(budget.requestWithdrawal).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: /confirm/i }));

    await waitFor(() =>
      expect(budget.requestWithdrawal).toHaveBeenCalledWith(expect.anything(), { payoutMethod: "mpesa", payoutDestination: "0712345678", acceptFee: true, pin: "1234" })
    );
    expect(await screen.findByText(/withdrawal requested/i)).toBeInTheDocument();
  });

  it("blocks submission until the fee is accepted", async () => {
    const budget = require("../../services/budgetApi");
    budget.getWithdrawalStatus.mockResolvedValue(unlocked);
    renderScreen();
    await screen.findByRole("checkbox");
    await userEvent.type(screen.getByLabelText(/4-digit PIN/i), "1234");
    expect(screen.getByRole("button", { name: /withdraw ksh 1,800/i })).toBeDisabled();
    expect(budget.requestWithdrawal).not.toHaveBeenCalled();
  });
});
