import React from "react";

/**
 * Skeleton loaders for the whole app.
 *
 * Use these for PAGE or SECTION content that is waiting on data, shaped like
 * what will appear. Keep <Spinner> for short ACTIONS (a button submitting, an
 * M-Pesa prompt being confirmed, a camera permission) where there is no
 * content shape to preview.
 *
 * Accessibility: every region is announced once ("Loading <label>") via
 * role="status"; the individual shapes are aria-hidden.
 */

type Tone = "dark" | "light";

interface BlockProps {
  w?: number | string;
  h?: number | string;
  /** border-radius in px; pass 999 for pills/circles */
  r?: number;
  className?: string;
  style?: React.CSSProperties;
}

const px = (v: number | string | undefined) => (typeof v === "number" ? `${v}px` : v);

/** A single shimmering block. */
export function Skeleton({ w, h, r, className = "", style }: BlockProps) {
  const vars: Record<string, string | undefined> = { "--sk-w": px(w), "--sk-h": px(h), "--sk-r": r === undefined ? undefined : `${r}px` };
  return <span aria-hidden="true" className={`mv-skel sk ${className}`} style={{ ...(vars as React.CSSProperties), ...style }} />;
}

const LINE_WIDTHS = ["100%", "92%", "64%", "80%", "48%"];

/** Paragraph-like lines of varying width. */
export function SkeletonText({ lines = 3, h = 12 }: { lines?: number; h?: number }) {
  return (
    <div className="sk-col" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={h} w={LINE_WIDTHS[i % LINE_WIDTHS.length]} />
      ))}
    </div>
  );
}

/**
 * Accessible wrapper for any group of skeleton shapes. `tone="light"` is for
 * cream surfaces (notification dropdown, admin modals).
 */
export function SkeletonRegion({ label = "content", tone = "dark", children, style }: { label?: string; tone?: Tone; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`sk-region${tone === "light" ? " sk-light" : ""}`} role="status" aria-live="polite" aria-busy="true" style={style}>
      <span className="sv-visually-hidden">Loading {label}…</span>
      {children}
    </div>
  );
}

/** Title + subtitle placeholder, matching the page headers in the app. */
export function SkeletonHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="sk-col" aria-hidden="true" style={{ flex: "none", gap: 10 }}>
      <Skeleton h={30} w="min(260px, 60%)" r={10} />
      {subtitle && <Skeleton h={13} w="min(380px, 85%)" />}
    </div>
  );
}

/**
 * Full-page skeleton. `padded` reproduces the admin / hotel screens' own
 * container (24px padding on the espresso canvas, full height) so there is no
 * jump; omit it for content that already sits inside a page container.
 */
export function PageSkeleton({ label = "page", padded = false, header = true, children }: { label?: string; padded?: boolean; header?: boolean; children?: React.ReactNode }) {
  return (
    <div className="sk-page" data-embedded={!padded}>
      <SkeletonRegion label={label}>
        {header && <SkeletonHeader />}
        {children}
      </SkeletonRegion>
    </div>
  );
}

/** Row of stat tiles (label + big figure). */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="sk-stats" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-surface">
          <Skeleton h={11} w="55%" />
          <Skeleton h={26} w="70%" r={8} />
        </div>
      ))}
    </div>
  );
}

/** Headline panel: label, big figure, a bar and a couple of chips (balances, plan summaries). */
export function SkeletonHero({ h = 220 }: { h?: number }) {
  return (
    <div className="sk-surface" aria-hidden="true" style={{ minHeight: h, padding: 20, gap: 14 }}>
      <Skeleton h={12} w="35%" />
      <Skeleton h={40} w="60%" r={12} />
      <Skeleton h={14} w="80%" />
      <div className="sk-row" style={{ marginTop: "auto" }}>
        <Skeleton h={46} r={16} />
        <Skeleton h={46} r={16} />
      </div>
    </div>
  );
}

/** Chart panel. */
export function SkeletonChart({ h = 220 }: { h?: number }) {
  return (
    <div className="sk-surface" aria-hidden="true">
      <Skeleton h={14} w="35%" />
      <Skeleton h={h} r={16} />
    </div>
  );
}

/** Data table: header strip + rows. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="sk-table" aria-hidden="true">
      <div className="sk-table-head">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} h={11} w="60%" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-table-row">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} h={13} w={c === 0 ? "85%" : c === cols - 1 ? "45%" : "70%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Rows with a leading thumbnail, two lines and a trailing value. */
export function SkeletonList({ rows = 5, thumb = "square", trailing = true }: { rows?: number; thumb?: "square" | "circle" | "none"; trailing?: boolean }) {
  return (
    <div className="sk-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          {thumb !== "none" && <Skeleton w={44} h={44} r={thumb === "circle" ? 999 : 14} />}
          <div className="sk-col">
            <Skeleton h={13} w={i % 2 ? "55%" : "70%"} />
            <Skeleton h={11} w={i % 2 ? "35%" : "45%"} />
          </div>
          {trailing && <Skeleton w={56} h={20} r={999} />}
        </div>
      ))}
    </div>
  );
}

/** Grid of image cards (menus, hotels). */
export function SkeletonCards({ count = 6, imageHeight = 140 }: { count?: number; imageHeight?: number }) {
  return (
    <div className="sk-cards" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-surface">
          <Skeleton h={imageHeight} r={16} />
          <Skeleton h={14} w="70%" />
          <Skeleton h={11} w="45%" />
        </div>
      ))}
    </div>
  );
}

/** Label + field pairs. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="sk-surface" aria-hidden="true" style={{ gap: 18, padding: 20 }}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="sk-col" style={{ flex: "none" }}>
          <Skeleton h={11} w="30%" />
          <Skeleton h={46} r={14} />
        </div>
      ))}
    </div>
  );
}

/**
 * App-launch skeleton (shown while the saved session is being checked): a top
 * bar and a few content blocks, so the screen never starts as a bare spinner.
 */
export function AppBootSkeleton() {
  return (
    <div className="sk-boot" role="status" aria-live="polite" aria-busy="true">
      <span className="sv-visually-hidden">Loading MEALVEST…</span>
      <div className="sk-row" aria-hidden="true" style={{ justifyContent: "space-between" }}>
        <Skeleton w={36} h={36} r={12} />
        <Skeleton w="min(320px, 50%)" h={44} r={999} />
        <Skeleton w={44} h={44} r={999} />
      </div>
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SkeletonHeader />
        <div className="sk-cards">
          <div className="sk-surface">
            <Skeleton h={200} r={18} />
          </div>
          <div className="sk-surface">
            <Skeleton h={200} r={18} />
          </div>
        </div>
      </div>
    </div>
  );
}
