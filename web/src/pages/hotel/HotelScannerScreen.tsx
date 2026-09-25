import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, XCircle } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { verifyQr, redeemQr, QrCheckResult } from "../../services/hotelStaffApi";
import { useQrScanner } from "../../hooks/useQrScanner";

type ScanState = "scanning" | "verifying" | "confirmed" | "redeeming" | "error";

const ERROR_COPY: Record<string, string> = {
  INVALID_QR: "This isn't a valid Mealvest QR code.",
  ORDER_NOT_FOUND: "No matching order was found for this code.",
  FORBIDDEN: "This meal belongs to a different hotel.",
  NOT_PAID: "This order hasn't been paid for.",
  ALREADY_REDEEMED: "This meal has already been redeemed.",
  HOTEL_SUSPENDED: "Your hotel account is not currently active.",
};

/**
 * Real camera QR scanner. Used identically by both Hotel Staff and
 * Hotel Owner — the two role screens were byte-identical in the
 * original app too (app/src/screens/hotelStaff/HotelScannerScreen.tsx
 * and hotelOwner/HotelScannerScreen.tsx), just duplicated files; this
 * migration shares one implementation instead of copying it twice,
 * with no behavior difference between the roles.
 *
 * useQrScanner (getUserMedia + jsQR) replaces expo-camera's
 * CameraView; this component's own job is still purely the
 * scan-lifecycle state machine and the two real backend calls
 * (verify, then redeem) — nothing here decides a meal is valid or
 * redeemed on its own, both are backend responses.
 */
