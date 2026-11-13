import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { CircleCheck, ShieldCheck, ArrowLeft } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { Modal } from "../../components/ui/Modal";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { createOrder, payOrder, getOrder, Order } from "../../services/ordersApi";

type Stage = "creating" | "paying" | "created" | "loading-order" | "show-order" | "error";

interface MealPassRouteState {
  orderId?: string;
  hotelId?: string;
  hotelName?: string;
  itemId?: string;
  itemPrice?: string | number;
}

/**
 * Creates and reserves an order when entered from a menu. Existing orders
 * are loaded from the backend when entered from Orders; this screen never
 * creates a QR token or a second reservation while revealing a meal pass.
 */
export default function MealPassScreen() {
  const { authFetch } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId, hotelId, hotelName, itemId, itemPrice } = (location.state as MealPassRouteState | null) ?? {};
  const [stage, setStage] = useState<Stage>(orderId ? "loading-order" : "creating");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  // Keep the same idempotent retry behavior for the actual create-and-reserve
  // operation. Revealing an existing order never reads or writes this key.
  const idempotencyStorageKey = `mealvest_order_key:${hotelId}:${itemId}`;

  const runFlow = useCallback(async () => {
    setStage("creating");
    setError(null);
    try {
      if (!hotelId || !itemId) {
        throw new Error("This meal selection is incomplete. Return to the menu and choose it again.");
      }

      let idempotencyKey = sessionStorage.getItem(idempotencyStorageKey);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
      }

      const created = await createOrder(authFetch, hotelId, [{ itemId, quantity: 1 }], idempotencyKey);
      setStage("paying");
      const paid = await payOrder(authFetch, created.id);
      setOrder(paid);
      setStage("created");
      sessionStorage.removeItem(idempotencyStorageKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  }, [authFetch, hotelId, idempotencyStorageKey, itemId]);

  useEffect(() => {
    if (!orderId) {
      runFlow();
      return;
    }

    let active = true;
    getOrder(authFetch, orderId)
      .then((found) => {
        if (!active) return;
        setOrder(found);
        setStage("show-order");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load this meal pass.");
        setStage("error");
      });
    return () => {
      active = false;
    };
  }, [authFetch, orderId, runFlow]);

  useEffect(() => {
    if (!orderId || stage !== "show-order" || (order?.status !== "paid" && order?.status !== "ready")) return;

    let active = true;
    const refresh = async () => {
      if (refreshInFlight.current || document.visibilityState !== "visible") return;
      refreshInFlight.current = true;
      try {
        const latest = await getOrder(authFetch, orderId);
        if (active) {
          setOrder(latest);
          setRefreshError(null);
        }
      } catch (err) {
        if (active) setRefreshError(err instanceof Error ? err.message : "Could not refresh this meal pass.");
      } finally {
        refreshInFlight.current = false;
      }
    };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authFetch, order?.status, orderId, stage]);

  if (stage === "creating" || stage === "paying" || stage === "loading-order") {
    const message = stage === "creating" ? "Placing your order…" : stage === "paying" ? "Reserving your meal…" : "Loading your meal pass…";
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
        <p style={styles.statusText}>{message}</p>
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
          <PrimaryButton
            type="button"
            showArrow={false}
            variant="secondary"
            onPress={() => {
              if (orderId) navigate("/student/orders");
              else navigate(-1);
            }}
            style={{ marginTop: 20, width: 220 }}
          >
            {orderId ? "Back to orders" : "Back to menu"}
          </PrimaryButton>
        )}
      </div>
    );
  }

  if (stage === "created") {
    return (
      <div style={styles.center}>
        <Modal
          open
          title="Order placed successfully!"
          icon={<CircleCheck size={24} color={COLORS.primary} aria-hidden />}
          onClose={() => navigate("/student/orders", { replace: true })}
          actions={
            <PrimaryButton type="button" showArrow={false} onPress={() => navigate("/student/orders", { replace: true })}>
              Got it
            </PrimaryButton>
          }
        >
          Your meal is reserved. When you're ready to redeem your meal, open your order and reveal your QR code. The hotel will scan it to confirm your meal.
        </Modal>
      </div>
    );
  }

  const isEligible = order?.status === "paid" || order?.status === "ready";
  const statusMessage =
    order?.status === "redeemed"
      ? `This meal was redeemed${order.redeemed_at ? ` on ${new Date(order.redeemed_at).toLocaleString()}` : ""}.`
      : order?.status === "cancelled" || order?.status === "refunded"
        ? "This order is no longer available for redemption."
        : "This order is not ready for redemption yet.";

  return (
    <div style={styles.container}>
      <button type="button" onClick={() => navigate("/student/orders")} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back to orders</span>
      </button>

      <h1 style={styles.title}>Your Meal Pass</h1>
      <p style={styles.subtitle}>Show this to {hotelName || "the hotel"} when you're ready to redeem your meal</p>

      <Card style={styles.qrCard}>
        {order?.items.map((item, index) => (
          <span key={`${item.itemId}-${index}`} style={styles.itemName}>
            {item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}
          </span>
        ))}
        <span style={styles.itemPrice}>KSh {Number(order?.amount ?? itemPrice ?? 0).toLocaleString()}</span>

        {isEligible && order?.qr_token ? (
          <div style={styles.qrWrap}>
            <QRCodeSVG value={order.qr_token} size={200} bgColor="#fff" fgColor={COLORS.text} />
          </div>
        ) : (
          <span style={styles.qrMissingText}>{statusMessage}</span>
        )}

        {isEligible && order?.qr_token && (
          <div style={styles.verifiedRow}>
            <ShieldCheck size={14} color={COLORS.success} />
            <span style={styles.verifiedText}>Signed and verified by Mealvest</span>
          </div>
        )}
      </Card>

      {refreshError && (
        <p role="status" style={styles.refreshWarning}>
          Redemption status update failed: {refreshError}. This pass remains in its last confirmed status.
        </p>
      )}
      <PrimaryButton type="button" showArrow={false} onPress={() => navigate("/student/orders")} style={{ marginTop: 24 }}>
        Back to orders
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
  refreshWarning: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, textAlign: "center", marginTop: 14 },
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
};
