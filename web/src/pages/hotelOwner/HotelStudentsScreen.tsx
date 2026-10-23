import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GraduationCap, SearchX, Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { badgeColorFor } from "../../components/shared/format";
import { SkeletonRegion, SkeletonCards } from "../../components/ui/Skeleton";
import {
  Banner,
  Chips,
  EmptyState,
  PageHeader,
  Panel,
  SearchBox,
  StatusPill,
  BUDGET_STATUS,
  formatDate,
  whole,
} from "../../components/hotel/hd";
import { fetchHotelStudents, HotelStudent } from "../../services/hotelStaffApi";

const PAGE = 24;
const BACKEND_CAP = 300; // listHotelStudents LIMIT

export default function HotelStudentsScreen() {
  const { authFetch } = useAuth();
  const [students, setStudents] = useState<HotelStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      setStudents(await fetchHotelStudents(authFetch));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your students.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setShown(PAGE), [query, filter]);

  const activeCount = students.filter((s) => s.budget_status === "active").length;
  const chips = [
    { value: "all", label: "All", count: students.length },
    { value: "active", label: "Active plans", count: activeCount },
    { value: "ended", label: "Ended", count: students.length - activeCount },
  ];

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (filter === "active" && s.budget_status !== "active") return false;
      if (filter === "ended" && s.budget_status === "active") return false;
      return !q || s.full_name.toLowerCase().includes(q) || (s.institution ?? "").toLowerCase().includes(q);
    });
  }, [students, query, filter]);

  const page = matched.slice(0, shown);

  return (
    <div className="hd-page mv-page">
      <PageHeader
        eyebrow="Customers"
        title="Students"
        subtitle={loading ? undefined : `${students.length} student${students.length === 1 ? "" : "s"} with a plan at your hotel · ${activeCount} active`}
      />

      {error && (
        <Banner tone="bad" title="Couldn't load your students" action={<button className="hd-btn hd-btn-dark hd-btn-sm" onClick={() => { setLoading(true); load(); }}>Try again</button>}>
          {error}
        </Banner>
      )}

      {students.length > 0 && (
        <div className="hd-toolbar">
          <Chips label="Filter students" options={chips} value={filter} onChange={setFilter} />
          <SearchBox label="Search students" placeholder="Search by name or institution" value={query} onChange={setQuery} />
        </div>
      )}

      {loading ? (
        <SkeletonRegion label="students">
          <SkeletonCards count={6} imageHeight={90} />
        </SkeletonRegion>
      ) : students.length === 0 && !error ? (
        <EmptyState icon={<GraduationCap size={22} />} title="No students yet">
          Students appear here once they choose your hotel for a meal plan.
        </EmptyState>
      ) : matched.length === 0 ? (
        <EmptyState icon={<SearchX size={22} />} title="No students match">
          Try a different name or filter.
        </EmptyState>
      ) : (
        <>
          <ul className="hd-student-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {page.map((s) => {
              const status = s.budget_status ? BUDGET_STATUS[s.budget_status] ?? { label: s.budget_status, tone: "muted" as const } : null;
              const total = Number(s.total_amount ?? 0);
              const left = Number(s.remaining_amount ?? 0);
              const pct = total > 0 ? Math.min(100, Math.max(0, (left / total) * 100)) : 0;
              return (
                <li key={s.id}>
                  <Panel as="article" className="hd-student" aria-label={s.full_name}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <span className="hd-avatar" style={{ backgroundColor: "#8f3a24" }} aria-hidden="true" data-seed={badgeColorFor(s.id)}>
                        {s.full_name.trim().charAt(0).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="hd-row-title">{s.full_name}</span>
                        <span className="hd-row-meta" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <Mail size={12} aria-hidden="true" /> {s.email}
                        </span>
                        {s.institution && <span className="hd-row-meta">{s.institution}</span>}
                      </div>
                    </div>
                    {status && s.total_amount ? (
                      <div className="hd-well" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <StatusPill tone={status.tone}>{status.label}</StatusPill>
                          {s.number_of_days != null && <span className="hd-row-meta" style={{ margin: 0 }}>{s.number_of_days}-day plan</span>}
                        </div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 6, gap: 8 }}>
                            <span>{whole(left)} left</span>
                            <span style={{ color: "#6b625c" }}>of {whole(total)}</span>
                          </div>
                          <div className="hd-meter" role="img" aria-label={`${Math.round(pct)}% of the plan balance remaining`}>
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <dl className="hd-kv" style={{ margin: 0 }}>
                          {s.daily_allowance && (
                            <div>
                              <dt>Daily allowance</dt>
                              <dd>{whole(s.daily_allowance)}</dd>
                            </div>
                          )}
                          {s.end_date && (
                            <div>
                              <dt>{s.budget_status === "active" ? "Ends" : "Ended"}</dt>
                              <dd>{formatDate(s.end_date)}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    ) : (
                      <div className="hd-well" style={{ fontSize: 13, color: "#6b625c" }}>No plan details available.</div>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ul>
          {matched.length > shown && (
            <div className="hd-loadmore">
              <button className="hd-btn hd-btn-dark" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({matched.length - shown} left)
              </button>
            </div>
          )}
          {students.length >= BACKEND_CAP && <p className="hd-muted-note">Showing your {BACKEND_CAP} most recent students.</p>}
        </>
      )}
    </div>
  );
}
