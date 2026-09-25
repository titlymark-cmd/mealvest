import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelDashboard, HotelDashboard } from "../../services/hotelStaffApi";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  );
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mpesa_till: "M-Pesa Till",
  paybill: "PayBill",
  send_money: "M-Pesa (Send Money)",
  pochi_la_biashara: "Pochi la Biashara",
  bank: "Bank Account",
};

/**
 * Read-only for now — editing settlement details safely requires
 * re-triggering payment_verification_status back to 'pending' and an
 * audit-trail write (hotel_payment_detail_changes), which the
 * backend already supports at the data-model level but has no
 * dedicated "update my own settlement details" endpoint yet (only
 * admin-side commission editing exists). Viewing what's on file is
 * real; editing it is the one honestly-flagged remaining gap.
 */
export default function HotelProfileScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<HotelDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchHotelDashboard(authFetch);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>
      <h1 style={styles.title}>Hotel Profile</h1>

      {loading && (
        <div style={{ marginTop: 30, display: "flex" }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
      {!loading && error && <p style={styles.errorText}>{error}</p>}

      {!loading && dashboard && (
        <>
          <Card style={{ marginBottom: 14, display: "flex", flexDirection: "column" }}>
            <Row label="Hotel name" value={dashboard.hotel.name} />
            <Row label="Status" value={dashboard.hotel.status.replace("_", " ")} />
          </Card>

          <Card style={{ marginBottom: 14, display: "flex", flexDirection: "column" }}>
            <span style={styles.sectionLabel}>COMMERCIAL TERMS</span>
            <Row label="Commission rate" value={`${dashboard.hotel.commission_percent}%`} />
            <Row label="Registration fee" value={`KSh ${Number(dashboard.hotel.registration_fee).toLocaleString()}`} />
          </Card>

          <Card style={{ display: "flex", flexDirection: "column" }}>
            <span style={styles.sectionLabel}>SETTLEMENT METHOD</span>
            <Row label="Method on file" value={PAYMENT_METHOD_LABEL[dashboard.hotel.payment_method || ""] || "Not set"} />
            <p style={styles.note}>
              To change your settlement details, contact Mealvest support — this keeps a verified audit trail for every change,
              per Mealvest's financial security policy.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0, marginBottom: 16 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 20 },
  sectionLabel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: COLORS.textFaint, letterSpacing: 0.5, marginBottom: 8 },
  row: { display: "flex", flexDirection: "row", justifyContent: "space-between", paddingTop: 6, paddingBottom: 6 },
  rowLabel: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted },
  rowValue: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text, textTransform: "capitalize" },
  note: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, margin: "10px 0 0 0", lineHeight: "16px" },
};
