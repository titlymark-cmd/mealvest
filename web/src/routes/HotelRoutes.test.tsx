import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HotelStaffRoutes } from "./HotelStaffRoutes";
import { HotelOwnerRoutes } from "./HotelOwnerRoutes";
import { AdminRoutes } from "./AdminRoutes";

let mockWidth = 1200;
jest.mock("../hooks/useWindowSize", () => ({ useWindowSize: () => ({ width: mockWidth, height: 800 }) }));
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ logout: jest.fn(), authFetch: jest.fn(), user: { id: "u", role: "x" } }) }));
jest.mock("../assets/mealvest-logo.png", () => "logo.png");
jest.mock("../components/notifications/NotificationBell", () => ({ NotificationBell: () => <button aria-label="Notifications bell" /> }));
jest.mock("../components/account/VerificationBanner", () => ({ VerificationBanner: ({ to }: { to: string }) => <a href={to}>verify-banner</a> }));

// a hoisted function declaration (not a const) so the jest.mock factories below can call it while imports load
function mockStub(name: string) {
  return { __esModule: true, default: () => <div>{name}</div> };
}
jest.mock("../pages/hotelStaff/HotelStaffHomeScreen", () => mockStub("STAFF HOME SCREEN"));
jest.mock("../pages/hotelStaff/HotelStaffSettingsScreen", () => mockStub("STAFF SETTINGS SCREEN"));
jest.mock("../pages/hotel/HotelScannerScreen", () => mockStub("SCANNER SCREEN"));
jest.mock("../pages/hotel/HotelOrdersScreen", () => mockStub("STAFF ORDERS SCREEN"));
jest.mock("../pages/VerifyEmailScreen", () => ({ VerifyEmailScreen: () => <div>VERIFY EMAIL</div> }));
jest.mock("../pages/hotelOwner/HotelOwnerOverviewScreen", () => mockStub("OWNER OVERVIEW"));
jest.mock("../pages/hotelOwner/HotelOwnerOrdersScreen", () => mockStub("OWNER ORDERS"));
jest.mock("../pages/hotelOwner/HotelMenuManageScreen", () => mockStub("OWNER MENU"));
jest.mock("../pages/hotelOwner/HotelStudentsScreen", () => mockStub("OWNER STUDENTS"));
jest.mock("../pages/hotelOwner/HotelOwnerEarningsScreen", () => mockStub("OWNER EARNINGS"));
jest.mock("../pages/hotelOwner/HotelProfileScreen", () => mockStub("OWNER PROFILE"));
jest.mock("../pages/hotelOwner/HotelStaffManageScreen", () => mockStub("OWNER STAFF SCREEN"));
jest.mock("../pages/hotelOwner/HotelSecurityScreen", () => mockStub("OWNER SECURITY SCREEN"));
jest.mock("../pages/admin/AdminOverviewScreen", () => mockStub("ADMIN OVERVIEW"));
jest.mock("../pages/admin/AdminAnalyticsScreen", () => mockStub("ADMIN ANALYTICS"));
jest.mock("../pages/admin/AdminHotelsScreen", () => mockStub("ADMIN HOTELS"));
jest.mock("../pages/admin/AdminStudentsScreen", () => mockStub("ADMIN STUDENTS"));
jest.mock("../pages/admin/AdminOrdersScreen", () => mockStub("ADMIN ORDERS"));
jest.mock("../pages/admin/AdminPaymentsScreen", () => mockStub("ADMIN PAYMENTS"));
jest.mock("../pages/admin/AdminNotificationsScreen", () => mockStub("ADMIN NOTIFICATIONS"));
jest.mock("../pages/admin/AdminPayoutsScreen", () => mockStub("ADMIN PAYOUTS"));
jest.mock("../pages/admin/AdminSecurityScreen", () => mockStub("ADMIN SECURITY SCREEN"));
jest.mock("../components/admin/AdminSidebar", () => ({ AdminSidebar: () => <nav>admin sidebar</nav>, ADMIN_MOBILE_BREAKPOINT: 768, ADMIN_SIDEBAR_WIDTH: 240 }));

