/**
 * Mock data for the demo film. Fictional names / businesses only —
 * nothing here is read from, or sent to, the real API.
 */
export const STUDENT = { name: "Amina", campus: "Maseno" };

export const WALLET = { balance: 4250, daily: 350, mealsLeft: 12 };

export const HOTEL = "Lakeview Café";
export const STAFF_HOTEL = "Campus Grill";

export const MENU = [
  { id: "pb", name: "Pilau Beef", price: 280 },
  { id: "pc", name: "Pilau Chicken", price: 320 },
  { id: "cb", name: "Chapati Beans", price: 150 },
  { id: "uf", name: "Ugali Fish", price: 350 },
  { id: "md", name: "Mandazi", price: 50 },
];

export const CART = [MENU[0], MENU[1]];
export const CART_TOTAL = CART.reduce((sum, i) => sum + i.price, 0);

export const PASSES = [
  { id: "MV-4821", who: "Amina", dish: "Pilau" },
  { id: "MV-4822", who: "Brian", dish: "Chapati" },
  { id: "MV-4823", who: "Faith", dish: "Ugali Fish" },
  { id: "MV-4824", who: "Otieno", dish: "Mandazi" },
  { id: "MV-4825", who: "Wanjiru", dish: "Pilau" },
];

export const SALES = [
  { who: "Amina", dish: "Pilau Beef", amount: 280, time: "12:41" },
  { who: "Brian", dish: "Chapati Beans", amount: 150, time: "12:44" },
  { who: "Faith", dish: "Ugali Fish", amount: 350, time: "12:52" },
  { who: "Otieno", dish: "Mandazi", amount: 50, time: "13:05" },
  { who: "Wanjiru", dish: "Pilau Chicken", amount: 320, time: "13:12" },
];

export const SAVINGS = { leftover: 120, daily: 350 };

export const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
