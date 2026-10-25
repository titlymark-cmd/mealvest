import React, { useEffect, useState } from "react";
import { Star, Store } from "lucide-react";

/**
 * Hotel photo with a designed fallback (no image, or the image fails to
 * load), so cards and the hero never change shape. Decorative by default —
 * the hotel's name is always rendered as text next to it.
 */
export function HotelImage({ src, size = 40 }: { src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <span className="ob-media-fallback" aria-hidden="true">
        <Store size={size} />
      </span>
    );
  }
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** "4.3 (12 reviews)" or "New — no reviews yet". Only ever shows what the API returned. */
export function RatingLine({
  average,
  count,
  surface = "cream",
}: {
  average?: string | number | null;
  count?: number | null;
  surface?: "cream" | "dark";
}) {
  const n = Number(count ?? 0);
  const avg = Number(average);
  if (!n || !Number.isFinite(avg) || avg <= 0) {
    return (
      <span className="ob-rating" data-surface={surface}>
        No reviews yet
      </span>
    );
  }
  return (
    <span className="ob-rating" data-surface={surface} aria-label={`Rated ${avg.toFixed(1)} out of 5 from ${n} ${n === 1 ? "review" : "reviews"}`}>
      <Star size={14} aria-hidden="true" />
      <b>{avg.toFixed(1)}</b>
      <span aria-hidden="true">
        ({n} {n === 1 ? "review" : "reviews"})
      </span>
    </span>
  );
}
