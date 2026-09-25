import React, { useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ArrowLeft, ShieldCheck, XCircle } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { verifyQr, redeemQr, QrCheckResult } from "../../services/hotelStaffApi";

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
 * Real camera QR scanner — expo-camera's CameraView handles native
 * camera access and barcode decoding itself; this component's job is
 * purely the scan-lifecycle state machine and the two real backend
 * calls (verify, then redeem). Nothing here decides a meal is valid
 * or redeemed on its own — both of those are backend responses.
 */
export default function HotelScannerScreen({ navigation }: any) {
  const { authFetch } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>("scanning");
  const [result, setResult] = useState<QrCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastScannedRef = useRef<string | null>(null);

  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      // Guards against expo-camera firing the callback repeatedly for
      // the same still-visible code while a request is already in
      // flight — without this, one physical QR code in view can
      // trigger dozens of duplicate verify calls per second.
      if (state !== "scanning" || lastScannedRef.current === data) return;
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
    [authFetch, state]
  );

  const resumeScanning = () => {
    lastScannedRef.current = null;
    setResult(null);
    setErrorMessage(null);
    setState("scanning");
  };

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

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>Mealvest needs your camera to scan student meal passes.</Text>
        {permission.canAskAgain ? (
          <PrimaryButton onPress={requestPermission} style={{ marginTop: 20, width: 220 }}>
            Enable camera
          </PrimaryButton>
        ) : (
          <TouchableOpacity onPress={() => Linking.openSettings()} style={{ marginTop: 20 }}>
            <Text style={styles.link}>Open device settings</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Scan meal QR code</Text>
      </View>

      {state === "scanning" || state === "verifying" ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcodeScanned}
        >
          <View style={styles.frameWrap}>
            <View style={styles.frame} />
          </View>
          {state === "verifying" && (
            <View style={styles.verifyingOverlay}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.verifyingText}>Verifying…</Text>
            </View>
          )}
        </CameraView>
      ) : (
        <View style={styles.resultArea}>
          {state === "confirmed" && result?.order && (
            <Card style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <ShieldCheck size={20} color={COLORS.success} />
                <Text style={styles.resultTitle}>Valid meal pass</Text>
              </View>
              {result.order.items.map((it, i) => (
                <Text key={i} style={styles.itemLine}>{it.quantity}× {it.name}</Text>
              ))}
              <Text style={styles.amountText}>KSh {Number(result.order.amount).toLocaleString()}</Text>

              {result.order.status === "redeemed" ? (
                <Text style={styles.redeemedText}>✓ Redeemed</Text>
              ) : (
                <View style={styles.buttonRow}>
                  <TouchableOpacity onPress={resumeScanning} style={styles.cancelBtn}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <PrimaryButton onPress={confirmRedemption} loading={state === "redeeming"} style={{ flex: 1 }}>
                    Confirm redemption
                  </PrimaryButton>
                </View>
              )}
            </Card>
          )}

          {state === "error" && (
            <Card style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <XCircle size={20} color={COLORS.danger} />
                <Text style={[styles.resultTitle, { color: COLORS.danger }]}>{errorMessage}</Text>
              </View>
              <PrimaryButton onPress={resumeScanning} style={{ marginTop: 12 }}>
                Scan again
              </PrimaryButton>
            </Card>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#03060F" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  permTitle: { fontFamily: FONTS.displayBold, fontSize: 17, color: COLORS.textOnDark, marginBottom: 8, textAlign: "center" },
  permBody: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center" },
  link: { fontFamily: FONTS.bodySemibold, fontSize: 14, color: COLORS.primary },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 54, paddingHorizontal: 18, paddingBottom: 14 },
  backBtn: { width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerText: { fontFamily: FONTS.bodySemibold, fontSize: 14, color: "#fff" },
  camera: { flex: 1, alignItems: "center", justifyContent: "center" },
  frameWrap: { width: 240, height: 240, alignItems: "center", justifyContent: "center" },
  frame: { width: 240, height: 240, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", borderRadius: 20 },
  verifyingOverlay: { position: "absolute", bottom: 60, alignItems: "center" },
  verifyingText: { color: "#fff", fontFamily: FONTS.bodyMedium, fontSize: 13, marginTop: 8 },
  resultArea: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  resultCard: { width: "100%" },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  resultTitle: { fontFamily: FONTS.displayBold, fontSize: 15, color: COLORS.text, flexShrink: 1 },
  itemLine: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.text, marginBottom: 2 },
  amountText: { fontFamily: FONTS.displayBold, fontSize: 16, color: COLORS.text, marginTop: 8, marginBottom: 4 },
  redeemedText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.success, marginTop: 10 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: COLORS.borderSoft, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.text },
});
