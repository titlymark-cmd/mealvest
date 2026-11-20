import React, { useEffect, useState, useCallback } from "react";
import {
  UserPlus,
  Users,
  CheckCircle2,
  TrendingUp,
  Award,
  Search,
  Filter,
  Calendar,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchAmbassadorAnalytics,
  AmbassadorAnalyticsData,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

export default function AmbassadorAcquisitionScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AmbassadorAnalyticsData | null>(null);

  const loadData = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchAmbassadorAnalytics(authFetch, {
        universityId: currentUniversity.id,
        range: "30d",
      });
      setAnalytics(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !analytics) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Analyzing student acquisition...</span>
      </div>
    );
  }

  if (!analytics) return null;

  const { studentAnalytics } = analytics;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Student Acquisition Command</h1>
          <p style={styles.subtitle}>
            Tracking student registrations, admission onboarding & conversion funnel for {currentUniversity?.name}
          </p>
        </div>
      </div>

      {/* Top Acquisition Highlights */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Total Campus Students</span>
          <span style={styles.kpiVal}>{studentAnalytics.totalRegistered.toLocaleString()}</span>
          <span style={styles.kpiSub}>Registered on MealVest</span>
        </div>
        <div style={{ ...styles.kpiCard, borderLeft: "4px solid #10B981" }}>
          <span style={styles.kpiLabel}>Active Budget Users</span>
          <span style={{ ...styles.kpiVal, color: "#059669" }}>
            {studentAnalytics.activeCount.toLocaleString()}
          </span>
          <span style={styles.kpiSub}>{studentAnalytics.activePct}% activation rate</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Campus Retention Rate</span>
          <span style={styles.kpiVal}>{studentAnalytics.retentionRate}%</span>
          <span style={styles.kpiSub}>Monthly repeat budgeting</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Daily Acquisition Run Rate</span>
          <span style={styles.kpiVal}>~12/day</span>
          <span style={styles.kpiSub}>Average new signups</span>
        </div>
      </div>

      {/* Daily Student Acquisition Chart */}
      <div style={styles.card}>
        <h2 style={styles.cardHeading}>Daily Student Acquisition Trend (Last 30 Days)</h2>
        <p style={styles.cardSub}>New students signing up and verifying their accounts</p>

        <div style={styles.barChartContainer}>
          {studentAnalytics.dailyRegistrationTrend.length === 0 ? (
            <div style={styles.emptyChart}>No daily registrations in current period.</div>
          ) : (
            studentAnalytics.dailyRegistrationTrend.map((d, idx) => {
              const maxCount = Math.max(1, ...studentAnalytics.dailyRegistrationTrend.map((x) => x.count));
              const heightPct = Math.round((d.count / maxCount) * 100);
              return (
                <div key={idx} style={styles.barCol}>
                  <span style={styles.barVal}>{d.count}</span>
                  <div style={styles.barTrack}>
                    <div style={{ ...styles.barFill, height: `${heightPct}%` }} />
                  </div>
                  <span style={styles.barDate}>{d.date.slice(5)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Acquisition Funnel Deep Dive */}
      <div style={styles.card}>
        <h2 style={styles.cardHeading}>Onboarding & Activation Funnel</h2>
        <div style={styles.funnelGrid}>
          {studentAnalytics.funnel.map((step, idx) => (
            <div key={idx} style={styles.funnelCard}>
              <span style={styles.funnelStepNum}>Stage {idx + 1}</span>
              <h3 style={styles.funnelTitle}>{step.stage}</h3>
              <span style={styles.funnelCount}>{step.count.toLocaleString()} students</span>
              <div style={styles.funnelBar}>
                <div style={{ ...styles.funnelFill, width: `${step.pct}%` }} />
              </div>
              <span style={styles.funnelPct}>{step.pct}% conversion</span>
            </div>
          ))}
        </div>
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
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  kpiCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  kpiVal: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
  },
  kpiSub: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    border: "1px solid #E5E7EB",
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  cardSub: {
    fontSize: 12,
    color: "#6B7280",
    margin: "4px 0 20px 0",
  },
  barChartContainer: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    height: 180,
    paddingTop: 20,
    overflowX: "auto",
  },
  emptyChart: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    color: "#9CA3AF",
    fontSize: 13,
  },
  barCol: {
    flex: "1 0 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    height: "100%",
    justifyContent: "flex-end",
  },
  barVal: {
    fontSize: 10,
    fontWeight: 700,
    color: "#374151",
  },
  barTrack: {
    width: 14,
    height: "75%",
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    display: "flex",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    backgroundColor: "#10B981",
    borderRadius: 6,
  },
  barDate: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  funnelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  funnelCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 16,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  funnelStepNum: {
    fontSize: 10,
    fontWeight: 700,
    color: "#059669",
    textTransform: "uppercase",
  },
  funnelTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  funnelCount: {
    fontSize: 16,
    fontWeight: 800,
    color: "#1F2937",
  },
  funnelBar: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
    margin: "4px 0",
  },
  funnelFill: {
    height: "100%",
    backgroundColor: "#10B981",
    borderRadius: 3,
  },
  funnelPct: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: 600,
  },
};
