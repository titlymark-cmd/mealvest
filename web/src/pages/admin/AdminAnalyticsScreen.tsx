import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { DollarSign, TrendingUp, Wallet, Receipt } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { formatKsh } from "../../components/admin/adminFormat";
import { fetchRevenueAnalytics, RevenueAnalytics, RevenueDailyPoint } from "../../services/adminApi";

// Two-series categorical pair, validated for CVD separation (see
// dataviz skill's scripts/validate_palette.js — ALL CHECKS PASS at
// ΔE 24.7 deutan / 33.6 normal-vision). MEALVEST's own brand hues are
// entirely warm (red/orange/gold) and fail that check against each
// other, so this chart borrows the two leading slots of the skill's
// validated default categorical palette instead of forcing an unsafe
// pair — orange for the "top line" metric fits the warm brand best,
// blue for commission reads as clearly distinct.
const COLOR_GROSS = "#eb6834";
const COLOR_COMMISSION = "#2a78d6";

const RANGE_OPTIONS = [7, 30, 90] as const;
type RangeOption = (typeof RANGE_OPTIONS)[number];

function formatKshCompact(value: number): string {
  if (value >= 1_000_000) return `KSh ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `KSh ${(value / 1_000).toFixed(1)}K`;
  return `KSh ${Math.round(value)}`;
}

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card style={styles.statCard}>
      <div style={styles.statIcon}>{icon}</div>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
      {sub && <span style={styles.statSub}>{sub}</span>}
    </Card>
  );
}

/**
 * Line chart: gross meal revenue vs MEALVEST commission over the
 * selected window. Follows the dataviz skill's mark spec — 2px lines,
 * round caps, >=8px end markers with a surface ring, hairline
 * recessive gridlines, a legend (two series), and a hover
 * crosshair+tooltip. Single shared y-axis (both series are the same
 * KSh unit) — never a dual-axis chart.
 */
function RevenueLineChart({ daily }: { daily: RevenueDailyPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const W = 720;
  const H = 260;
  const PAD_LEFT = 56;
  const PAD_RIGHT = 16;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 32;
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const points = daily.map((d) => ({
    date: d.date,
    gross: Number(d.gross),
    commission: Number(d.commission),
  }));

  const maxValue = niceMax(Math.max(1, ...points.map((p) => Math.max(p.gross, p.commission))) * 1.15);
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxValue);

  const xAt = (i: number) => (points.length <= 1 ? PAD_LEFT : PAD_LEFT + (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => PAD_TOP + innerH - (v / maxValue) * innerH;

  const linePath = (key: "gross" | "commission") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`).join(" ");

  // Show at most ~6 x-axis labels regardless of range length, evenly
  // spaced, always including the first and last day.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = points.filter((_, i) => i === 0 || i === points.length - 1 || i % labelStep === 0);

  // Plain function, not useCallback — it closes over `points`/`xAt`
  // (recomputed every render from props) and is only ever called from
  // this component's own JSX handlers, never passed down as a memoized
  // child's dependency, so there's nothing to gain from memoizing it.
  function handlePointer(clientX: number) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((_, i) => {
      const dist = Math.abs(xAt(i) - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  // Flip the tooltip to the left half once the crosshair passes the
  // midpoint, so it never runs off the right edge of the chart.
  const tooltipOnLeft = hoverIndex !== null && hoverIndex > points.length / 2;

  return (
    <div style={{ position: "relative" }}>
      <div style={styles.legendRow}>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendSwatch, backgroundColor: COLOR_GROSS }} />
          Gross meal revenue
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendSwatch, backgroundColor: COLOR_COMMISSION }} />
          MEALVEST commission
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={styles.chartSvg}
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchStart={(e) => handlePointer(e.touches[0].clientX)}
        onTouchMove={(e) => handlePointer(e.touches[0].clientX)}
        onTouchEnd={() => setHoverIndex(null)}
      >
        {gridLines.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke={COLORS.borderSoft}
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 8} y={yAt(v) + 4} textAnchor="end" style={styles.axisLabel}>
              {formatKshCompact(v)}
            </text>
          </g>
        ))}

        {xLabels.map((p) => {
          const i = points.indexOf(p);
          return (
            <text key={p.date} x={xAt(i)} y={H - 10} textAnchor="middle" style={styles.axisLabel}>
              {shortDate(p.date)}
            </text>
          );
        })}

        {hoverIndex !== null && (
          <line
            x1={xAt(hoverIndex)}
            x2={xAt(hoverIndex)}
            y1={PAD_TOP}
            y2={PAD_TOP + innerH}
            stroke={COLORS.textFaint}
            strokeWidth={1}
          />
        )}

        <path d={linePath("gross")} fill="none" stroke={COLOR_GROSS} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath("commission")} fill="none" stroke={COLOR_COMMISSION} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {points.length > 0 && (
          <>
            <circle cx={xAt(points.length - 1)} cy={yAt(points[points.length - 1].gross)} r={5} fill={COLOR_GROSS} stroke={COLORS.card} strokeWidth={2} />
            <circle cx={xAt(points.length - 1)} cy={yAt(points[points.length - 1].commission)} r={5} fill={COLOR_COMMISSION} stroke={COLORS.card} strokeWidth={2} />
          </>
        )}

        {hovered && (
          <>
            <circle cx={xAt(hoverIndex!)} cy={yAt(hovered.gross)} r={5} fill={COLOR_GROSS} stroke={COLORS.card} strokeWidth={2} />
            <circle cx={xAt(hoverIndex!)} cy={yAt(hovered.commission)} r={5} fill={COLOR_COMMISSION} stroke={COLORS.card} strokeWidth={2} />
          </>
        )}
      </svg>

      {hovered && hoverIndex !== null && (
        <div
          style={{
            ...styles.tooltip,
            left: tooltipOnLeft ? undefined : `${(xAt(hoverIndex) / W) * 100}%`,
            right: tooltipOnLeft ? `${100 - (xAt(hoverIndex) / W) * 100}%` : undefined,
          }}
        >
          <span style={styles.tooltipDate}>{shortDate(hovered.date)}</span>
          <div style={styles.tooltipRow}>
            <span style={{ ...styles.legendSwatch, backgroundColor: COLOR_GROSS }} />
            <span style={styles.tooltipLabel}>Gross</span>
            <span style={styles.tooltipValue}>{formatKsh(hovered.gross)}</span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={{ ...styles.legendSwatch, backgroundColor: COLOR_COMMISSION }} />
            <span style={styles.tooltipLabel}>Commission</span>
            <span style={styles.tooltipValue}>{formatKsh(hovered.commission)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single-series ranked bar chart — no legend needed (one hue, named by the panel title). Direct value labels at each bar's end. */
function CommissionByHotelChart({ rows }: { rows: { id: string; name: string; commission: number }[] }) {
  const maxValue = Math.max(1, ...rows.map((r) => r.commission));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r) => (
        <div key={r.id}>
          <div style={styles.hotelBarHeader}>
            <span style={styles.hotelBarName}>{r.name}</span>
            <span style={styles.hotelBarValue}>{formatKsh(r.commission)}</span>
          </div>
          <div style={styles.hotelBarTrack}>
            <div style={{ ...styles.hotelBarFill, width: `${Math.max(3, (r.commission / maxValue) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsScreen() {
  const { authFetch } = useAuth();
  const [range, setRange] = useState<RangeOption>(30);
  const [data, setData] = useState<RevenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (days: RangeOption) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchRevenueAnalytics(authFetch, days);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load revenue analytics.");
      } finally {
        setLoading(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    load(range);
  }, [load, range]);

  const byHotelRows = useMemo(
    () => (data?.byHotel ?? []).map((h) => ({ id: h.id, name: h.name, commission: Number(h.commission) })),
    [data]
  );

  const effectiveRate = useMemo(() => {
    if (!data) return null;
    const gross = Number(data.lifetime.gross_transaction_value);
    const commission = Number(data.lifetime.total_commission);
    if (gross <= 0) return null;
    return ((commission / gross) * 100).toFixed(1);
  }, [data]);

  if (loading && !data) {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Revenue &amp; Commission</h1>
          <p style={styles.subtitle}>How much MEALVEST is making from hotel commissions, over time.</p>
        </div>
        <div style={styles.rangeRow}>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setRange(opt)}
              style={{ ...styles.rangeBtn, ...(range === opt ? styles.rangeBtnActive : null) }}
            >
              <span style={{ ...styles.rangeBtnText, ...(range === opt ? styles.rangeBtnTextActive : null) }}>
                {opt}d
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {data && (
        <>
          <div style={styles.statsGrid}>
            <StatTile
              icon={<TrendingUp size={16} color={COLORS.success} />}
              label="Total commission earned"
              value={formatKsh(data.lifetime.total_commission)}
              sub="All-time"
            />
            <StatTile
              icon={<DollarSign size={16} color={COLORS.primary} />}
              label="Gross transaction value"
              value={formatKsh(data.lifetime.gross_transaction_value)}
              sub={`${data.lifetime.total_redeemed} meals redeemed, all-time`}
            />
            <StatTile
              icon={<Wallet size={16} color={COLORS.accent} />}
              label="Total plans collected"
              value={formatKsh(data.lifetime.total_plans_collected)}
              sub={`${data.lifetime.total_plans_count} payments, all-time`}
            />
            <StatTile
              icon={<Receipt size={16} color={COLORS.primaryDark} />}
              label="Effective commission rate"
              value={effectiveRate !== null ? `${effectiveRate}%` : "—"}
              sub="Commission ÷ gross, all-time"
            />
          </div>

          <Card style={styles.panelCard}>
            <div style={styles.panelHeaderRow}>
              <span style={styles.panelTitle}>Revenue over the last {range} days</span>
              <span style={styles.panelSubtitle}>Hover the chart for exact daily figures</span>
            </div>
            <RevenueLineChart daily={data.daily} />
          </Card>

          <Card style={styles.panelCard}>
            <div style={styles.panelHeaderRow}>
              <span style={styles.panelTitle}>Top hotels by commission generated</span>
              <span style={styles.panelSubtitle}>Last {range} days</span>
            </div>
            {byHotelRows.length === 0 ? (
              <p style={styles.emptyText}>No commission has been earned in this window yet.</p>
            ) : (
              <CommissionByHotelChart rows={byHotelRows} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column", gap: 20 },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, margin: 0 },
  headerRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 14 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 24, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, margin: "6px 0 0 0" },
  rangeRow: { display: "flex", flexDirection: "row", gap: 6, backgroundColor: COLORS.bgDeep, borderRadius: RADIUS.pill, padding: 4 },
  rangeBtn: { padding: "7px 16px", borderRadius: RADIUS.pill },
  rangeBtnActive: { backgroundColor: COLORS.primary },
  rangeBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textOnDarkMuted },
  rangeBtnTextActive: { color: "#fff" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 },
  statCard: { display: "flex", flexDirection: "column", padding: 16 },
  statIcon: { marginBottom: 8 },
  statLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  statValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text, marginTop: 2 },
  statSub: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 4 },
  panelCard: { display: "flex", flexDirection: "column", padding: 20 },
  panelHeaderRow: { display: "flex", flexDirection: "column", marginBottom: 16 },
  panelTitle: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  panelSubtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, textAlign: "center", padding: "16px 0" },
  legendRow: { display: "flex", flexDirection: "row", gap: 18, marginBottom: 10 },
  legendItem: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 12, color: COLORS.textMuted },
  legendSwatch: { width: 10, height: 10, borderRadius: 3, flexShrink: 0, display: "inline-block" },
  chartSvg: { width: "100%", height: "auto", display: "block" },
  axisLabel: { fontFamily: FONTS.body, fontSize: 10, fill: COLORS.textFaint },
  tooltip: {
    position: "absolute",
    top: 8,
    transform: "translateX(-50%)",
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.sm,
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    pointerEvents: "none",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    minWidth: 140,
  },
  tooltipDate: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.card, marginBottom: 2 },
  tooltipRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6 },
  tooltipLabel: { fontFamily: FONTS.body, fontSize: 11, color: "rgba(252,244,234,0.75)", flex: 1 },
  tooltipValue: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.card },
  hotelBarHeader: { display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  hotelBarName: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  hotelBarValue: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 13, color: COLORS.primary },
  hotelBarTrack: { height: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.borderSoft, overflow: "hidden" },
  hotelBarFill: { height: "100%", borderRadius: RADIUS.pill, backgroundColor: COLORS.primary },
};
