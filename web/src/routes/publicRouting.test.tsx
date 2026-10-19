import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Heavy / network-bound modules are stubbed; the routing + gating logic under test is real.
jest.mock("../pages/AuthScreen", () => ({ __esModule: true, default: ({ mode }: { mode: string }) => <div data-testid="auth">{mode}</div> }));
jest.mock("../pages/ForgotPasswordScreen", () => ({ ForgotPasswordScreen: () => null }));
jest.mock("../pages/ResetPasswordScreen", () => ({ ResetPasswordScreen: () => null }));
jest.mock("../pages/VerifyEmailScreen", () => ({ VerifyEmailScreen: () => null }));
jest.mock("../pages/PinGateScreen", () => ({ PinGateScreen: () => <div>pin-gate</div> }));
jest.mock("../pages/PinUnlockScreen", () => ({ PinUnlockScreen: () => <div>pin-unlock</div> }));
jest.mock("../pages/InstallScreen", () => ({ __esModule: true, default: () => null }));
jest.mock("../pages/demo/DemoScreen", () => ({ __esModule: true, default: () => null }));
jest.mock("../pages/TermsScreen", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/AnnouncementPopup", () => ({ AnnouncementPopup: () => null }));
jest.mock("./StudentRoutes", () => ({ StudentRoutes: () => <div>student-app</div> }));
jest.mock("./HotelStaffRoutes", () => ({ HotelStaffRoutes: () => <div>staff-app</div> }));
jest.mock("./HotelOwnerRoutes", () => ({ HotelOwnerRoutes: () => <div>owner-app</div> }));
jest.mock("./AdminRoutes", () => ({ AdminRoutes: () => <div>admin-app</div> }));
jest.mock("../services/publicHotels", () => {
  const actual = jest.requireActual("../services/publicHotels");
  return { ...actual, loadPublicHotels: jest.fn(), loadHotelMenuPreview: jest.fn(() => Promise.resolve([])) };
});
jest.mock("../services/hotelsApi", () => ({ ...jest.requireActual("../services/hotelsApi"), fetchHotelMenu: jest.fn() }));
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));

import { RootGate } from "./RootGate";
import { useAuth } from "../context/AuthContext";
import { loadPublicHotels, loadHotelMenuPreview } from "../services/publicHotels";
import { fetchHotelMenu } from "../services/hotelsApi";

const auth = (over: Record<string, unknown>) =>
  (useAuth as jest.Mock).mockReturnValue({ user: null, isLoading: false, pendingLogin: null, isLocked: false, ...over });

function setViewport(desktop: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("min-width: 768px") ? desktop : false,
    media: q,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}
const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <RootGate />
    </MemoryRouter>
  );

const HOTELS = [
  { id: "h1", name: "Caro Hives", location: "Juja", contact_phone: null, image_url: null, description: "Home cooking", review_count: 0, average_rating: null },
  { id: "h2", name: "Anne's Cafe", location: null, contact_phone: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  (window as unknown as { scrollTo?: unknown }).scrollTo = jest.fn();
  Element.prototype.scrollTo = jest.fn();
  setViewport(true);
  // CRA resets mock implementations between tests, so set them here.
  (loadPublicHotels as jest.Mock).mockResolvedValue(HOTELS);
  (loadHotelMenuPreview as jest.Mock).mockResolvedValue([]);
  auth({});
});

describe("logged-out routing", () => {
  it("shows the public landing page at / (not the login form)", async () => {
    at("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/food money, already planned/i);
    expect(screen.queryByTestId("auth")).toBeNull();
    expect(await screen.findByText("Caro Hives")).toBeInTheDocument();
  });

  it("nav links point at the existing flows", () => {
    at("/");
    const link = (name: RegExp, within = document.body) => within.querySelector(`a[href][class*="mvp-cta"]`) && screen.getAllByRole("link", { name }).map((a) => a.getAttribute("href"));
    expect(link(/^Login$/)).toContain("/login");
    expect(link(/^Sign Up$/)).toContain("/register/student");
    expect(link(/Register a Hotel/i)).toContain("/register/hotel");
    expect(screen.getAllByRole("link", { name: /^Hotels$/ })[0]).toHaveAttribute("href", "/hotels");
  });

  it("keeps /login, /register/student and /register/hotel on their own routes", () => {
    for (const [path, mode] of [["/login", "login"], ["/register/student", "register-student"], ["/register/hotel", "register-hotel"]]) {
      const { unmount } = at(path);
      expect(screen.getByTestId("auth")).toHaveTextContent(mode);
      unmount();
    }
  });

  it("sends a protected deep link to /login instead of the landing page", () => {
    at("/student/home");
    expect(screen.getByTestId("auth")).toHaveTextContent("login");
  });

  it("redirects the old /welcome URL to the landing page", () => {
    at("/welcome");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/food money/i);
  });
});

