import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  UserCheck,
  CreditCard,
  Building2,
  Clock,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Calendar,
  Activity,
  CheckCircle,
  HelpCircle,
  Award,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchAmbassadorOverview,
  AmbassadorOverviewData,
  KpiCardData,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

const RANGE_TABS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "semester", label: "This Semester" },
];

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `KSh ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function MetricCard({
  icon: Icon,
  title,
  kpi,
  isCurrency = false,
  highlight = false,
}: {
  icon: React.ElementType;
  title: string;
  kpi: KpiCardData;
  isCurrency?: boolean;
  highlight?: boolean;
}) {
  const formattedVal = isCurrency
    ? formatCurrency(kpi.value)
    : typeof kpi.value === "number"
    ? kpi.value.toLocaleString()
    : kpi.value;

  const isUp = kpi.trend === "up";
  const isDown = kpi.trend === "down";

  return (
    <div
      style={{
        ...styles.metricCard,
        backgroundColor: highlight ? "#F0FDF4" : "#FFFFFF",
        borderColor: highlight ? "#86EFAC" : "#E5E7EB",
      }}
    >
      <div style={styles.metricHeader}>
        <div style={{ ...styles.iconBadge, backgroundColor: highlight ? "#DCFCE7" : "#F3F4F6" }}>
          <Icon size={18} color={highlight ? "#16A34A" : "#4B5563"} />
        </div>
        {kpi.percentChange !== undefined && (
          <div
            style={{
              ...styles.trendBadge,
              backgroundColor: isUp ? "#ECFDF5" : isDown ? "#FEF2F2" : "#F3F4F6",
              color: isUp ? "#059669" : isDown ? "#DC2626" : "#6B7280",
            }}
          >
            {isUp && <TrendingUp size={12} />}
            {isDown && <TrendingDown size={12} />}
            <span>{kpi.percentChange > 0 ? `+${kpi.percentChange}%` : `${kpi.percentChange}%`}</span>
          </div>
        )}
      </div>

      <div style={styles.metricBody}>
        <span style={styles.metricTitle}>{title}</span>
        <span style={styles.metricValue}>{formattedVal}</span>
        {kpi.sub && <span style={styles.metricSub}>{kpi.sub}</span>}
      </div>
    </div>
  );
}

export default function AmbassadorOverviewScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AmbassadorOverviewData | null>(null);
  const [range, setRange] = useState("30d");
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAmbassadorOverview(authFetch, {
        universityId: currentUniversity.id,
        range,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load command centre overview.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity, range]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (loading && !data) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ color: "#4B5563", fontSize: 14 }}>Aggregating university metrics...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.errorContainer}>
        <p style={{ color: "#DC2626", fontWeight: 600 }}>{error || "No data available."}</p>
        <button onClick={loadMetrics} style={styles.retryBtn}>
          Try Again
        </button>
      </div>
    );
  }

  const { performanceScore, kpis, recentActivity } = data;

  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.heading}>{currentUniversity?.name} Command Centre</h1>
          <p style={styles.subheading}>
            Operational health, student acquisition, hotel supply & financial analytics
          </p>
        </div>

        {/* Date Filter Tabs */}
        <div style={styles.rangeTabs}>
          {RANGE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRange(tab.id)}
              style={{
                ...styles.rangeTab,
                backgroundColor: range === tab.id ? "#111827" : "#FFFFFF",
                color: range === tab.id ? "#FFFFFF" : "#4B5563",
                fontWeight: range === tab.id ? 600 : 500,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* University Performance Scorecard (Spec Section 4 & Score Table) */}
      <div style={styles.scoreBanner}>
        <div style={styles.scoreGaugeContainer}>
          <div style={styles.scoreCircle}>
            <span style={styles.scoreNumber}>{performanceScore.overall}</span>
            <span style={styles.scoreMax}>/100</span>
          </div>
          <div style={styles.scoreGaugeInfo}>
            <div style={styles.scoreTitleRow}>
              <Award size={18} color="#059669" />
              <span style={styles.scoreTitle}>University Branch Performance Score</span>
            </div>
            <p style={styles.scoreDesc}>
              Dynamic operational rating based on 5 weighted pillars: Student Acquisition (30%), Hotel Partnerships (25%),
              Active Usage (20%), CSAT (15%), and Team Productivity (10%).
            </p>
          </div>
        </div>

        <div style={styles.scoreBars}>
          <div style={styles.scoreBarItem}>
            <div style={styles.scoreBarLabelRow}>
              <span>Student Acquisition (30%)</span>
              <span style={styles.scoreBarVal}>{performanceScore.breakdown.studentAcquisition.score}/100</span>
            </div>
            <div style={styles.scoreBarTrack}>
              <div
                style={{
                  ...styles.scoreBarFill,
                  width: `${performanceScore.breakdown.studentAcquisition.score}%`,
                  backgroundColor: "#059669",
                }}
              />
            </div>
          </div>

          <div style={styles.scoreBarItem}>
            <div style={styles.scoreBarLabelRow}>
              <span>Hotel Partnerships (25%)</span>
              <span style={styles.scoreBarVal}>{performanceScore.breakdown.hotelPartnerships.score}/100</span>
            </div>
            <div style={styles.scoreBarTrack}>
              <div
                style={{
                  ...styles.scoreBarFill,
                  width: `${performanceScore.breakdown.hotelPartnerships.score}%`,
                  backgroundColor: "#2563EB",
                }}
              />
            </div>
          </div>

          <div style={styles.scoreBarItem}>
            <div style={styles.scoreBarLabelRow}>
              <span>Active Student Usage (20%)</span>
              <span style={styles.scoreBarVal}>{performanceScore.breakdown.activeStudentUsage.score}/100</span>
            </div>
            <div style={styles.scoreBarTrack}>
              <div
                style={{
                  ...styles.scoreBarFill,
                  width: `${performanceScore.breakdown.activeStudentUsage.score}%`,
                  backgroundColor: "#D97706",
                }}
              />
            </div>
          </div>

          <div style={styles.scoreBarItem}>
            <div style={styles.scoreBarLabelRow}>
              <span>Customer Care & CSAT (15%)</span>
              <span style={styles.scoreBarVal}>{performanceScore.breakdown.customerSatisfaction.score}/100</span>
            </div>
            <div style={styles.scoreBarTrack}>
              <div
                style={{
                  ...styles.scoreBarFill,
                  width: `${performanceScore.breakdown.customerSatisfaction.score}%`,
                  backgroundColor: "#7C3AED",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 12 Performance KPI Cards */}
      <div style={styles.kpiGrid}>
        <MetricCard
          icon={Users}
          title="Total Registered Students"
          kpi={kpis.totalRegisteredStudents}
        />
        <MetricCard
          icon={UserCheck}
          title="Active MealVest Users"
          kpi={kpis.activeUsers}
          highlight
        />
        <MetricCard
          icon={CreditCard}
          title="Students with Active Plans"
          kpi={kpis.studentsWithActivePlans}
        />
        <MetricCard
          icon={Activity}
          title="New Student Registrations"
          kpi={kpis.newRegistrations}
        />
        <MetricCard
          icon={DollarSign}
          title="Total Paying Students"
          kpi={kpis.totalPayingStudents}
        />
        <MetricCard
          icon={Sparkles}
          title="Student Conversion Rate"
          kpi={kpis.studentConversionRate}
        />
        <MetricCard
          icon={Building2}
          title="Hotels Onboarded"
          kpi={kpis.totalHotelsOnboarded}
        />
        <MetricCard
          icon={Clock}
          title="Hotels Awaiting Approval"
          kpi={kpis.hotelsAwaitingApproval}
        />
        <MetricCard
          icon={ShoppingBag}
          title="Total Meal Orders"
          kpi={kpis.totalMealOrders}
        />
        <MetricCard
          icon={DollarSign}
          title="Total Transaction Value (GMV)"
          kpi={kpis.totalTransactionValue}
          isCurrency
        />
        <MetricCard
          icon={TrendingUp}
          title="MealVest Commission (Revenue)"
          kpi={kpis.totalCommissionGenerated}
          isCurrency
          highlight
        />
        <MetricCard
          icon={Sparkles}
          title="MealBoost Participation"
          kpi={kpis.mealBoostParticipation}
        />
      </div>

      {/* Operational Highlights & Activity Feed */}
      <div style={styles.bottomSection}>
        {/* Quick Department Shortcuts */}
        <div style={styles.shortcutsCard}>
          <h2 style={styles.cardHeading}>Department Quick Command</h2>
          <div style={styles.shortcutLinks}>
            <Link to="/ambassador/marketing" style={styles.shortcutItem}>
              <div>
                <span style={styles.shortcutTitle}>Digital Marketing</span>
                <span style={styles.shortcutSub}>Campaigns, poster assets & referrals</span>
              </div>
              <ArrowRight size={16} color="#059669" />
            </Link>

            <Link to="/ambassador/hotels" style={styles.shortcutItem}>
              <div>
                <span style={styles.shortcutTitle}>Hotel Partnerships</span>
                <span style={styles.shortcutSub}>Recruitment pipeline & menu onboarding</span>
              </div>
              <ArrowRight size={16} color="#059669" />
            </Link>

            <Link to="/ambassador/customer-care" style={styles.shortcutItem}>
              <div>
                <span style={styles.shortcutTitle}>Customer Care</span>
                <span style={styles.shortcutSub}>Student complaints & escalation desk</span>
              </div>
              <ArrowRight size={16} color="#059669" />
            </Link>

            <Link to="/ambassador/reports" style={styles.shortcutItem}>
              <div>
                <span style={styles.shortcutTitle}>Executive Reports</span>
                <span style={styles.shortcutSub}>Generate & submit official branch reports</span>
              </div>
              <ArrowRight size={16} color="#059669" />
            </Link>
          </div>
        </div>

        {/* Real-time Activity Feed */}
        <div style={styles.activityCard}>
          <div style={styles.activityHeader}>
            <h2 style={styles.cardHeading}>Campus Operational Activity</h2>
            <span style={styles.liveIndicator}>• Live Feed</span>
          </div>

          <div style={styles.activityList}>
            {recentActivity.length === 0 ? (
              <div style={styles.emptyState}>
                <CheckCircle size={28} color="#9CA3AF" />
                <span>No recent actions recorded. All systems running normally.</span>
              </div>
            ) : (
              recentActivity.map((act) => (
                <div key={act.id} style={styles.activityItem}>
                  <div style={styles.activityDot} />
                  <div style={styles.activityContent}>
                    <div style={styles.activityTop}>
                      <span style={styles.activityUser}>{act.user_name || "Campus Member"}</span>
                      <span style={styles.activityDeptBadge}>{act.department}</span>
                      <span style={styles.activityTime}>
                        {new Date(act.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span style={styles.activityAction}>
                      {act.action_type.replace(/_/g, " ")}: {act.entity_type.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
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
  errorContainer: {
    height: 300,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  retryBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    backgroundColor: "#111827",
    color: "#FFFFFF",
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
  },
  pageHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
    margin: 0,
  },
  subheading: {
    fontSize: 13,
    color: "#6B7280",
    margin: "4px 0 0 0",
  },
  rangeTabs: {
    display: "flex",
    backgroundColor: "#F3F4F6",
    padding: 4,
    borderRadius: 10,
    gap: 4,
  },
  rangeTab: {
    border: "none",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  scoreBanner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    border: "1px solid #E5E7EB",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
  },
  scoreGaugeContainer: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  scoreCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#ECFDF5",
    border: "3px solid #10B981",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scoreNumber: {
    fontSize: 32,
    fontWeight: 800,
    color: "#065F46",
    lineHeight: 1,
  },
  scoreMax: {
    fontSize: 11,
    fontWeight: 600,
    color: "#059669",
  },
  scoreGaugeInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  scoreTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
  },
  scoreDesc: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 1.5,
    margin: 0,
  },
  scoreBars: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    justifyContent: "center",
  },
  scoreBarItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  scoreBarLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#374151",
    fontWeight: 500,
  },
  scoreBarVal: {
    fontWeight: 700,
    color: "#111827",
  },
  scoreBarTrack: {
    height: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: 16,
  },
  metricCard: {
    borderRadius: 12,
    padding: 16,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  metricHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  trendBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 6,
  },
  metricBody: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  metricTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
    letterSpacing: "-0.02em",
  },
  metricSub: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  bottomSection: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 24,
  },
  shortcutsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    border: "1px solid #E5E7EB",
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 16px 0",
  },
  shortcutLinks: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  shortcutItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #F3F4F6",
    backgroundColor: "#FAFAFA",
    textDecoration: "none",
    transition: "background-color 0.15s ease",
  },
  shortcutTitle: {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    color: "#1F2937",
  },
  shortcutSub: {
    display: "block",
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  activityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    border: "1px solid #E5E7EB",
  },
  activityHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  liveIndicator: {
    fontSize: 11,
    fontWeight: 700,
    color: "#059669",
  },
  activityList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 0",
    gap: 8,
    color: "#9CA3AF",
    fontSize: 13,
    textAlign: "center",
  },
  activityItem: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    marginTop: 6,
    flexShrink: 0,
  },
  activityContent: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
  },
  activityTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  activityUser: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1F2937",
  },
  activityDeptBadge: {
    fontSize: 9,
    fontWeight: 700,
    backgroundColor: "#F3F4F6",
    color: "#4B5563",
    padding: "1px 5px",
    borderRadius: 4,
    textTransform: "uppercase",
  },
  activityTime: {
    fontSize: 11,
    color: "#9CA3AF",
    marginLeft: "auto",
  },
  activityAction: {
    fontSize: 12,
    color: "#4B5563",
    textTransform: "capitalize",
  },
};
