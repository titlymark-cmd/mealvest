import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BudgetOnboardingScreen from "./BudgetOnboardingScreen";

jest.mock("../../context/AuthContext", () => {
  const authFetch = jest.fn(); // stable identity, like the real provider
  return { useAuth: () => ({ authFetch, user: { email: "s@uni.ac.ke" } }) };
});
jest.mock("../../services/paymentsApi", () => ({
  initializePayment: jest.fn(),
  initializeCheckoutPayment: jest.fn(),
  getPaymentConfig: jest.fn(),
}));
jest.mock("../../hooks/usePaymentStatusPoll", () => ({ usePaymentStatusPoll: jest.fn() }));

const api = () => require("../../services/paymentsApi");
const start = jest.fn();
const stop = jest.fn();
const config = {
  provider: "paystack",
  hostedCheckoutAvailable: false,
  testMode: true,
  limits: { minAmount: 500, maxAmount: 50000, minDays: 1, maxDays: 90 },
  withdrawalFeePercent: 12,
};

beforeEach(() => {
  jest.clearAllMocks();
  require("../../hooks/usePaymentStatusPoll").usePaymentStatusPoll.mockReturnValue({ status: null, error: null, start, stop });
  api().getPaymentConfig.mockResolvedValue(config);
  api().initializePayment.mockResolvedValue({ reference: "REF123", displayText: "Enter your PIN" });
});

const renderScreen = async () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/student/budget-onboarding", state: { hotelId: "h1", hotelName: "Mama Rosa Kitchen" } }]}>
      <BudgetOnboardingScreen />
    </MemoryRouter>
  );
  // wait for the config so limit-based validation is active
  await screen.findByText(/You can start a plan with KSh 500/i);
};
const checkbox = () => screen.getByRole("checkbox", { name: /read and understand the Mealvest payment and contract terms/i });
const phoneField = () => screen.getByLabelText(/M-Pesa phone number/i);
const payButton = () => screen.getByRole("button", { name: /pay with m-pesa/i });

