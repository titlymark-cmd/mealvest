/**
 * No website can programmatically re-grant a camera permission the
 * browser owner explicitly blocked — that's an intentional browser
 * security boundary, not a gap in this app. The best any site can do
 * is tell the person exactly where to go to undo it themselves. This
 * detects the browser/OS from the user agent (best-effort — UA
 * sniffing is inherently approximate) and returns the real tap-path
 * for that browser, falling back to generic instructions when the
 * browser can't be identified confidently.
 */
export function getCameraUnblockInstructions(): { label: string; steps: string[] } {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg|OPR/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isSafari = /Safari/.test(ua) && !isChrome && !isFirefox;

  if (isAndroid && isChrome) {
    return {
      label: "Android · Chrome",
      steps: [
        "Tap the lock icon (🔒) in the address bar",
        "Tap Permissions",
        "Tap Camera → Allow",
        "Come back here and tap \"Reload and try again\" below",
      ],
    };
  }

  if (isIOS && isSafari) {
    return {
      label: "iPhone/iPad · Safari",
      steps: [
        "Open the Settings app → scroll down to Safari → Camera → set to Allow",
        "Or, on this page: tap \"aA\" in the address bar → Website Settings → Camera → Allow",
        "Come back here and tap \"Reload and try again\" below",
      ],
    };
  }

  if (isFirefox) {
    return {
      label: "Firefox",
      steps: [
        "Tap the lock/info icon in the address bar",
        "Tap Permissions → Camera → Allow, or clear the blocked permission",
        "Come back here and tap \"Reload and try again\" below",
      ],
    };
  }

  if (isChrome) {
    return {
      label: "Chrome",
      steps: [
        "Click the lock icon (🔒) to the left of the address bar",
        "Set Camera to Allow",
        "Come back here and tap \"Reload and try again\" below",
      ],
    };
  }

  if (isSafari) {
    return {
      label: "Safari",
      steps: [
        "Open Safari → Settings (or Preferences) → Websites → Camera",
        "Find this site in the list and set it to Allow",
        "Come back here and tap \"Reload and try again\" below",
      ],
    };
  }

  return {
    label: "your browser",
    steps: [
      "Open this page's site settings (usually a lock or info icon near the address bar)",
      "Find Camera and set it to Allow",
      "Come back here and tap \"Reload and try again\" below",
    ],
  };
}
