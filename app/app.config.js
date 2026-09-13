/**
 * app.config.js instead of app.json — this is the ONE place the
 * Google Maps native SDK key gets injected, read from process.env at
 * BUILD time (this file runs in Node during `expo prebuild`/EAS
 * build, never in the shipped JS bundle itself). Set the real value
 * via a local .env (untracked, see .env.example) for local dev
 * builds, or as an EAS Secret for CI/production builds — never commit
 * it here as a literal string.
 *
 * Note on what "secure" means for this specific key: Android/iOS
 * native Maps SDK keys are NOT like the Daraja/M-Pesa server secrets
 * elsewhere in this project — they are inherently compiled into the
 * app binary and are not meant to be hidden from a determined
 * attacker who decompiles the app. The real protection is CONFIGURING
 * RESTRICTIONS on the key in Google Cloud Console (Android app
 * restricted by package name + SHA-1 signing certificate fingerprint;
 * iOS restricted by bundle identifier) so a stolen key literally
 * cannot be used from any other app. See TESTING.md / README for the
 * exact restriction steps.
 */
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

if (!GOOGLE_MAPS_API_KEY) {
  console.warn(
    "\n⚠️  GOOGLE_MAPS_API_KEY is not set. The map screen will fail to load tiles until you " +
      "set it in app/.env (see app/.env.example) and rebuild.\n"
  );
}

module.exports = {
  expo: {
    name: "MEALVEST",
    slug: "mealvest",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    splash: {
      backgroundColor: "#F0F9FF",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mealvest.app",
      config: {
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "MEALVEST uses your location to show you the nearest hotels registered with MEALVEST and their distance from you.",
        NSCameraUsageDescription:
          "MEALVEST hotel staff use the camera to scan a student's meal QR code to redeem their order.",
      },
    },
    android: {
      package: "com.mealvest.app",
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_API_KEY,
        },
      },
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA"],
    },
    web: {
      bundler: "metro",
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "MEALVEST hotel staff use the camera to scan a student's meal QR code to redeem their order.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "MEALVEST uses your location to show you the nearest hotels registered with MEALVEST and their distance from you.",
        },
      ],
    ],
  },
};
