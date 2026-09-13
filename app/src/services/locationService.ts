import * as Location from "expo-location";

export type LocationResultStatus = "granted" | "denied" | "unavailable" | "timeout";

export interface LocationResult {
  status: LocationResultStatus;
  coords: { latitude: number; longitude: number } | null;
  message: string;
}

const GPS_TIMEOUT_MS = 10_000;

/**
 * Requests location permission and returns a single current fix,
 * or a clear, typed failure reason — never throws, so callers never
 * need a try/catch just to handle "the student said no" gracefully.
 * Every failure path here maps directly to a spec requirement:
 * permission denied, location unavailable, and GPS timeout are all
 * distinct, user-facing states, not just "something went wrong."
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      return {
        status: "denied",
        coords: null,
        message: "Location permission was not granted. You can still browse and search hotels manually.",
      };
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return {
        status: "unavailable",
        coords: null,
        message: "Location services are turned off on this device.",
      };
    }

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS));

    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeoutPromise,
    ]);

    if (!position) {
      return {
        status: "timeout",
        coords: null,
        message: "Getting your location took too long. Please try again or search manually.",
      };
    }

    return {
      status: "granted",
      coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
      message: "",
    };
  } catch {
    return {
      status: "unavailable",
      coords: null,
      message: "We couldn't determine your location on this device.",
    };
  }
}