describe("terms checkbox", () => {
  it("starts unchecked (agreement is never assumed)", async () => {
    await renderScreen();
    expect(checkbox()).not.toBeChecked();
  });

  it("toggles when the box itself is clicked, and back again", async () => {
    await renderScreen();
    await userEvent.click(checkbox());
    expect(checkbox()).toBeChecked();
    await userEvent.click(checkbox());
    expect(checkbox()).not.toBeChecked();
  });

  it("toggles when its label text is clicked", async () => {
    await renderScreen();
    await userEvent.click(screen.getByText(/I have read and understand the Mealvest payment/i));
    expect(checkbox()).toBeChecked();
  });

  it("toggles with the keyboard (Space)", async () => {
    await renderScreen();
    checkbox().focus();
    await userEvent.keyboard(" ");
    expect(checkbox()).toBeChecked();
    await userEvent.keyboard(" ");
    expect(checkbox()).not.toBeChecked();
  });

  it("opening the full terms does not toggle it and opens in a new tab safely", async () => {
    await renderScreen();
    const link = screen.getByRole("link", { name: /read the full terms/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    await userEvent.click(link);
    expect(checkbox()).not.toBeChecked();
  });
});

describe("confirming the plan", () => {
  it("blocks submission until terms are accepted and explains why", async () => {
    await renderScreen();
    await userEvent.type(phoneField(), "0712345678");
    await userEvent.click(payButton());
    expect(await screen.findByText(/accept the Mealvest payment terms/i)).toBeInTheDocument();
    expect(checkbox()).toHaveAttribute("aria-invalid", "true");
    expect(checkbox()).toHaveFocus();
    expect(api().initializePayment).not.toHaveBeenCalled();
  });

  it("re-blocks submission if the student unchecks after accepting", async () => {
    await renderScreen();
    await userEvent.type(phoneField(), "0712345678");
    await userEvent.click(checkbox());
    await userEvent.click(checkbox());
    await userEvent.click(payButton());
    expect(api().initializePayment).not.toHaveBeenCalled();
    expect(await screen.findByText(/accept the Mealvest payment terms/i)).toBeInTheDocument();
  });

  it("clears the terms error as soon as the box is checked", async () => {
    await renderScreen();
    await userEvent.type(phoneField(), "0712345678");
    await userEvent.click(payButton());
    await screen.findByText(/accept the Mealvest payment terms/i);
    await userEvent.click(checkbox());
    expect(screen.queryByText(/accept the Mealvest payment terms/i)).not.toBeInTheDocument();
    expect(checkbox()).not.toHaveAttribute("aria-invalid");
  });

  it("enforces the server's limits (from /payments/config) per field", async () => {
    await renderScreen();
    const amount = screen.getByLabelText(/how much do you have/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, "100");
    const days = screen.getByLabelText(/how many days/i);
    await userEvent.clear(days);
    await userEvent.type(days, "120");
    await userEvent.type(phoneField(), "12345");
    await userEvent.click(checkbox());
    await userEvent.click(payButton());
    expect(await screen.findByText("Minimum plan amount is KSh 500.")).toBeInTheDocument();
    expect(screen.getByText(/exceed 90 days/i)).toBeInTheDocument();
    expect(screen.getByText(/valid Kenyan M-Pesa number/i)).toBeInTheDocument();
    expect(api().initializePayment).not.toHaveBeenCalled();
    expect(amount).toHaveFocus(); // first problem gets focus
  });

  it("sends the same request the backend expects and starts polling", async () => {
    await renderScreen();
    await userEvent.type(phoneField(), "0712345678");
    await userEvent.click(checkbox());
    await userEvent.click(payButton());
    expect(await screen.findByText("Check your phone")).toBeInTheDocument();
    expect(api().initializePayment).toHaveBeenCalledWith(expect.anything(), {
      amount: 5000,
      numberOfDays: 30,
      phone: "0712345678",
      email: "s@uni.ac.ke",
      hotelId: "h1",
      termsAccepted: true,
    });
    expect(start).toHaveBeenCalledWith("REF123");
  });

  it("ignores a rapid second tap while the first request is in flight", async () => {
    let resolve!: (v: any) => void;
    api().initializePayment.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderScreen();
    await userEvent.type(phoneField(), "0712345678");
    await userEvent.click(checkbox());
    const btn = payButton();
    await userEvent.dblClick(btn);
    resolve({ reference: "REF9", displayText: null });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(api().initializePayment).toHaveBeenCalledTimes(1);
  });

  it("returns to the form with the server's message if payment cannot start", async () => {
    api().initializePayment.mockRejectedValue(new Error("Minimum plan amount is KSh 500."));
    await renderScreen();
    await userEvent.type(phoneField(), "0712345678");
    await userEvent.click(checkbox());
    await userEvent.click(payButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Minimum plan amount/);
    expect(phoneField()).toHaveValue("0712345678"); // nothing the student typed is lost
    // and they can try again
    api().initializePayment.mockResolvedValue({ reference: "REF2", displayText: "ok" });
    await userEvent.click(payButton());
    expect(await screen.findByText("Check your phone")).toBeInTheDocument();
  });
});

describe("financial clarity", () => {
  it("shows the daily credit, total and length, using the same rounding as the server", async () => {
    await renderScreen();
    const summary = within(screen.getByRole("complementary", { name: /plan summary/i }));
    expect(summary.getByText("KSh 166.67/day")).toBeInTheDocument();
    expect(summary.getByText("30 days")).toBeInTheDocument();
    expect(summary.getByText("KSh 5,000")).toBeInTheDocument();
    expect(summary.getByText("Mama Rosa Kitchen")).toBeInTheDocument();
  });

  it("states the withdrawal fee the server reports, not a hardcoded figure", async () => {
    await renderScreen();
    expect(screen.getByText(/less a 12% MEALVEST fee/)).toBeInTheDocument();
    expect(screen.queryByText(/less a 10% MEALVEST fee/)).not.toBeInTheDocument();
  });

  it("works against an older server that exposes no limits or fee", async () => {
    api().getPaymentConfig.mockResolvedValue({ provider: "paystack", hostedCheckoutAvailable: false, testMode: true });
    render(
      <MemoryRouter initialEntries={[{ pathname: "/x", state: { hotelId: "h1", hotelName: "H" } }]}>
        <BudgetOnboardingScreen />
      </MemoryRouter>
    );
    expect(await screen.findByText(/less the MEALVEST withdrawal fee/)).toBeInTheDocument();
    await userEvent.type(phoneField(), "0712345678");
    await userEvent.click(checkbox());
    await userEvent.click(payButton());
    expect(await screen.findByText("Check your phone")).toBeInTheDocument();
  });
});

describe("summary never shows a figure for a plan that can't be bought", () => {
  it("shows dashes while the amount is below the server minimum", async () => {
    await renderScreen();
    const amount = screen.getByLabelText(/how much do you have/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, "100");
    const summary = within(screen.getByRole("complementary", { name: /plan summary/i }));
    expect(summary.queryByText(/\/day/)).not.toBeInTheDocument();
    expect(summary.queryByText("KSh 100")).not.toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, "3000");
    expect(summary.getByText("KSh 100/day")).toBeInTheDocument();
  });
});