export default function HotelScannerScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<ScanState>("scanning");
  const [result, setResult] = useState<QrCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleBarcodeScanned = useCallback(
    async (data: string) => {
      // Guards against the scan loop firing repeatedly for the same
      // still-visible code while a request is already in flight —
      // without this, one physical QR code in view can trigger
      // dozens of duplicate verify calls per second.
      if (stateRef.current !== "scanning" || lastScannedRef.current === data) return;
      lastScannedRef.current = data;

      setState("verifying");
      try {
        const res = await verifyQr(authFetch, data);
        if (!res.valid) {
          setErrorMessage(ERROR_COPY[res.code || ""] || res.message || "This QR code could not be verified.");
          setState("error");
          return;
        }
        setResult(res);
        setState("confirmed");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Network error — could not reach Mealvest.");
        setState("error");
      }
    },
    [authFetch]
  );

  const resumeScanning = () => {
    lastScannedRef.current = null;
    setResult(null);
    setErrorMessage(null);
    setState("scanning");
  };

  const isScanningActive = state === "scanning" || state === "verifying";
  const { videoRef, canvasRef, permission, canAskAgain, requestPermission } = useQrScanner(handleBarcodeScanned, isScanningActive);

  const confirmRedemption = async () => {
    if (!result?.order) return;
    setState("redeeming");
    try {
      const res = await redeemQr(authFetch, lastScannedRef.current!);
      if (!res.valid) {
        // Another device redeemed this exact meal in the gap between
        // our verify and our redeem call — the backend's atomic
        // transaction is what actually prevents double redemption;
        // this branch just shows that outcome.
        setErrorMessage(ERROR_COPY[res.code || ""] || "This meal was already redeemed.");
        setState("error");
        return;
      }
      setResult(res);
      setState("confirmed");
      setTimeout(resumeScanning, 1800);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error while redeeming.");
      setState("error");
    }
  };

  if (permission === "unknown") {
    return (
      <div style={styles.center}>
        <Spinner color={COLORS.primary} />
      </div>
    );
  }

  if (permission === "unsupported") {
    return (
      <div style={styles.center}>
        <p style={styles.permTitle}>Camera not available</p>
        <p style={styles.permBody}>This browser doesn't support camera access. Try a different browser or device.</p>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div style={styles.center}>
        <p style={styles.permTitle}>Camera access needed</p>
        <p style={styles.permBody}>Mealvest needs your camera to scan student meal passes.</p>
        {canAskAgain ? (
          <PrimaryButton onPress={requestPermission} style={{ marginTop: 20, width: 220 }}>
            Enable camera
          </PrimaryButton>
        ) : (
          <p style={{ ...styles.permBody, marginTop: 20 }}>
            Camera access was blocked. Check your browser's site settings for this page and allow camera access, then reload.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>
          <ArrowLeft size={18} color="#fff" />
        </button>
        <span style={styles.headerText}>Scan meal QR code</span>
      </div>

      {isScanningActive ? (
        <div style={styles.camera}>
          <video ref={videoRef} playsInline muted style={styles.video} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div style={styles.frameWrap}>
            <div style={styles.frame} />
          </div>
          {state === "verifying" && (
            <div style={styles.verifyingOverlay}>
              <Spinner color="#fff" />
              <span style={styles.verifyingText}>Verifying…</span>
            </div>
          )}
        </div>
      ) : (
        <div style={styles.resultArea}>
          {state === "confirmed" && result?.order && (
            <Card style={styles.resultCard}>
              <div style={styles.resultHeader}>
                <ShieldCheck size={20} color={COLORS.success} />
                <span style={styles.resultTitle}>Valid meal pass</span>
              </div>
              {result.order.items.map((it, i) => (
                <span key={i} style={styles.itemLine}>
                  {it.quantity}× {it.name}
                </span>
              ))}
              <span style={styles.amountText}>KSh {Number(result.order.amount).toLocaleString()}</span>

              {result.order.status === "redeemed" ? (
                <span style={styles.redeemedText}>✓ Redeemed</span>
              ) : (
                <div style={styles.buttonRow}>
                  <button onClick={resumeScanning} style={styles.cancelBtn}>
                    <span style={styles.cancelText}>Cancel</span>
                  </button>
                  {/* TS narrows `state` to "confirmed" in this branch, so it correctly
                      flags this comparison as always-false here — same as in the
                      original RN screen, where this exact loading prop is likewise a
                      no-op on this button (state flips away from "confirmed" as soon
                      as confirmRedemption calls setState("redeeming"), unmounting
                      this very branch). Cast to avoid the literal-type complaint
                      without changing that harmless, pre-existing behavior. */}
                  <PrimaryButton onPress={confirmRedemption} loading={(state as string) === "redeeming"} style={{ flex: 1 }}>
                    Confirm redemption
                  </PrimaryButton>
                </div>
              )}
            </Card>
          )}

          {state === "error" && (
            <Card style={styles.resultCard}>
              <div style={styles.resultHeader}>
                <XCircle size={20} color={COLORS.danger} />
                <span style={{ ...styles.resultTitle, color: COLORS.danger }}>{errorMessage}</span>
              </div>
              <PrimaryButton onPress={resumeScanning} style={{ marginTop: 12 }}>
                Scan again
              </PrimaryButton>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, width: "100%", minHeight: "100%", backgroundColor: "#03060F", display: "flex", flexDirection: "column" },
  center: { flex: 1, width: "100%", minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  permTitle: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 17, color: COLORS.textOnDark, marginBottom: 8, textAlign: "center" },
  permBody: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center" },
  headerRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 54, paddingLeft: 18, paddingRight: 18, paddingBottom: 14 },
  backBtn: { width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  headerText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: "#fff" },
  camera: { flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  video: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" },
  frameWrap: { width: 240, height: 240, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
  frame: { width: 240, height: 240, border: "2px solid rgba(255,255,255,0.6)", borderRadius: 20 },
  verifyingOverlay: { position: "absolute", bottom: 60, display: "flex", flexDirection: "column", alignItems: "center" },
  verifyingText: { color: "#fff", fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 13, marginTop: 8 },
  resultArea: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 },
  resultCard: { width: "100%", display: "flex", flexDirection: "column" },
  resultHeader: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  resultTitle: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 15, color: COLORS.text, flexShrink: 1 },
  itemLine: { display: "block", fontFamily: FONTS.body, fontSize: 13, color: COLORS.text, marginBottom: 2 },
  amountText: { display: "block", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.text, marginTop: 8, marginBottom: 4 },
  redeemedText: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.success, marginTop: 10 },
  buttonRow: { display: "flex", flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, border: `1.5px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.md, display: "flex", alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
};
