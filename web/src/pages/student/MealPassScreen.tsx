import React, { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { createOrder, payOrder, Order } from "../../services/ordersApi";

type Stage = "creating" | "paying" | "ready" | "error";

/**
 * The ONLY screen that ever displays a meal QR code, and it never
 * generates one itself — `order.qr_token` comes back from
 * `payOrder()`, which is the backend's HMAC-signed value. This
 * component just renders whatever string the backend gave it as a
 * scannable image; it has no ability to produce a valid token on
 * its own, by design (see server/src/lib/qr.ts).
 */
export default function MealPassScreen() {
  const { authFetch } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { hotelId, hotelName, itemId, itemName, itemPrice } = (location.state as any) || {};

  const [stage, setStage] = useState<Stage>("creating");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runFlow = useCallback(async () => {
    setStage("creating");
    setError(null);
    try {
      const created = await createOrder(authFetch, hotelId, [{ itemId, quantity: 1 }]);
      setStage("paying");
      const paid = await payOrder(authFetch, created.id);
      setOrder(paid);
      setStage("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch, hotelId, itemId]);

  useEffect(() => {
    runFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === "creating" || stage === "paying") {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
        <p style={styles.statusText}>{stage === "creating" ? "Placing your order…" : "Paying from your meal plan…"}</p>
      </div>
    );
  }

  if (stage === "error") {
    const needsBudget = error?.toLowerCase().includes("meal plan") || error?.toLowerCase().includes("budget");
    return (
      <div style={styles.center}>
        <p style={styles.errorTitle}>{needsBudget ? "You don't have an active meal plan yet" : "Could not complete this order"}</p>
        <p style={styles.errorBody}>{error}</p>
        {needsBudget ? (
          <PrimaryButton onPress={() => navigate("/student/budget-onboarding", { state: { hotelId, hotelName } })} style={{ marginTop: 20, width: 220 }}>
            Set up a plan
          </PrimaryButton>
        ) : (
          <button onClick={() => navigate(-1)} style={{ marginTop: 20 }}>
            <span style={styles.link}>Back to menu</span>
          </button>
        )}
      </div>
    );
  }

  // stage === "ready" — order is real, paid, and has a real qr_token
  return (
    <div style={styles.container}>
      <button onClick={() => navigate("/student")} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back to hotels</span>
      </button>

      <h1 style={styles.title}>Your Meal Pass</h1>
      <p style={styles.subtitle}>Show this to {hotelName} to redeem your meal</p>

      <Card style={styles.qrCard}>
        <span style={styles.itemName}>{itemName}</span>
        <span style={styles.itemPrice}>KSh {Number(itemPrice).toLocaleString()}</span>

        {order?.qr_token ? (
          <div style={styles.qrWrap}>
            <QRCodeSVG value={order.qr_token} size={200} bgColor="#fff" fgColor={COLORS.text} />
          </div>
        ) : (
          <span style={styles.qrMissingText}>No QR code was returned for this order.</span>
        )}

        <div style={styles.verifiedRow}>
          <ShieldCheck size={14} color={COLORS.success} />
          <span style={styles.verifiedText}>Signed and verified by Mealvest</span>
        </div>
      </Card>

      <p style={styles.hint}>This code is unique to this exact order and expires once redeemed.</p>

      <PrimaryButton onPress={() => navigate("/student")} style={{ marginTop: 24 }}>
        Done
      </PrimaryButton>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 60, display: "flex", flexDirection: "column" },
  center: { flexShrink: 0, width: "100%", minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  statusText: { fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 14, color: COLORS.textOnDarkMuted, marginTop: 16 },
  errorTitle: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 17, color: COLORS.textOnDark, marginBottom: 8, textAlign: "center" },
  errorBody: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center" },
  qrMissingText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  link: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.primary },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, textAlign: "center", margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center", marginTop: 4, marginBottom: 20 },
  qrCard: { display: "flex", flexDirection: "column", alignItems: "center", padding: 24 },
  itemName: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.text },
  itemPrice: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, marginBottom: 18 },
  qrWrap: { padding: 14, backgroundColor: "#fff", borderRadius: RADIUS.sm, display: "flex" },
  verifiedRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 },
  verifiedText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.success },
  hint: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textOnDarkMuted, textAlign: "center", marginTop: 16 },
};
