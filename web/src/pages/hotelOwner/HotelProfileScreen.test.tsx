import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../services/locationService", () => ({ getCurrentLocation: jest.fn() }));

import HotelProfileScreen from "./HotelProfileScreen";
import { useAuth } from "../../context/AuthContext";
import { getCurrentLocation } from "../../services/locationService";

const HOTEL = {
  id: "h1",
  name: "Mercy's IceCream",
  status: "active",
  location: "Along Siriba road",
  address: "Siriba Rd",
  settlement_schedule: "Daily at 12:00 PM",
  contract_start_date: "2026-01-05T00:00:00.000Z",
  contract_end_date: "2027-01-05T00:00:00.000Z",
  registration_fee: "500.00",
  payment_method: "bank",
  payment_details: { method: "bank", bankName: "KCB", accountName: "Mercy Ltd", accountNumber: "1234567890", registeredPhoneNumber: "0711111111" },
  payment_verification_status: "pending",
  image_url: "https://x.supabase.co/cover.jpg",
  description: "Sweet things",
  latitude: -0.09,
  longitude: 34.76,
  helpline: "0712345678",
  opening_hours: "Mon-Sat 7-9",
  closing_hours: "21:00",
  days_open: ["Mon", "Tue"],
  services: ["Takeaway"],
  business_type: "food_kiosk",
  county: "Homa Bay",
  town: "Homa Bay",
  landmark: "Near the stage",
  contact_phone: "254700000001",
  contact_email: "mercy@example.com",
  whatsapp_number: null,
};

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body } as Response);

let authFetch: jest.Mock;
let patchBodies: any[];

function setup(opts: { patch?: (body: any) => Response } = {}) {
  patchBodies = [];
  authFetch = jest.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/hotel/dashboard") return json(200, { hotel: HOTEL, stats: {} });
    if (path === "/api/hotel/location" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      patchBodies.push(body);
      if (opts.patch) return opts.patch(body);
      return json(200, {
        hotel: {
          id: "h1", name: HOTEL.name, latitude: HOTEL.latitude, longitude: HOTEL.longitude, address: HOTEL.address,
          helpline: HOTEL.helpline, opening_hours: HOTEL.opening_hours, services: HOTEL.services,
          description: HOTEL.description, image_url: HOTEL.image_url, ...mapKeys(body),
        },
      });
    }
    return json(404, {});
  });
  (useAuth as jest.Mock).mockReturnValue({ authFetch });
  render(<HotelProfileScreen />);
}

/** camelCase request keys -> snake_case response columns, as the real controller returns them. */
function mapKeys(b: any) {
  const m: Record<string, string> = { openingHours: "opening_hours", imageUrl: "image_url" };
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [m[k] || k, v]));
}

const ready = () => screen.findByRole("heading", { name: "Mercy's IceCream" });
const val = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

