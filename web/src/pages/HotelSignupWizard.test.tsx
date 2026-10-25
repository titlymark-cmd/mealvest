import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockRegisterHotel = jest.fn();
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ registerHotel: mockRegisterHotel }) }));

import { HotelSignupWizard } from "./HotelSignupWizard";

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole("button", { name: /continue|start registration|submit registration/i }));

/** Walks steps 1-4 (…settlement) and stops on the payout-schedule step. */
function reachPayoutStep() {
  render(<HotelSignupWizard onSwitchToLogin={() => {}} />);
  next(); // 1 -> 2
  type(/business name/i, "Mama Lucy's");
  next(); // 2 -> 3
  type(/owner's full name/i, "Lucy Owner");
  type(/email address/i, "lucy@example.com");
  type(/^phone number/i, "0712345678");
  next(); // 3 -> 4
  type(/till number/i, "123456");
  type(/name registered on the till/i, "Lucy Till");
  next(); // 4 -> 5 (payout schedule)
}

beforeEach(() => {
  mockRegisterHotel.mockReset();
  localStorage.clear();
});

test("the payout-mode screen appears immediately AFTER the settlement screen", () => {
  render(<HotelSignupWizard onSwitchToLogin={() => {}} />);
  next(); type(/business name/i, "X"); next();
  type(/owner's full name/i, "O"); type(/email address/i, "o@example.com"); type(/^phone number/i, "0712345678"); next();
  expect(screen.getByRole("heading", { name: /how do you get paid/i })).toBeInTheDocument();
  type(/till number/i, "1"); type(/name registered on the till/i, "T"); next();
  expect(screen.getByRole("heading", { name: /when do you want to be paid/i })).toBeInTheDocument();
  expect(screen.getByText(/Step 5 of 7/i)).toBeInTheDocument();
});

test("Instant is the default, shows its 15% default and hides the time selector", () => {
  reachPayoutStep();
  expect(screen.getByRole("radio", { name: /instant payout/i })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/Default MEALVEST commission: 15%/)).toBeInTheDocument();
  expect(screen.getByText(/Default MEALVEST commission: 10%/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/daily payout time/i)).not.toBeInTheDocument();
});

test("Daily requires a valid time before continuing", () => {
  reachPayoutStep();
  fireEvent.click(screen.getByRole("radio", { name: /daily payout/i }));
  expect(screen.getByLabelText(/daily payout time/i)).toBeInTheDocument();
  next();
  expect(screen.getByRole("alert")).toHaveTextContent(/choose the time/i);
  expect(screen.getByRole("heading", { name: /when do you want to be paid/i })).toBeInTheDocument();
  type(/daily payout time/i, "21:00");
  expect(screen.getByText(/every day at 9:00 PM/i)).toBeInTheDocument();
  next();
  expect(screen.getByRole("heading", { name: /secure your account/i })).toBeInTheDocument();
});

async function finish() {
  type(/^password/i, "Password123!");
  fireEvent.change(screen.getByLabelText(/4-digit pin/i), { target: { value: "1234" } });
  next(); // -> review
  next(); // submit
}

test("registration sends the daily config (and no commission) and keeps the settlement", async () => {
  mockRegisterHotel.mockResolvedValue(undefined);
  reachPayoutStep();
  fireEvent.click(screen.getByRole("radio", { name: /daily payout/i }));
  type(/daily payout time/i, "21:00");
  next();
  await finish();
  await waitFor(() => expect(mockRegisterHotel).toHaveBeenCalledTimes(1));
  const body = mockRegisterHotel.mock.calls[0][0];
  expect(body.payout).toEqual({ mode: "daily", payoutTime: "21:00" });
  expect(JSON.stringify(body)).not.toMatch(/commission/i);
  expect(body.settlement).toMatchObject({ method: "mpesa_till", tillNumber: "123456" });
});

test("Instant registration sends no payout time", async () => {
  mockRegisterHotel.mockResolvedValue(undefined);
  reachPayoutStep();
  next();
  await finish();
  await waitFor(() => expect(mockRegisterHotel).toHaveBeenCalledTimes(1));
  expect(mockRegisterHotel.mock.calls[0][0].payout).toEqual({ mode: "instant" });
});

test("a failed submission shows the error, keeps everything, and can be retried", async () => {
  mockRegisterHotel.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);
  reachPayoutStep();
  fireEvent.click(screen.getByRole("radio", { name: /daily payout/i }));
  type(/daily payout time/i, "08:30");
  next();
  await finish();
  await screen.findByText(/couldn't submit your registration/i);
  next(); // retry from the same review screen
  await waitFor(() => expect(mockRegisterHotel).toHaveBeenCalledTimes(2));
  expect(mockRegisterHotel.mock.calls[1][0].payout).toEqual({ mode: "daily", payoutTime: "08:30" });
});

test("going back from the payout screen returns to settlement with its values intact", () => {
  reachPayoutStep();
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
  expect(screen.getByRole("heading", { name: /how do you get paid/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/till number/i)).toHaveValue("123456");
});
