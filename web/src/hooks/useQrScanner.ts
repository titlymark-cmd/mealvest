import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";

export type CameraPermissionState = "unknown" | "granted" | "denied" | "unsupported";

/**
 * Web port of expo-camera's CameraView + useCameraPermissions, used
 * by HotelScannerScreen. expo-camera did native camera access AND
 * barcode decoding itself; on web those are two separate browser
 * primitives this hook wires together:
 *   - navigator.mediaDevices.getUserMedia() for camera access
 *   - jsQR, decoding frames drawn to an offscreen canvas in a
 *     requestAnimationFrame loop, for the actual QR detection
 *
 * `onDetected` fires on every frame a code is found (not just once) —
 * exactly like expo-camera's onBarcodeScanned did, which is why the
 * caller (HotelScannerScreen) already has its own dedup guard
 * (lastScannedRef) rather than this hook needing one of its own.
 */
export function useQrScanner(onDetected: (data: string) => void, active: boolean) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [permission, setPermission] = useState<CameraPermissionState>("unknown");
  // Mirrors expo-camera's permission.canAskAgain: true until a SECOND
  // request also fails, at which point the browser is very likely
  // blocking the site permanently and re-prompting won't help.
  const [canAskAgain, setCanAskAgain] = useState(true);
  const attemptsRef = useRef(0);

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const video = videoElRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) onDetectedRef.current(code.data);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      return;
    }
    attemptsRef.current += 1;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setPermission("granted");
      // On the very first grant, permission is still "unknown" right up
      // until the setPermission call above — the <video> element only
      // exists in the DOM once that state flips, which React commits
      // AFTER this function keeps running, not before. So videoElRef.current
      // here is reliably null on a first grant, and this assignment used
      // to just silently no-op, leaving a permitted, actually-streaming
      // camera attached to nothing: a black box with no error anywhere.
      // The attachStream callback ref below is what actually attaches it
      // once that element exists; this block still matters for a RESUMED
      // scan (video already mounted from the state toggle, stream arrives
      // slightly later).
      if (videoElRef.current) {
        videoElRef.current.srcObject = stream;
        await videoElRef.current.play();
      }
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setPermission("denied");
      if (attemptsRef.current >= 2) setCanAskAgain(false);
    }
  }, [tick]);

  useEffect(() => {
    if (active) requestPermission();
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Fires on every real mount of the <video> element — including the
  // very first one, which is the case requestPermission's own inline
  // assignment above can miss (see its comment). A callback ref fires
  // exactly when the DOM node actually exists, so this is what
  // guarantees an already-acquired stream always ends up attached,
  // regardless of which happens first: the permission grant or the
  // element mounting.
  const attachStream = useCallback((node: HTMLVideoElement | null) => {
    videoElRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  return { videoRef: attachStream, canvasRef, permission, canAskAgain, requestPermission };
}
