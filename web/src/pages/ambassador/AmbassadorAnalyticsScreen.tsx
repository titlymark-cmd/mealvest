import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  TrendingUp,
  DollarSign,
  PieChart as PieIcon,
  BarChart2,
  Users,
  Utensils,
  Calendar,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchAmbassadorAnalytics,
  AmbassadorAnalyticsData,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

function formatCurrency(val: number): string {
  return `KSh ${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Pure SVG Multi-Series Line Chart for Financial Analytics
 */
function RevenueLineChart({
  points,
}: {
  points: Array<{ date: string; gmv: number; commission: number }>;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 680;
  const H = 220;
  const PAD_L = 60;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 35;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  if (points.length === 0) {
    return (
      <div style={styles.chartEmpty}>
        <span>No transaction points recorded in this window.</span>
      </div>
    );
  }

  const maxVal = Math.max(1000, ...points.map((p) => Math.max(p.gmv, p.commission))) * 1.15;

  const xAt = (i: number) => (points.length <= 1 ? PAD_L : PAD_L + (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;

  const gmvPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.gmv).toFixed(1)}`).join(" ");
  const commPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.commission).toFixed(1)}`).join(" ");

  const gridSteps = [0, 0.33, 0.66, 1];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Horizontal grid lines */}
        {gridSteps.map((fraction, idx) => {
          const val = maxVal * fraction;
          const y = yAt(val);
          return (
            <g key={idx}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#F3F4F6" strokeWidth={1} />
              <text x={PAD_L - 8} y={y + 4} textAnchor="end" fill="#9CA3AF" fontSize={10} fontFamily="sans-serif">
                {val >= 1000 ? `${Math.round(val / 1000)}k` : Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Lines */}
        <path d={gmvPath} fill="none" stroke="#2563EB" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <path d={commPath} fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots & Hit areas */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xAt(i)} cy={yAt(p.gmv)} r={3.5} fill="#2563EB" stroke="#FFFFFF" strokeWidth={1.5} />
            <circle cx={xAt(i)} cy={yAt(p.commission)} r={3.5} fill="#10B981" stroke="#FFFFFF" strokeWidth={1.5} />
            <rect
              x={xAt(i) - 15}
              y={PAD_T}
              width={30}
              height={innerH}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverIndex(i)}
            />
          </g>
        ))}

        {/* X Axis Labels */}
        {points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 5) === 0).map((p, i) => (
          <text
            key={i}
            x={xAt(points.indexOf(p))}
            y={H - 10}
            textAnchor="middle"
            fill="#6B7280"
            fontSize={10}
            fontFamily="sans-serif"
          >
            {p.date.slice(5)}
          </text>
        ))}
      </svg>

      {/* Hover Tooltip */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 16,
            backgroundColor: "#1F2937",
            color: "#FFFFFF",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Date: {points[hoverIndex].date}</div>
          <div style={{ color: "#93C5FD" }}>GMV: {formatCurrency(points[hoverIndex].gmv)}</div>
          <div style={{ color: "#6EE7B7" }}>Commission (10%): {formatCurrency(points[hoverIndex].commission)}</div>
        </div>
      )}

      {/* Legend */}
      <div style={styles.chartLegend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: "#2563EB" }} />
          <span>Gross Meal Volume (Total Student Orders)</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: "#10B981" }} />
          <span>MealVest Platform Commission (Revenue)</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Pure SVG Donut Chart for Active vs Inactive Students
 */
function ActivePieChart({ active, inactive }: { active: number; inactive: number }) {
  const total = active + inactive;
  const activePct = total > 0 ? Math.round((active / total) * 100) : 0;
  const radius = 55;
  const circ = 2 * Math.PI * radius;
  const activeOffset = circ - (activePct / 100) * circ;

  return (
    <div style={styles.pieContainer}>
      <div style={{ position: "relative", width: 140, height: 140 }}>
        <svg viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="70" cy="70" r={radius} stroke="#F3F4F6" strokeWidth="18" fill="transparent" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            stroke="#10B981"
            strokeWidth="18"
            fill="transparent"
            strokeDasharray={circ}
            strokeDashoffset={activeOffset}
            strokeLinecap="round"
          />
        </svg>
        <div style={styles.pieCenter}>
          <span style={styles.pieCenterVal}>{activePct}%</span>
          <span style={styles.pieCenterLabel}>Active</span>
        </div>
      </div>

      <div style={styles.pieDetails}>
        <div style={styles.pieDetailRow}>
          <div style={{ ...styles.pieColorKey, backgroundColor: "#10B981" }} />
          <span>Active Users ({active.toLocaleString()})</span>
        </div>
        <div style={styles.pieDetailRow}>
          <div style={{ ...styles.pieColorKey, backgroundColor: "#E5E7EB" }} />
          <span>Inactive ({inactive.toLocaleString()})</span>
        </div>
      </div>
    </div>
  );
}

export default function AmbassadorAnalyticsScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AmbassadorAnalyticsData | null>(null);
  const [range, setRange] = useState("30d");

  const loadData = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchAmbassadorAnalytics(authFetch, {
        universityId: currentUniversity.id,
        range,
      });
      setAnalytics(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity, range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !analytics) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Computing university analytics...</span>
      </div>
    );
  }

  if (!analytics) return null;

  const { studentAnalytics, financialAnalytics, engagementAnalytics } = analytics;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>University Analytics</h1>
          <p style={styles.subtitle}>
            In-depth student conversion funnel, financial volume & campus engagement
          </p>
        </div>

        <div style={styles.rangeSelector}>
          {["7d", "30d", "semester"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                ...styles.rangeBtn,
                backgroundColor: range === r ? "#111827" : "#FFFFFF",
                color: range === r ? "#FFFFFF" : "#4B5563",
              }}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "This Semester"}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Student Analytics & Conversion Funnel */}
      <div style={styles.row}>
        {/* Active vs Inactive Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <PieIcon size={18} color="#059669" />
            <h2 style={styles.cardTitle}>Student Activity Ratio</h2>
          </div>
          <p style={styles.cardSub}>Students with active budget/orders vs inactive accounts</p>
          <ActivePieChart active={studentAnalytics.activeCount} inactive={studentAnalytics.inactiveCount} />
          <div style={styles.retentionBadge}>
            <span>Retention Rate: </span>
            <strong>{studentAnalytics.retentionRate}%</strong>
          </div>
        </div>

        {/* Funnel Card */}
        <div style={{ ...styles.card, flex: 2 }}>
          <div style={styles.cardHeader}>
            <Layers size={18} color="#2563EB" />
            <h2 style={styles.cardTitle}>Student Plan Activation Funnel</h2>
          </div>
          <p style={styles.cardSub}>Step-by-step conversion from registration to recurring meal order redemption</p>

          <div style={styles.funnelList}>
            {studentAnalytics.funnel.map((step, idx) => (
              <div key={idx} style={styles.funnelItem}>
                <div style={styles.funnelLabelRow}>
                  <span style={styles.funnelStage}>{step.stage}</span>
                  <span style={styles.funnelCount}>
                    {step.count.toLocaleString()} ({step.pct}%)
                  </span>
                </div>
                <div style={styles.funnelBarTrack}>
                  <div
                    style={{
                      ...styles.funnelBarFill,
                      width: `${step.pct}%`,
                      backgroundColor: idx === 0 ? "#3B82F6" : idx === 1 ? "#6366F1" : idx === 2 ? "#8B5CF6" : "#10B981",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Financial Analytics (GMV vs Commission) */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <DollarSign size={20} color="#059669" />
          <h2 style={styles.cardTitle}>Financial Analytics & Platform Commission</h2>
        </div>
        <p style={styles.cardSub}>
          Clearly distinguishes student food order transactions (GMV) from MealVest's platform revenue (10% commission)
        </p>

        {/* Top 4 Financial Metric Tiles */}
        <div style={styles.financeMetricsRow}>
          <div style={styles.financeMetricTile}>
            <span style={styles.fTileLabel}>Total Meal Order Value (GMV)</span>
            <span style={styles.fTileVal}>{formatCurrency(financialAnalytics.totalOrderValueKes)}</span>
            <span style={styles.fTileSub}>Food sales across campus hotels</span>
          </div>
          <div style={{ ...styles.financeMetricTile, borderLeft: "4px solid #10B981" }}>
            <span style={styles.fTileLabel}>MealVest Commission (10%)</span>
            <span style={{ ...styles.fTileVal, color: "#059669" }}>
              {formatCurrency(financialAnalytics.totalCommissionKes)}
            </span>
            <span style={styles.fTileSub}>Net MealVest platform revenue</span>
          </div>
          <div style={styles.financeMetricTile}>
            <span style={styles.fTileLabel}>Completed Transactions</span>
            <span style={styles.fTileVal}>{financialAnalytics.totalCompletedTransactions.toLocaleString()}</span>
            <span style={styles.fTileSub}>Orders redeemed successfully</span>
          </div>
          <div style={styles.financeMetricTile}>
            <span style={styles.fTileLabel}>Average Transaction Value</span>
            <span style={styles.fTileVal}>{formatCurrency(financialAnalytics.averageOrderValueKes)}</span>
            <span style={styles.fTileSub}>Per meal redemption</span>
          </div>
        </div>

        {/* Interactive SVG Chart */}
        <div style={{ marginTop: 24 }}>
          <RevenueLineChart points={financialAnalytics.dailyTrend} />
        </div>
      </div>

      {/* Row 3: Hotel Breakdown & Student Engagement Periods */}
      <div style={styles.row}>
        {/* Commission by Hotel */}
        <div style={{ ...styles.card, flex: 2 }}>
          <div style={styles.cardHeader}>
            <Utensils size={18} color="#059669" />
            <h2 style={styles.cardTitle}>Hotel Order Volume & Commission Breakdown</h2>
          </div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Hotel Business</th>
                  <th style={styles.th}>Orders</th>
                  <th style={styles.th}>Order Value (GMV)</th>
                  <th style={styles.th}>MealVest Fee (10%)</th>
                </tr>
              </thead>
              <tbody>
                {financialAnalytics.hotelCommissionBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 24, color: "#9CA3AF" }}>
                      No hotel transactions recorded in this period.
                    </td>
                  </tr>
                ) : (
                  financialAnalytics.hotelCommissionBreakdown.map((h) => (
                    <tr key={h.hotelId} style={styles.tr}>
                      <td style={styles.td}>
                        <strong>{h.hotelName}</strong>
                      </td>
                      <td style={styles.td}>{h.ordersCount}</td>
                      <td style={styles.td}>{formatCurrency(h.gmvKes)}</td>
                      <td style={{ ...styles.td, color: "#059669", fontWeight: 700 }}>
                        {formatCurrency(h.commissionKes)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Peak Student Hours */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <BarChart2 size={18} color="#D97706" />
            <h2 style={styles.cardTitle}>Peak Student Meal Hours</h2>
          </div>
          <p style={styles.cardSub}>Most active dining redemption times</p>
          <div style={styles.periodsList}>
            {engagementAnalytics.activePeriods.map((p, idx) => (
              <div key={idx} style={styles.periodItem}>
                <div style={styles.periodNameRow}>
                  <span>{p.period}</span>
                  <span style={styles.periodCount}>{p.count} orders</span>
                </div>
                <div style={styles.periodBarTrack}>
                  <div
                    style={{
                      ...styles.periodBarFill,
                      width: `${Math.min(100, Math.max(15, p.count * 2))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
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
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
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
  rangeSelector: {
    display: "flex",
    backgroundColor: "#F3F4F6",
    padding: 4,
    borderRadius: 8,
    gap: 4,
  },
  rangeBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: 20,
  },
  card: {
    flex: 1,
    minWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  cardSub: {
    fontSize: 12,
    color: "#6B7280",
    margin: "4px 0 16px 0",
  },
  pieContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "16px 0",
  },
  pieCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  pieCenterVal: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
    lineHeight: 1,
  },
  pieCenterLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "#059669",
  },
  pieDetails: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  pieDetailRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#374151",
    fontWeight: 500,
  },
  pieColorKey: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  retentionBadge: {
    marginTop: 12,
    padding: "8px 12px",
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    fontSize: 12,
    color: "#065F46",
    display: "flex",
    justifyContent: "space-between",
  },
  funnelList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  funnelItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  funnelLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
  },
  funnelStage: {
    fontWeight: 600,
    color: "#374151",
  },
  funnelCount: {
    fontWeight: 700,
    color: "#111827",
  },
  funnelBarTrack: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  funnelBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  financeMetricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  financeMetricTile: {
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  fTileLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  fTileVal: {
    fontSize: 20,
    fontWeight: 800,
    color: "#111827",
  },
  fTileSub: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  chartEmpty: {
    height: 180,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9CA3AF",
    fontSize: 13,
  },
  chartLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 12,
    justifyContent: "center",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#4B5563",
    fontWeight: 500,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    textAlign: "left",
  },
  th: {
    padding: "10px 12px",
    backgroundColor: "#F9FAFB",
    color: "#6B7280",
    fontWeight: 600,
    borderBottom: "1px solid #E5E7EB",
  },
  tr: {
    borderBottom: "1px solid #F3F4F6",
  },
  td: {
    padding: "10px 12px",
    color: "#374151",
  },
  periodsList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  periodItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  periodNameRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
  },
  periodCount: {
    fontWeight: 700,
    color: "#111827",
  },
  periodBarTrack: {
    height: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 3,
    overflow: "hidden",
  },
  periodBarFill: {
    height: "100%",
    backgroundColor: "#D97706",
    borderRadius: 3,
  },
};
