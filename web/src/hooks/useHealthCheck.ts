import { useEffect, useState } from "react";
import { getHealth, HealthResponse } from "../services/api";

interface HealthCheckState {
  loading: boolean;
  data: HealthResponse | null;
  error: string | null;
}

export function useHealthCheck() {
  const [state, setState] = useState<HealthCheckState>({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ loading: false, data: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
