export type LocationResultStatus = "granted" | "denied" | "unavailable" | "timeout";

export interface LocationResult {
  status: LocationResultStatus;
  coords: { latitude: number; longitude: number } | null;
  message: string;
}

const GPS_TIMEOUT_MS = 10_000;

/**
 * Web port of the original app/src/services/locationService.ts,
 * which wrapped expo-location. The browser's own
 * navigator.geolocation.getCurrentPosition has no separate
 * "permission request" step or "are location services enabled"
 * check the way expo-location does — asking for a position IS the
 * permission prompt, and its own `timeout` option handles the same
 * "took too long" case expo-location needed a manual race for. Same
 * result shape and same four user-facing states as before, so every
 * caller (HotelListScreen) works unchanged.
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  if (!("geolocation" in navigator)) {
    return {
      status: "unavailable",
      coords: null,
      message: "We couldn't determine your location on this device.",
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: "granted",
          coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          message: "",
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({
            status: "denied",
            coords: null,
            message: "Location permission was not granted. You can still browse and search hotels manually.",
          });
        } else if (error.code === error.TIMEOUT) {
          resolve({
            status: "timeout",
            coords: null,
            message: "Getting your location took too long. Please try again or search manually.",
          });
        } else {
          resolve({
            status: "unavailable",
            coords: null,
            message: "We couldn't determine your location on this device.",
          });
        }
      },
      { enableHighAccuracy: false, timeout: GPS_TIMEOUT_MS, maximumAge: 0 }
    );
  });
}
