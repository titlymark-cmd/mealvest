import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MealBoostScreen from "./MealBoostScreen";

jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: jest.fn(), user: { email: "s@uni.ac.ke" } }) }));
jest.mock("../../services/paymentsApi", () => ({ initializeBoostPayment: jest.fn() }));
jest.mock("../../hooks/usePaymentStatusPoll", () => ({ usePaymentStatusPoll: jest.fn() }));

const start = jest.fn();
beforeEach(() => {
  require("../../hooks/usePaymentStatusPoll").usePaymentStatusPoll.mockReturnValue({ status: "idle", error: null, start });
  require("../../services/paymentsApi").initializeBoostPayment.mockResolvedValue({ reference: "REF123", displayText: "Enter your PIN" });
});

const renderScreen = () => render(<MemoryRouter><MealBoostScreen /></MemoryRouter>);

describe("Meal Boost", () => {
  it("rejects a bad phone number without calling the payment API", async () => {
    renderScreen();
    await userEvent.type(screen.getByLabelText(/M-Pesa phone number/i), "0712");
    await userEvent.click(screen.getByRole("button", { name: /boost my plan/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid phone number/i);
    expect(require("../../services/paymentsApi").initializeBoostPayment).not.toHaveBeenCalled();
  });

  it("quick amounts fill the field and show as pressed", async () => {
    renderScreen();
    const preset = screen.getByRole("button", { name: "KSh 1,000" });
    await userEvent.click(preset);
    expect(preset).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/how much/i)).toHaveValue("1000");
  });

  it("starts the verified payment flow and waits for the phone prompt", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "KSh 1,000" }));
    await userEvent.type(screen.getByLabelText(/M-Pesa phone number/i), "0712345678");
    await userEvent.click(screen.getByRole("button", { name: /boost my plan/i }));
    expect(await screen.findByText("Check your phone")).toBeInTheDocument();
    expect(require("../../services/paymentsApi").initializeBoostPayment).toHaveBeenCalledWith(expect.anything(), { amount: 1000, phone: "0712345678", email: "s@uni.ac.ke" });
    expect(start).toHaveBeenCalledWith("REF123");
  });
});
