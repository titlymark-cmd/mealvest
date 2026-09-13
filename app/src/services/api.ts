import { API_BASE_URL } from "./config";

export interface HealthResponse {
  status: "ok" | "degraded";
  db: "connected" | "unreachable";
  timestamp: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  if (!res.ok && res.status !== 503) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  return res.json();
}
