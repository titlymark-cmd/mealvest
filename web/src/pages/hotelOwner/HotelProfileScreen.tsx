import React, { useEffect, useState, useCallback } from "react";
import { ImagePlus } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelDashboard, HotelDashboard, updateHotelProfile } from "../../services/hotelStaffApi";

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={{ ...styles.rowValue, textTransform: capitalize ? "capitalize" : "none" }}>{value}</span>
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
  const [dashboard, setDashboard] = useState<HotelDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bannerUrl, setBannerUrl] = useState("");
  const [savingBanner, setSavingBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSaved, setBannerSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchHotelDashboard(authFetch);
      setDashboard(data);
      setBannerUrl(data.hotel.image_url || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveBanner = async () => {
    if (!bannerUrl.trim()) return;
    setSavingBanner(true);
    setBannerError(null);
    setBannerSaved(false);
    try {
      const hotel = await updateHotelProfile(authFetch, { imageUrl: bannerUrl.trim() });
      setDashboard((prev) => (prev ? { ...prev, hotel: { ...prev.hotel, image_url: hotel.image_url } } : prev));
      setBannerSaved(true);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Could not save your hotel banner.");
    } finally {
      setSavingBanner(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Profile</h1>
      <p style={styles.subtitle}>Your hotel's details, banner and commercial terms.</p>

      {loading && (
        <div style={styles.center}>
          <Spinner size="large" color={COLORS.primary} />
        </div>
      )}
      {!loading && error && <p style={styles.errorText}>{error}</p>}

      {!loading && dashboard && (
        <div style={styles.twoCol}>
          <div style={styles.col}>
            <Card style={{ marginBottom: 16, display: "flex", flexDirection: "column" }}>
              <Row label="Hotel name" value={dashboard.hotel.name} />
              <Row label="Status" value={dashboard.hotel.status.replace("_", " ")} capitalize />
              {dashboard.hotel.location && <Row label="Location" value={dashboard.hotel.location} />}
            </Card>

            <Card style={{ display: "flex", flexDirection: "column" }}>
              <span style={styles.sectionLabel}>HOTEL BANNER</span>
              {dashboard.hotel.image_url ? (
                <img src={dashboard.hotel.image_url} alt="" style={styles.bannerPreview} />
              ) : (
                <div style={styles.bannerPreviewFallback}>
                  <ImagePlus size={20} color={COLORS.textFaint} />
                </div>
              )}
              <div style={styles.imageInputRow}>
                <ImagePlus size={14} color={COLORS.textMuted} />
                <input
                  style={styles.imageInput}
                  placeholder="Paste a banner image URL"
                  value={bannerUrl}
                  onChange={(e) => {
                    setBannerUrl(e.target.value);
                    setBannerSaved(false);
                  }}
                  autoCapitalize="none"
                />
              </div>
              {bannerError && <p style={styles.bannerFeedbackError}>{bannerError}</p>}
              {bannerSaved && !bannerError && <p style={styles.bannerFeedbackOk}>Banner updated — students will see it on the hotel list.</p>}
              <PrimaryButton onPress={handleSaveBanner} loading={savingBanner} disabled={!bannerUrl.trim()} showArrow={false}>
                Save banner
              </PrimaryButton>
            </Card>
          </div>

          <div style={styles.col}>
            <Card style={{ marginBottom: 16, display: "flex", flexDirection: "column" }}>
              <span style={styles.sectionLabel}>COMMERCIAL TERMS</span>
              <Row label="Commission rate" value={`${dashboard.hotel.commission_percent}%`} />
              <Row label="Registration fee" value={`KSh ${Number(dashboard.hotel.registration_fee).toLocaleString()}`} />
            </Card>

            <Card style={{ display: "flex", flexDirection: "column" }}>
              <span style={styles.sectionLabel}>SETTLEMENT METHOD</span>
              <Row label="Method on file" value={PAYMENT_METHOD_LABEL[dashboard.hotel.payment_method || ""] || "Not set"} />
              {dashboard.hotel.settlement_schedule && <Row label="Schedule" value={dashboard.hotel.settlement_schedule} />}
              <p style={styles.note}>
                To change your settlement details, contact Mealvest support — this keeps a verified audit trail for every change,
                per Mealvest's financial security policy.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 60 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 16 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start", paddingBottom: 24 },
  col: { display: "flex", flexDirection: "column", minWidth: 0 },
  sectionLabel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: COLORS.textFaint, letterSpacing: 0.5, marginBottom: 8 },
  row: { display: "flex", flexDirection: "row", justifyContent: "space-between", gap: 10, paddingTop: 6, paddingBottom: 6 },
  rowLabel: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, flexShrink: 0 },
  rowValue: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text, textAlign: "right" },
  note: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, margin: "10px 0 0 0", lineHeight: "16px" },
  bannerPreview: { width: "100%", height: 140, borderRadius: RADIUS.sm, objectFit: "cover", backgroundColor: COLORS.borderSoft, marginBottom: 10 },
  bannerPreviewFallback: {
    width: "100%", height: 140, borderRadius: RADIUS.sm, backgroundColor: COLORS.accentSoft,
    display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${COLORS.borderSoft}`, marginBottom: 10,
  },
  imageInputRow: {
    display: "flex", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`, paddingLeft: 14, paddingRight: 14, marginBottom: 10,
  },
  imageInput: { flex: 1, paddingTop: 12, paddingBottom: 12, fontSize: 13, fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.text, outline: "none", backgroundColor: "transparent" },
  bannerFeedbackError: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, margin: "0 0 10px 0" },
  bannerFeedbackOk: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.success, margin: "0 0 10px 0" },
};
