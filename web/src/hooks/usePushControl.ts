import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  describeAvailability,
  disablePushOnThisDevice,
  enablePush,
  getPushAvailability,
  isEnabledOnThisDevice,
  PushAvailability,
} from "../services/pushNotifications";
import { updatePreferences } from "../services/notificationsApi";

export type PushControlStatus = "checking" | "on" | "off" | "blocked" | "unavailable";

export interface PushControl {
  status: PushControlStatus;
  /** Plain-language reason when push can't be switched on here (denied / iOS tab / unsupported / not configured). */
  explanation: string | null;
  availability: PushAvailability;
  busy: boolean;
  error: string | null;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
}

/**
 * State machine behind every "Push notifications" switch (student profile, hotel owner security,
 * staff settings). The truth about "is THIS device registered" comes from the browser + backend,
 * not from a stored flag, so the switch can't claim "on" for a device that isn't actually subscribed.
 */
export function usePushControl(): PushControl {
  const { authFetch } = useAuth();
  const [availability, setAvailability] = useState<PushAvailability>(() => getPushAvailability());
  const [status, setStatus] = useState<PushControlStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const a = getPushAvailability();
    setAvailability(a);
    if (a.state === "denied") return setStatus("blocked");
    if (a.state !== "ready") return setStatus("unavailable");
    setStatus((await isEnabledOnThisDevice(authFetch)) ? "on" : "off");
  }, [authFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await enablePush(authFetch);
    if (result.ok) {
      // Keep the account-level preference in step with the explicit opt-in, so the server will actually send.
      await updatePreferences(authFetch, { pushEnabled: true }).catch(() => {});
      setStatus("on");
    } else {
      setError(result.message);
      await refresh();
    }
    setBusy(false);
  }, [authFetch, refresh]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePushOnThisDevice(authFetch);
      setStatus("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn off notifications on this device.");
    }
    setBusy(false);
  }, [authFetch]);

  return { status, explanation: describeAvailability(availability), availability, busy, error, turnOn, turnOff };
}
