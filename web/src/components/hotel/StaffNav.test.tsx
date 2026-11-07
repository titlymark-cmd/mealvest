import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { StaffNav } from "./StaffNav";

let mockWidth = 1200;
const mockLogout = jest.fn();
jest.mock("../../hooks/useWindowSize", () => ({ useWindowSize: () => ({ width: mockWidth, height: 800 }) }));
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ logout: mockLogout }) }));
jest.mock("../../assets/mealvest-logo.png", () => "logo.png");

const hrefs = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

describe("StaffNav", () => {
  beforeEach(() => mockLogout.mockClear());

  test("desktop: only staff destinations + scan + log out — nothing owner-only", async () => {
    mockWidth = 1200;
    render(<MemoryRouter initialEntries={["/hotel-staff/home"]}><StaffNav /></MemoryRouter>);
    expect(hrefs().sort()).toEqual(["/hotel-staff/home", "/hotel-staff/orders", "/hotel-staff/scanner", "/hotel-staff/settings"]);
    expect(hrefs().some((h) => h?.startsWith("/hotel-owner"))).toBe(false);
    for (const owner of ["Menu", "Earnings", "Students", "Staff", "Profile", "Security"]) expect(screen.queryByRole("link", { name: owner })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  test("phone: a four-item tab bar with a raised Scan button", () => {
    mockWidth = 390;
    render(<MemoryRouter initialEntries={["/hotel-staff/home"]}><StaffNav /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: /staff navigation/i })).toBeInTheDocument();
    expect(hrefs()).toEqual(["/hotel-staff/home", "/hotel-staff/orders", "/hotel-staff/scanner", "/hotel-staff/settings"]);
    expect(screen.getByRole("link", { name: /scan qr code/i })).toBeInTheDocument();
  });
});