describe("HotelProfileScreen", () => {
  test("loads every editable field from the real response", async () => {
    setup();
    await ready();
    expect(val("About your hotel")).toBe("Sweet things");
    expect(val("Helpline")).toBe("0712345678");
    expect(val("Opening hours")).toBe("Mon-Sat 7-9");
    expect(val("Street address")).toBe("Siriba Rd");
    expect(val("Latitude")).toBe("-0.09");
    expect(val("Longitude")).toBe("34.76");
    expect(screen.getByText("Takeaway")).toBeInTheDocument();
    expect(val("Cover image link")).toBe("https://x.supabase.co/cover.jpg");
    expect(screen.queryByText(/unsaved/i)).not.toBeInTheDocument(); // nothing dirty yet
  });

  test("shows read-only records, masks the account number, and never shows commission or private IDs", async () => {
    setup();
    await ready();
    const onFile = screen.getByRole("complementary");
    expect(within(onFile).getByText("KSh 500")).toBeInTheDocument();
    expect(within(onFile).getByText("Food kiosk")).toBeInTheDocument();
    expect(within(onFile).getByText("mercy@example.com")).toBeInTheDocument();
    expect(within(onFile).getByText("•••• 7890")).toBeInTheDocument();
    expect(within(onFile).getByText("Pending verification")).toBeInTheDocument();
    expect(within(onFile).queryByText("WhatsApp")).not.toBeInTheDocument(); // null fields render no blank row
    expect(document.body.textContent).not.toContain("1234567890");
    expect(document.body.textContent).not.toContain("0711111111");
    expect(document.body.textContent?.toLowerCase()).not.toContain("commission");
  });

  test("editing reveals the save bar; only the changed field is PATCHed; state refreshes after", async () => {
    setup();
    await ready();
    fireEvent.change(screen.getByLabelText("Helpline"), { target: { value: "0722 111 222" } });
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({ helpline: "0722 111 222" });

    expect(await screen.findByText(/Saved — students now see/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(val("Helpline")).toBe("0722 111 222");
    // Only one read of the dashboard: the PATCH response refreshes state, no refetch needed.
    expect(authFetch.mock.calls.filter(([p]) => p === "/api/hotel/dashboard")).toHaveLength(1);
  });

  test("every editable field round-trips under its backend name", async () => {
    setup();
    await ready();
    fireEvent.change(screen.getByLabelText("About your hotel"), { target: { value: "New copy" } });
    fireEvent.change(screen.getByLabelText("Helpline"), { target: { value: "0733 000 111" } });
    fireEvent.change(screen.getByLabelText("Opening hours"), { target: { value: "Daily 6-10" } });
    fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "New Rd" } });
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "-0.1" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "34.8" } });
    fireEvent.change(screen.getByLabelText("Cover image link"), { target: { value: "https://x.supabase.co/new.jpg" } });
    const svc = screen.getByLabelText("Services");
    fireEvent.change(svc, { target: { value: "Dine-in" } });
    fireEvent.keyDown(svc, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({
      description: "New copy",
      helpline: "0733 000 111",
      openingHours: "Daily 6-10",
      address: "New Rd",
      latitude: -0.1,
      longitude: 34.8,
      imageUrl: "https://x.supabase.co/new.jpg",
      services: ["Takeaway", "Dine-in"],
    });
  });

  test("invalid input blocks the request and shows the error beside the field", async () => {
    setup();
    await ready();
    fireEvent.change(screen.getByLabelText("Helpline"), { target: { value: "call me" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Enter a phone number/)).toBeInTheDocument();
    expect(screen.getByText("Fix 1 field before saving.")).toBeInTheDocument();
    expect(screen.getByLabelText("Helpline")).toHaveAttribute("aria-invalid", "true");
    expect(patchBodies).toHaveLength(0);
  });

  test("a server rejection is shown and the owner's edits are kept", async () => {
    setup({ patch: () => json(400, { error: { message: "Images must be uploaded through MEALVEST (or come from an approved image host)." } }) });
    await ready();
    fireEvent.change(screen.getByLabelText("Cover image link"), { target: { value: "https://evil.example.com/a.jpg" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/must be uploaded through MEALVEST/)).toBeInTheDocument();
    expect(val("Cover image link")).toBe("https://evil.example.com/a.jpg");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  test("discard restores saved values and hides the bar", async () => {
    setup();
    await ready();
    fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "Elsewhere" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(val("Street address")).toBe("Siriba Rd");
    expect(screen.queryByText(/unsaved/)).not.toBeInTheDocument();
    expect(patchBodies).toHaveLength(0);
  });

  test("services: duplicates are refused, chips are removable", async () => {
    setup();
    await ready();
    const svc = screen.getByLabelText("Services");
    fireEvent.change(svc, { target: { value: "takeaway" } });
    fireEvent.keyDown(svc, { key: "Enter" });
    expect(screen.getByText(/already in your list/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Listed services" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("1 unsaved change")).not.toBeInTheDocument(); // refused duplicate = no change
    fireEvent.click(screen.getByRole("button", { name: "Remove Takeaway" }));
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  test("'Use this device's location' fills the pair; a denial explains itself", async () => {
    (getCurrentLocation as jest.Mock).mockResolvedValueOnce({ status: "granted", coords: { latitude: -1.2921234, longitude: 36.8219876 }, message: "" });
    setup();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Use this device's location/ }));
    await waitFor(() => expect(val("Latitude")).toBe("-1.292123"));
    expect(val("Longitude")).toBe("36.821988");

    (getCurrentLocation as jest.Mock).mockResolvedValueOnce({ status: "denied", coords: null, message: "Location permission was not granted." });
    fireEvent.click(screen.getByRole("button", { name: /Use this device's location/ }));
    expect(await screen.findByText("Location permission was not granted.")).toBeInTheDocument();
  });

  test("the listing-strength shortcuts only offer what's actually missing", async () => {
    setup();
    await ready();
    expect(screen.getByText("7 of 7 details")).toBeInTheDocument();
    expect(screen.getByText("Your listing is complete.")).toBeInTheDocument();
  });

  test("a failed load offers a retry", async () => {
    authFetch = jest.fn(async () => json(500, { error: { message: "Boom" } }));
    (useAuth as jest.Mock).mockReturnValue({ authFetch });
    render(<HotelProfileScreen />);
    expect(await screen.findByText("Boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