describe("demo section", () => {
  it("renders on tablet/desktop", () => {
    setViewport(true);
    at("/");
    expect(screen.getByRole("heading", { name: /see mealvest in motion/i })).toBeInTheDocument();
  });
  it("does not exist at all on phones (no heading, no container, no iframe)", () => {
    setViewport(false);
    const { container } = at("/");
    expect(screen.queryByRole("heading", { name: /see mealvest in motion/i })).toBeNull();
    expect(container.querySelector("#demo, .mvp-demo, iframe")).toBeNull();
    // ...while the other sections remain
    expect(screen.getByRole("heading", { name: /five steps/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /where you can eat/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /clearer spending/i })).toBeInTheDocument();
  });
});

describe("hotels pages", () => {
  it("lists real hotels, filters client-side, and shows the no-results state", async () => {
    at("/hotels");
    expect(await screen.findByText("Caro Hives")).toBeInTheDocument();
    expect(screen.getByText("Anne's Cafe")).toBeInTheDocument();
    const box = screen.getByRole("searchbox");
    box.focus();
    await (await import("@testing-library/user-event")).default.type(box, "juja");
    expect(screen.queryByText("Anne's Cafe")).toBeNull();
    await (await import("@testing-library/user-event")).default.clear(box);
    await (await import("@testing-library/user-event")).default.type(box, "zzzz");
    expect(await screen.findByText(/no hotels match/i)).toBeInTheDocument();
  });

  it("shows an empty state and a way to register when no hotel is active", async () => {
    (loadPublicHotels as jest.Mock).mockResolvedValue([]);
    at("/hotels");
    expect(await screen.findByText(/no participating hotels yet/i)).toBeInTheDocument();
  });

  it("shows an error with a working retry, never fake data", async () => {
    (loadPublicHotels as jest.Mock).mockRejectedValueOnce(new Error("x")).mockResolvedValue(HOTELS);
    at("/hotels");
    expect(await screen.findByText(/couldn.t load the hotels/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /try again/i }).click();
    expect(await screen.findByText("Caro Hives")).toBeInTheDocument();
  });

  it("hotel detail: menu grouped by category, browse-only notice, partner CTA -> /register/hotel", async () => {
    (fetchHotelMenu as jest.Mock).mockResolvedValue({
      hotel: { id: "h1", name: "Caro Hives", location: "Juja", contact_phone: null, review_count: 0, average_rating: null },
      menu: [
        { id: "m1", name: "Beef Pilau", description: null, price: "180", category: "Mains", available: true, image_url: null },
        { id: "m2", name: "Chai", description: null, price: "30", category: "Drinks", available: true, image_url: null },
      ],
    });
    at("/hotels/h1");
    expect(await screen.findByRole("heading", { level: 1, name: "Caro Hives" })).toBeInTheDocument();
    expect(screen.getByText("Beef Pilau")).toBeInTheDocument();
    expect(screen.getByText("KSh 180")).toBeInTheDocument();
    expect(screen.getByText(/you.re browsing this menu/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /order|checkout|buy/i })).toBeNull();
    const partner = screen.getAllByRole("link", { name: /^Register a hotel$/i }).map((a) => a.getAttribute("href"));
    expect(partner).toContain("/register/hotel");
  });

  it("hotel detail: a non-active/unknown hotel (404) shows 'not available', not an error", async () => {
    (fetchHotelMenu as jest.Mock).mockRejectedValue(Object.assign(new Error("nf"), { status: 404 }));
    at("/hotels/nope");
    expect(await screen.findByText(/this hotel isn.t available/i)).toBeInTheDocument();
  });
});

describe("authenticated gating", () => {
  it("a signed-in student goes to the student app, not the public site", () => {
    auth({ user: { id: "1", role: "student", fullName: "S", email: "s@x" } });
    at("/");
    expect(screen.getByText("student-app")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("a LOCKED session shows the unlock screen — not the public landing page and not the app", () => {
    auth({ isLocked: true });
    at("/");
    expect(screen.getByText("pin-unlock")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("student-app")).toBeNull();
  });

  it("a locked session never renders protected routes even on a deep link", () => {
    auth({ isLocked: true });
    at("/student/home");
    expect(screen.getByText("pin-unlock")).toBeInTheDocument();
    expect(screen.queryByText("student-app")).toBeNull();
  });

  it("while the session is being restored it shows neither the landing page nor the login form", async () => {
    auth({ isLoading: true });
    at("/");
    await waitFor(() => expect(screen.queryByRole("heading", { level: 1 })).toBeNull());
    expect(screen.queryByTestId("auth")).toBeNull();
  });
});
