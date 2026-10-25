import React, { useEffect, useState, useCallback } from "react";
import { Star, MessageSquare, RefreshCw } from "lucide-react";
import { Card } from "../Card";
import { Spinner } from "../Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import {
  fetchHotelReviews,
  fetchMyHotelReview,
  submitHotelReview,
  deleteMyHotelReview,
  HotelReview,
  HotelReviewSummary,
  MyHotelReview,
} from "../../services/hotelsApi";

/** Static or interactive 1–5 star row. */
export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div
      style={{ display: "flex", flexDirection: "row", gap: onChange ? 4 : 2 }}
      onMouseLeave={() => setHover(null)}
      role={onChange ? "group" : "img"}
      aria-label={onChange ? "Your rating" : `${Number(value).toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(shown);
        const star = (
          <Star
            size={size}
            color={filled ? COLORS.accent : COLORS.textFaint}
            fill={filled ? COLORS.accent : "transparent"}
            strokeWidth={filled ? 1.5 : 1.75}
          />
        );
        if (!onChange) return <span key={n} aria-hidden="true">{star}</span>;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={n === value}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            style={{ padding: 8 }}
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}

/** Compact "★ 4.3 (12)" badge for list cards / headers; renders "No reviews yet" when there are none. */
export function RatingBadge({ average, count, onDark }: { average: string | number | null | undefined; count: number | undefined; onDark?: boolean }) {
  const n = Number(count ?? 0);
  const avg = Number(average ?? 0);
  const color = onDark ? COLORS.textOnDarkMuted : COLORS.textMuted;
  if (!n) {
    return (
      <span style={{ fontFamily: FONTS.body, fontSize: 11, color }}>
        No reviews yet
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Star size={12} color={COLORS.accent} fill={COLORS.accent} strokeWidth={1.5} />
      <span style={{ fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: onDark ? COLORS.textOnDark : COLORS.text }}>{avg.toFixed(1)}</span>
      <span style={{ fontFamily: FONTS.body, fontSize: 11, color }}>
        ({n} review{n === 1 ? "" : "s"})
      </span>
    </span>
  );
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Reviews panel for a hotel: public summary + latest reviews, and —
 * for a signed-in student who has collected a meal there — a form to
 * post or update their own rating. Eligibility comes from the server
 * (GET /hotels/:id/reviews/me); the POST re-checks it regardless.
 */
export function HotelReviews({ hotelId, hotelName }: { hotelId: string; hotelName?: string }) {
  const { authFetch, user } = useAuth();
  const [summary, setSummary] = useState<HotelReviewSummary | null>(null);
  const [reviews, setReviews] = useState<HotelReview[]>([]);
  const [mine, setMine] = useState<MyHotelReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  const isStudent = user?.role === "student";

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pub, me] = await Promise.all([
        fetchHotelReviews(hotelId),
        isStudent ? fetchMyHotelReview(authFetch, hotelId).catch(() => null) : Promise.resolve(null),
      ]);
      setSummary(pub.summary);
      setReviews(pub.reviews);
      setMine(me);
      if (me?.review) {
        setRating(me.review.rating);
        setComment(me.review.comment || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reviews.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, hotelId, isStudent]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (rating < 1) return setError("Pick a star rating first.");
    setSaving(true);
    setError(null);
    try {
      await submitHotelReview(authFetch, hotelId, { rating, comment: comment.trim() || null });
      setSaved(true);
      setEditing(false);
      await load();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove your review of this hotel?")) return;
    setSaving(true);
    try {
      await deleteMyHotelReview(authFetch, hotelId);
      setRating(0);
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove your review.");
    } finally {
      setSaving(false);
    }
  };

  const showForm = isStudent && mine?.eligible && (editing || !mine.review);

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <MessageSquare size={16} color={COLORS.primary} />
        <span style={styles.heading}>Reviews{hotelName ? ` · ${hotelName}` : ""}</span>
      </div>

      {loading && (
        <div style={{ display: "flex", padding: 12 }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}

      {!loading && !summary && error && (
        <Card style={styles.summaryCard}>
          <p style={{ ...styles.error, marginTop: 0 }} role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load();
            }}
            style={styles.smallBtn}
          >
            <RefreshCw size={14} color={COLORS.primary} aria-hidden="true" />
            <span style={styles.smallBtnText}>Try again</span>
          </button>
        </Card>
      )}

      {!loading && summary && (
        <Card style={styles.summaryCard}>
          <div style={styles.summaryTop}>
            <div>
              <span style={styles.avg}>{summary.count ? summary.average.toFixed(1) : "—"}</span>
              <Stars value={summary.average} size={16} />
              <span style={styles.countText}>
                {summary.count === 0 ? "No reviews yet" : `${summary.count} review${summary.count === 1 ? "" : "s"}`}
              </span>
            </div>
            <div style={styles.distribution}>
              {([5, 4, 3, 2, 1] as const).map((n) => {
                const c = summary.distribution[String(n) as "1" | "2" | "3" | "4" | "5"] || 0;
                const pct = summary.count ? (c / summary.count) * 100 : 0;
                return (
                  <div key={n} style={styles.distRow}>
                    <span style={styles.distLabel}>{n}</span>
                    <div style={styles.distTrack}>
                      <div style={{ ...styles.distFill, width: `${pct}%` }} />
                    </div>
                    <span style={styles.distCount}>{c}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {isStudent && mine && !mine.eligible && (
            <p style={styles.hint}>Collect a meal here with your MEALVEST pass and you'll be able to leave a review.</p>
          )}

          {isStudent && mine?.eligible && mine.review && !editing && (
            <div style={styles.mineRow}>
              <div style={{ flex: 1 }}>
                <span style={styles.mineLabel}>Your review</span>
                <Stars value={mine.review.rating} />
                {mine.review.comment && <p style={styles.mineComment}>{mine.review.comment}</p>}
              </div>
              <div style={styles.mineActions}>
                <button onClick={() => setEditing(true)} style={styles.smallBtn} disabled={saving}>
                  <span style={styles.smallBtnText}>Edit</span>
                </button>
                <button onClick={remove} style={styles.smallBtn} disabled={saving}>
                  <span style={{ ...styles.smallBtnText, color: COLORS.danger }}>Remove</span>
                </button>
              </div>
            </div>
          )}

          {showForm && (
            <div style={styles.form}>
              <span style={styles.mineLabel}>{mine?.review ? "Update your review" : "Rate this hotel"}</span>
              <Stars value={rating} size={24} onChange={setRating} />
              <textarea
                style={styles.textarea}
                aria-label="Your review (optional)"
                placeholder="What was the food and service like? (optional, 500 characters max)"
                value={comment}
                maxLength={500}
                rows={3}
                onChange={(e) => setComment(e.target.value)}
              />
              <div style={styles.formActions}>
                {mine?.review && (
                  <button onClick={() => setEditing(false)} style={styles.smallBtn} disabled={saving}>
                    <span style={styles.smallBtnText}>Cancel</span>
                  </button>
                )}
                <button onClick={submit} style={styles.submitBtn} disabled={saving || rating < 1}>
                  <span style={styles.submitText}>{saving ? "Saving…" : saved ? "Saved ✓" : "Post review"}</span>
                </button>
              </div>
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}
        </Card>
      )}

      {!loading && reviews.length > 0 && (
        <div style={styles.list}>
          {reviews.map((r) => (
            <Card key={r.id} style={styles.reviewCard}>
              <div style={styles.reviewTop}>
                <span style={styles.reviewer}>{r.reviewer}</span>
                <Stars value={r.rating} size={12} />
              </div>
              {r.comment && <p style={styles.reviewComment}>{r.comment}</p>}
              <span style={styles.reviewDate}>{when(r.updated_at)}</span>
            </Card>
          ))}
          {summary && summary.count > reviews.length && (
            <p className="ob-reviews-note">
              Showing the latest {reviews.length} of {summary.count} reviews.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, marginTop: 24 },
  headerRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.textOnDark },
  summaryCard: { display: "flex", flexDirection: "column", gap: 12 },
  summaryTop: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 18, alignItems: "flex-start" },
  avg: { display: "block", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 30, color: COLORS.text, lineHeight: "32px" },
  countText: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  distribution: { flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 4 },
  distRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  distLabel: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.textMuted, width: 10 },
  distTrack: { flex: 1, height: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.borderSoft, overflow: "hidden" },
  distFill: { height: "100%", backgroundColor: COLORS.accent, borderRadius: RADIUS.pill },
  distCount: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, width: 18, textAlign: "right" },
  hint: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, margin: 0, borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 10 },
  mineRow: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 10 },
  mineLabel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.text, marginBottom: 4 },
  mineComment: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0 0", lineHeight: "18px" },
  mineActions: { display: "flex", flexDirection: "row", gap: 6 },
  smallBtn: { minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 6, borderRadius: RADIUS.pill, border: `1px solid ${COLORS.borderSoft}` },
  smallBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12.5, color: COLORS.textMuted },
  form: { display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 10 },
  textarea: {
    width: "100%",
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.text,
    backgroundColor: COLORS.cardWhite,
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.sm,
    padding: 10,
    resize: "vertical",
    outline: "none",
  },
  formActions: { display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, padding: "8px 16px" },
  submitText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: "#fff" },
  error: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, margin: 0 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  reviewCard: { display: "flex", flexDirection: "column", gap: 4, padding: 12 },
  reviewTop: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  reviewer: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.text },
  reviewComment: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, margin: 0, lineHeight: "18px" },
  reviewDate: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint },
};