const at = (ui: React.ReactElement, path: string) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("hotel STAFF routes", () => {
  beforeEach(() => { mockWidth = 1200; });

  test("home, orders and settings sit inside the staff shell (nav + bell + verification nudge)", () => {
    for (const [path, screenText] of [["/hotel-staff/home", "STAFF HOME SCREEN"], ["/hotel-staff/orders", "STAFF ORDERS SCREEN"], ["/hotel-staff/settings", "STAFF SETTINGS SCREEN"]]) {
      const { unmount } = at(<HotelStaffRoutes />, path);
      expect(screen.getByText(screenText)).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: /staff navigation/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /notifications bell/i })).toBeInTheDocument();
      expect(screen.getByText("verify-banner")).toHaveAttribute("href", "/hotel-staff/settings");
      unmount();
    }
  });

  test("the scanner is full-screen (no shell covering the camera)", () => {
    at(<HotelStaffRoutes />, "/hotel-staff/scanner");
    expect(screen.getByText("SCANNER SCREEN")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  test("staff can't reach ANY owner screen — owner URLs fall back to the staff home", () => {
    for (const p of ["/hotel-owner/staff", "/hotel-owner/security", "/hotel-owner/menu", "/hotel-owner/earnings", "/hotel-owner/students", "/hotel-owner/profile", "/admin/home"]) {
      const { unmount } = at(<HotelStaffRoutes />, p);
      expect(screen.getByText("STAFF HOME SCREEN")).toBeInTheDocument();
      expect(screen.queryByText(/OWNER|ADMIN/)).not.toBeInTheDocument();
      unmount();
    }
  });

  test("the email-verification link still lands on the confirm screen", () => {
    at(<HotelStaffRoutes />, "/verify-email?token=abc");
    expect(screen.getByText("VERIFY EMAIL")).toBeInTheDocument();
  });
});

describe("hotel OWNER routes", () => {
  test("the new Staff and Security screens live inside the owner shell; the existing screens are untouched", () => {
    mockWidth = 1200;
    for (const [path, text] of [
      ["/hotel-owner/staff", "OWNER STAFF SCREEN"], ["/hotel-owner/security", "OWNER SECURITY SCREEN"],
      ["/hotel-owner/home", "OWNER OVERVIEW"], ["/hotel-owner/orders", "OWNER ORDERS"], ["/hotel-owner/menu", "OWNER MENU"],
      ["/hotel-owner/earnings", "OWNER EARNINGS"], ["/hotel-owner/students", "OWNER STUDENTS"], ["/hotel-owner/profile", "OWNER PROFILE"],
    ]) {
      const { unmount } = at(<HotelOwnerRoutes />, path);
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByText("verify-banner")).toHaveAttribute("href", "/hotel-owner/security");
      unmount();
    }
  });

  test("desktop sidebar lists all screens including Staff and Security, in a sensible order", () => {
    mockWidth = 1200;
    at(<HotelOwnerRoutes />, "/hotel-owner/home");
    const labels = within(screen.getByRole("navigation", { name: "Hotel navigation" })).getAllByRole("link").map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Overview", "Orders", "Menu", "Earnings", "Students", "Staff", "Profile", "Security"]);
  });

  test("phone: the daily tabs are unchanged; Staff and Security are reachable from More", async () => {
    mockWidth = 390;
    at(<HotelOwnerRoutes />, "/hotel-owner/home");
    const bar = screen.getByRole("navigation", { name: "Hotel navigation" });
    expect(within(bar).queryByText("Staff")).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole("button", { name: /more/i }));
    const dialog = await screen.findByRole("dialog");
    for (const l of ["Earnings", "Students", "Staff", "Profile", "Security"]) expect(within(dialog).getByRole("link", { name: l })).toBeInTheDocument();
  });
});

describe("admin routes", () => {
  test("admins get an Account & security screen reachable from the header on every screen size", () => {
    mockWidth = 390;
    at(<AdminRoutes />, "/admin/security");
    expect(screen.getByText("ADMIN SECURITY SCREEN")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /account and security/i })).toHaveAttribute("href", "/admin/security");
    expect(screen.getByText("verify-banner")).toHaveAttribute("href", "/admin/security");
  });
});
