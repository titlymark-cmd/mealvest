import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import MealPassScreen from "./MealPassScreen";
import OrderHistoryScreen from "./OrderHistoryScreen";
import { createOrder, getOrder, listMyOrders, payOrder } from "../../services/ordersApi";
import { fetchHotelMenu } from "../../services/hotelsApi";

const mockAuthFetch = jest.fn();
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock("../../services/ordersApi", () => ({
  createOrder: jest.fn(),
  getOrder: jest.fn(),
  listMyOrders: jest.fn(),
  payOrder: jest.fn(),
}));
jest.mock("../../services/hotelsApi", () => ({ fetchHotelMenu: jest.fn() }));

const ORDER = {
  id: "order-1",
  user_id: "student-1",
  hotel_id: "hotel-1",
  hotel_name: "Sunrise Hotel",
  items: [{ itemId: "item-1", quantity: 2, name: "Pilau", unitPrice: 150, lineTotal: 300 }],
  amount: "300.00",
  status: "paid" as const,
  qr_token: "signed-order-token",
  commission_amount: null,
  hotel_amount: null,
  created_at: "2026-11-12T12:00:00.000Z",
};

function LocationState() {
  const location = useLocation();
  return <div data-testid="route-state">{JSON.stringify(location.state)}</div>;
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "idempotency-key" },
  });
  (createOrder as jest.Mock).mockResolvedValue({ ...ORDER, status: "pending_payment", qr_token: null });
  (payOrder as jest.Mock).mockResolvedValue(ORDER);
  (getOrder as jest.Mock).mockResolvedValue(ORDER);
  (listMyOrders as jest.Mock).mockResolvedValue([ORDER]);
  (fetchHotelMenu as jest.Mock).mockResolvedValue({
    hotel: { id: "hotel-1", name: "Sunrise Hotel" },
    menu: [{ id: "item-1", image_url: null }],
  });
});

describe("student meal order QR workflow", () => {
  it("confirms a successful order without opening its QR or creating another order on dismiss", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/student/meal-pass", state: { hotelId: "hotel-1", itemId: "item-1", itemName: "Pilau", itemPrice: 150, hotelName: "Sunrise Hotel" } }]}>
        <Routes>
          <Route path="/student/meal-pass" element={<MealPassScreen />} />
          <Route path="/student/orders" element={<div>Orders screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("dialog", { name: "Order placed successfully!" })).toHaveTextContent(
      "reveal your QR code"
    );
    expect(screen.queryByRole("heading", { name: "Your Meal Pass" })).not.toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(payOrder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(await screen.findByText("Orders screen")).toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("does not show a success confirmation when order creation fails", async () => {
    (createOrder as jest.Mock).mockRejectedValue(new Error("Order creation failed"));
    render(
      <MemoryRouter initialEntries={[{ pathname: "/student/meal-pass", state: { hotelId: "hotel-1", itemId: "item-1" } }]}>
        <Routes>
          <Route path="/student/meal-pass" element={<MealPassScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Order creation failed")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Order placed successfully!" })).not.toBeInTheDocument();
    expect(payOrder).not.toHaveBeenCalled();
  });

  it("reveals the existing order's QR data without creating or paying another order", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/student/meal-pass", state: { orderId: ORDER.id, hotelName: "Sunrise Hotel" } }]}>
        <Routes>
          <Route path="/student/meal-pass" element={<MealPassScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Your Meal Pass" })).toBeInTheDocument();
    expect(await screen.findByText("2× Pilau")).toBeInTheDocument();
    expect(screen.getByText("Show this to Sunrise Hotel when you're ready to redeem your meal")).toBeInTheDocument();
    expect(getOrder).toHaveBeenCalledWith(mockAuthFetch, ORDER.id);
    expect(createOrder).not.toHaveBeenCalled();
    expect(payOrder).not.toHaveBeenCalled();
  });

  it("does not display a QR after the backend reports the order redeemed", async () => {
    (getOrder as jest.Mock).mockResolvedValue({ ...ORDER, status: "redeemed", redeemed_at: "2026-11-13T10:30:00.000Z" });
    render(
      <MemoryRouter initialEntries={[{ pathname: "/student/meal-pass", state: { orderId: ORDER.id } }]}>
        <Routes>
          <Route path="/student/meal-pass" element={<MealPassScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/This meal was redeemed on/)).toBeInTheDocument();
    expect(screen.queryByText("Signed and verified by Mealvest")).not.toBeInTheDocument();
  });

  it("shows a reveal action for eligible orders and opens the selected order", async () => {
    render(
      <MemoryRouter initialEntries={["/student/orders"]}>
        <Routes>
          <Route path="/student/orders" element={<OrderHistoryScreen />} />
          <Route path="/student/meal-pass" element={<LocationState />} />
        </Routes>
      </MemoryRouter>
    );

    const reveal = await screen.findByRole("button", { name: "Reveal QR Code" });
    expect(screen.getByText("2× Pilau")).toBeInTheDocument();
    expect(await screen.findAllByText(/Sunrise Hotel/)).not.toHaveLength(0);
    expect(screen.getByText("KSh 300")).toBeInTheDocument();
    fireEvent.click(reveal);
    await waitFor(() => expect(screen.getByTestId("route-state")).toHaveTextContent(ORDER.id));
    expect(screen.getByTestId("route-state")).toHaveTextContent("Sunrise Hotel");
  });
});
