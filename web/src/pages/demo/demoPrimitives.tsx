import React, { useEffect, useRef, useState } from "react";

/* Small, dependency-free animation primitives shared by the demo
   scenes. All colours come from the CSS variables declared on .mv-demo
   in demo.css — nothing here hardcodes a colour. */

/** Counts a number up from 0 to `value` over `duration` ms on mount. */
export function CountUp({
  value,
  duration = 900,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();
  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/** A headline whose words snap in one at a time. One word can be the
 *  accent (coloured + underlined). */
export function KineticWords({
  words,
  accentIndex,
  startDelay = 0,
  step = 260,
  size = 40,
}: {
  words: string[];
  accentIndex?: number;
  startDelay?: number;
  step?: number;
  size?: number;
}) {
  return (
    <div className="mv-kinetic" style={{ fontSize: size, fontWeight: 800 }}>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className={
            "mv-kinetic-word" + (i === accentIndex ? " mv-kinetic-accent" : "")
          }
          style={{ animationDelay: `${startDelay + i * step}ms` }}
        >
          {w}
        </span>
      ))}
    </div>
  );
}

/** Ambient food/finance glyphs drifting slowly behind a scene. */
const CONFETTI_GLYPHS = ["🍛", "🥗", "✓", "🍗", "₭", "🫓", "✓", "🍲"];
export function FloatingConfetti({ count = 8 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => {
    const left = (i * 97 + 13) % 100;
    const top = (i * 53 + 11) % 100;
    const delay = (i * 0.7) % 6;
    const dur = 5 + ((i * 1.3) % 4);
    const size = 14 + ((i * 7) % 16);
    return (
      <i
        key={i}
        style={{
          left: `${left}%`,
          top: `${top}%`,
          fontSize: size,
          animationDelay: `${delay}s`,
          animationDuration: `${dur}s`,
          fontStyle: "normal",
        }}
      >
        {CONFETTI_GLYPHS[i % CONFETTI_GLYPHS.length]}
      </i>
    );
  });
  return <div className="mv-confetti">{items}</div>;
}

/** The radial glow wipe used to switch between major sections. */
export function GlowBloomWipe() {
  return (
    <div className="mv-bloom-wipe">
      <span />
    </div>
  );
}

/** Phone mock frame; children render inside the screen. */
export function PhoneMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="mv-phone">
      <div className="mv-phone-screen">
        <div className="mv-phone-notch" />
        {children}
      </div>
    </div>
  );
}

/** Particles that fly in from scattered positions and settle into the
 *  shape of a short word rendered on a hidden canvas-like grid. We use a
 *  simple 5x(n) dot matrix per letter so "fed" assembles from points. */
const LETTER_DOTS: Record<string, number[][]> = {
  // 5 rows x 4 cols grid; [row,col] points that are "on"
  f: [[0, 1], [0, 2], [0, 3], [1, 1], [2, 1], [2, 2], [3, 1], [4, 1]],
  e: [[0, 1], [0, 2], [0, 3], [1, 1], [2, 1], [2, 2], [2, 3], [3, 1], [4, 1], [4, 2], [4, 3]],
  d: [[0, 3], [1, 3], [2, 1], [2, 2], [2, 3], [1, 1], [3, 1], [3, 3], [4, 1], [4, 2], [4, 3]],
};

export function ParticleWord({ word = "fed" }: { word?: string }) {
  const cell = 16;
  const letterW = 4 * cell + 14;
  const dots: React.ReactNode[] = [];
  let key = 0;
  word.split("").forEach((ch, li) => {
    const matrix = LETTER_DOTS[ch.toLowerCase()];
    if (!matrix) return;
    const offsetX = li * letterW;
    matrix.forEach(([r, c]) => {
      const x = offsetX + c * cell;
      const y = r * cell;
      // random scatter origin
      const fromX = (((key * 71) % 200) - 100).toFixed(0);
      const fromY = (((key * 113) % 200) - 100).toFixed(0);
      dots.push(
        <span
          key={key}
          className="mv-particle"
          style={
            {
              left: x,
              top: y,
              animationDelay: `${(key % 12) * 40}ms`,
              ["--mv-from-x" as string]: `${fromX}px`,
              ["--mv-from-y" as string]: `${fromY}px`,
            } as React.CSSProperties
          }
        />
      );
      key += 1;
    });
  });

  const totalW = word.replace(/[^fed]/gi, "").length * letterW;
  return (
    <div
      className="mv-particles"
      style={{ width: totalW, height: 5 * cell }}
    >
      {dots}
    </div>
  );
}
