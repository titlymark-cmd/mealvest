/*
 * Mock data for the MealVest product demo. Static, invented values —
 * nothing here is fetched, and no module under this folder imports any
 * api/service/auth code. Names/amounts are illustrative only.
 */

export const DEMO_STUDENT = {
  name: "Amina",
  balance: 1840,
  dailyAllowance: 230,
  spentToday: 180,
  rollover: 50,
};

export const DEMO_HOTELS = [
  { id: "h1", name: "Caro Hives", tag: "Mains • 4 min", emoji: "🍛" },
  { id: "h2", name: "Anne's Cafe", tag: "Grill • 6 min", emoji: "🍗" },
  { id: "h3", name: "Mama Oliech", tag: "Fish • 8 min", emoji: "🐟" },
];

export const DEMO_MEALS = [
  { id: "m1", name: "Beef Pilau", price: 180, emoji: "🍛" },
  { id: "m2", name: "Chicken & Ugali", price: 220, emoji: "🍗" },
  { id: "m3", name: "Chapati Beans", price: 120, emoji: "🫓" },
];

export const DEMO_QUEUE = [
  { id: "o1", code: "MV-7731", meal: "Beef Pilau", student: "Amina N.", price: 180 },
  { id: "o2", code: "MV-7732", meal: "Chicken & Ugali", student: "Brian K.", price: 220 },
  { id: "o3", code: "MV-7733", meal: "Chapati Beans", student: "Faith O.", price: 120 },
  { id: "o4", code: "MV-7734", meal: "Beef Pilau", student: "Joy M.", price: 180 },
];

export const DEMO_SALES = [
  { id: "s1", meal: "Beef Pilau", student: "Amina N.", price: 180 },
  { id: "s2", meal: "Chicken & Ugali", student: "Brian K.", price: 220 },
  { id: "s3", meal: "Chapati Beans", student: "Faith O.", price: 120 },
  { id: "s4", meal: "Beef Pilau", student: "Joy M.", price: 180 },
  { id: "s5", meal: "Fish Fillet", student: "Dan W.", price: 260 },
];

export const DEMO_STAFF = [
  { id: "t1", name: "Grace Wanjiku", role: "Cashier", initials: "GW" },
  { id: "t2", name: "Peter Omondi", role: "Server", initials: "PO" },
];

export const DEMO_NEW_STAFF = { name: "Mary Achieng", role: "Server", initials: "MA" };

/*
 * Scene timeline. Each entry drives one animated scene. `ms` is how long
 * it stays on screen before auto-advancing; the orchestrator also writes
 * it into the progress bar. Total ≈ 34s, matching the reference's brisk
 * per-beat pacing across more scenes.
 */
export interface DemoSceneDef {
  id: number;
  key: string;
  ms: number;
}

export const DEMO_SCENES: DemoSceneDef[] = [
  { id: 1, key: "logo", ms: 2300 },
  { id: 2, key: "headline", ms: 3200 },
  { id: 3, key: "wallet", ms: 3000 },
  { id: 4, key: "order", ms: 3400 },
  { id: 5, key: "rules", ms: 2600 },
  { id: 6, key: "payment", ms: 2600 },
  { id: 7, key: "qr", ms: 2600 },
  { id: 8, key: "bloom", ms: 1300 },
  { id: 9, key: "queue", ms: 3200 },
  { id: 10, key: "sales", ms: 3000 },
  { id: 11, key: "staff", ms: 2600 },
  { id: 12, key: "savings", ms: 2800 },
  { id: 13, key: "particles", ms: 2600 },
  { id: 14, key: "end", ms: 3000 },
];
