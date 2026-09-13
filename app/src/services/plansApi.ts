import { API_BASE_URL } from "./config";

export interface Plan {
  id: string;
  name: string;
  price: string;
  duration_days: number;
  daily_allocation: string;
  rollover_enabled: boolean;
  description: string | null;
}

export async function fetchPlans(): Promise<Plan[]> {
  const res = await fetch(`${API_BASE_URL}/api/plans`);
  if (!res.ok) throw new Error("Could not load meal plans.");
  const data = await res.json();
  return data.plans;
}
