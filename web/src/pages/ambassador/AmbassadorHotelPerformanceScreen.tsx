import React, { useEffect, useState, useCallback } from "react";
import {
  UtensilsCrossed,
  Star,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  MapPin,
  Phone,
  Clock,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchHotelDepartmentData,
  HotelDepartmentData,
  HotelPartnerProfile,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

export default function AmbassadorHotelPerformanceScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HotelDepartmentData | null>(null);

  const loadData = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchHotelDepartmentData(authFetch, currentUniversity.id);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !data) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Loading hotel performance metrics...</span>
      </div>
    );
  }

  if (!data) return null;

  const { partners } = data;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Hotel Performance & Quality</h1>
          <p style={styles.subtitle}>
            Order fulfillment, menu availability, meal volume & student ratings for campus partners
          </p>
        </div>
      </div>

      {/* Hotel Cards Grid */}
      <div style={styles.partnerGrid}>
        {partners.length === 0 ? (
          <div style={styles.emptyCard}>
            <UtensilsCrossed size={32} color="#9CA3AF" />
            <p>No active hotel partners recorded yet.</p>
          </div>
        ) : (
          partners.map((p) => (
            <div key={p.id} style={styles.partnerCard}>
              <div style={styles.partnerTop}>
                <div>
                  <h3 style={styles.partnerName}>{p.name}</h3>
                  <span style={styles.partnerLocation}>
                    <MapPin size={12} style={{ marginRight: 4 }} />
                    {p.location || "Campus vicinity"}
                  </span>
                </div>
                <div style={styles.ratingBadge}>
                  <Star size={13} fill="#F59E0B" color="#F59E0B" />
                  <span>{p.rating}</span>
                </div>
              </div>

              <div style={styles.metricsBox}>
                <div style={styles.metricItem}>
                  <span style={styles.mVal}>{p.ordersCount}</span>
                  <span style={styles.mLbl}>Orders Fulfilled</span>
                </div>
                <div style={styles.metricItem}>
                  <span style={styles.mVal}>{p.menuCount}</span>
                  <span style={styles.mLbl}>Menu Items</span>
                </div>
                <div style={styles.metricItem}>
                  <span style={{ ...styles.mVal, color: "#059669" }}>
                    KSh {p.commissionKes.toLocaleString()}
                  </span>
                  <span style={styles.mLbl}>10% Fee Generated</span>
                </div>
              </div>

              <div style={styles.cardFooter}>
                <span style={styles.gmvText}>
                  Total Food GMV: <strong>KSh {p.gmvKes.toLocaleString()}</strong>
                </span>
                <span style={styles.activeTag}>Daily Payout Active</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  loadingContainer: {
    height: 400,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    margin: "4px 0 0 0",
  },
  partnerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: 16,
  },
  partnerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 18,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
  },
  partnerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  partnerName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  partnerLocation: {
    fontSize: 12,
    color: "#6B7280",
    display: "flex",
    alignItems: "center",
    marginTop: 2,
  },
  ratingBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    padding: "3px 8px",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 12,
  },
  metricsBox: {
    display: "flex",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
  },
  metricItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  mVal: {
    fontSize: 15,
    fontWeight: 800,
    color: "#111827",
  },
  mLbl: {
    fontSize: 10,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
    paddingTop: 8,
    borderTop: "1px solid #F3F4F6",
  },
  gmvText: {
    color: "#374151",
  },
  activeTag: {
    color: "#059669",
    fontWeight: 600,
    fontSize: 11,
  },
  emptyCard: {
    gridColumn: "1 / -1",
    padding: 40,
    textAlign: "center",
    color: "#9CA3AF",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    border: "1px dashed #E5E7EB",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
};
