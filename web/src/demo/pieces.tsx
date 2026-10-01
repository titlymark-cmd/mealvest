import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Apple, Check, Coffee, Cookie, Sandwich, Soup, Utensils, Signal, Wifi, BatteryFull } from "lucide-react";
import { clamp, hash, useSceneClockRef, useSceneTime } from "./clock";

type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

/* ------------------------------------------------------------------ */
/* 1. KineticHeadline — ghost duplicate, glitch settle, one accent word */
/* ------------------------------------------------------------------ */
export function KineticHeadline({
  text,
  accent,
  size = "lg",
  delay = 0,
}: {
  text: string;
  accent?: string;
  size?: "lg" | "md";
  /** ms */
  delay?: number;
}) {
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const accentSet = new Set((accent ?? "").split(" ").map(norm));
  return (
    <h2 className={`mvd-hl ${size === "md" ? "is-md" : ""}`} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="mvd-kw" aria-hidden style={{ "--d": `${delay + i * 150}ms` } as CSSVars}>
          <span className="mvd-kw-ghost">{w}</span>
          <span className={`mvd-kw-main ${accentSet.has(norm(w)) ? "is-accent" : ""}`}>{w}</span>
        </span>
      ))}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* 2. CountUp — digits scramble, then lock left to right                */
/* ------------------------------------------------------------------ */
const fmtDefault = (n: number) => n.toLocaleString("en-KE");

export function CountUp({
  to,
  start = 0,
  dur = 1400,
  format = fmtDefault,
  className,
}: {
  to: number;
  /** scene-time ms the count begins */
  start?: number;
  dur?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const t = useSceneTime();
  const final = format(to);
  const p = clamp((t - start) / dur);
  const digitCount = (final.match(/\d/g) ?? []).length;
  let k = -1;
  const shown = final.replace(/\d/g, (d) => {
    k += 1;
    if (t < start) return "0";
    // digits lock left to right; the last one locks exactly at p = 1
    if (p >= 0.2 + (0.8 * (k + 1)) / digitCount) return d;
    return String(Math.floor(hash(Math.floor(t / 60), k + 1) * 10));
  });
  return (
    <span className={`mvd-num ${className ?? ""}`} aria-label={final}>
      {shown}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 3. FloatingShapes — blobs, pills, sparkles, food icons, check badges */
/* ------------------------------------------------------------------ */
type ShapeKind = "blob" | "pill" | "spark" | "food" | "check";
interface Shape {
  k: ShapeKind;
  x: number;
  y: number;
  s: number;
  dur: number;
  del: number;
  depth: number;
  icon?: number;
}

const FOOD_ICONS = [Utensils, Coffee, Soup, Sandwich, Apple, Cookie];

const SHAPES: Shape[] = [
  { k: "blob", x: 8, y: 12, s: 70, dur: 9, del: -2, depth: 1 },
  { k: "food", x: 74, y: 9, s: 44, dur: 7, del: -1, depth: 2, icon: 0 },
  { k: "pill", x: 70, y: 28, s: 26, dur: 11, del: -5, depth: 1 },
  { k: "spark", x: 14, y: 34, s: 22, dur: 6, del: -3, depth: 3 },
  { k: "food", x: 6, y: 56, s: 40, dur: 8, del: -4, depth: 2, icon: 2 },
  { k: "check", x: 80, y: 52, s: 34, dur: 7, del: -2, depth: 2 },
  { k: "blob", x: 78, y: 74, s: 54, dur: 10, del: -6, depth: 1 },
  { k: "food", x: 22, y: 78, s: 38, dur: 9, del: -1, depth: 3, icon: 1 },
  { k: "spark", x: 56, y: 86, s: 18, dur: 5, del: -2, depth: 3 },
  { k: "pill", x: 4, y: 84, s: 22, dur: 12, del: -7, depth: 2 },
  { k: "food", x: 60, y: 66, s: 36, dur: 8, del: -3, depth: 3, icon: 3 },
  { k: "check", x: 30, y: 6, s: 28, dur: 6, del: -4, depth: 3 },
  { k: "food", x: 40, y: 92, s: 34, dur: 9, del: -5, depth: 1, icon: 5 },
  { k: "spark", x: 88, y: 38, s: 16, dur: 7, del: -1, depth: 2 },
];

function Sparkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0c1 6.5 5.5 11 12 12-6.5 1-11 5.5-12 12-1-6.5-5.5-11-12-12 6.5-1 11-5.5 12-12z" fill="var(--mvd-accent-2)" />
    </svg>
  );
}

export function FloatingShapes({ count = SHAPES.length }: { count?: number }) {
  return (
    <div className="mvd-fs" aria-hidden>
      {SHAPES.slice(0, count).map((s, i) => {
        // deeper layers move further and read fainter — a cheap parallax
        const amp = 8 + s.depth * 9;
        const style: CSSVars = {
          "--x": `${s.x}%`,
          "--y": `${s.y}%`,
          "--s": `${s.s}px`,
          "--dur": `${s.dur + s.depth}s`,
          "--del": `${s.del}s`,
          "--dx": `${(hash(i, 1) - 0.5) * amp * 2}px`,
          "--dy": `${-amp - hash(i, 2) * amp}px`,
          "--rot": `${(hash(i, 3) - 0.5) * 40}deg`,
          "--o": 1 - s.depth * 0.12,
        };
        const Icon = FOOD_ICONS[(s.icon ?? 0) % FOOD_ICONS.length];
        return (
          <div key={i} className="mvd-fl" style={style}>
            {s.k === "blob" && <div className="mvd-blob" />}
            {s.k === "pill" && <div className="mvd-fpill" />}
            {s.k === "spark" && <Sparkle size={s.s} />}
            {s.k === "food" && (
              <div className="mvd-fchip">
                <Icon size={s.s * 0.5} />
              </div>
            )}
            {s.k === "check" && (
              <div className="mvd-fchip is-check">
                <Check size={s.s * 0.55} strokeWidth={3} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. CardStage — slides up with a tilt that straightens                */
/* ------------------------------------------------------------------ */
export function CardStage({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: React.ReactNode;
  /** seconds */
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, willChange: "transform", ...style }}
      initial={{ y: 220, rotate: -5, opacity: 0 }}
      animate={{ y: 0, rotate: 0, opacity: 1 }}
      exit={{ y: 260, rotate: 4, opacity: 0, transition: { duration: 0.5, ease: "easeIn" } }}
      transition={{ type: "spring", stiffness: 120, damping: 20, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. RowSweep — cyan highlight bar gliding over a row, blur trail      */
/* ------------------------------------------------------------------ */
export function RowSweep({
  active,
  hot,
  children,
  className = "",
  style,
}: {
  active: boolean;
  /** keep the row outlined after the sweep */
  hot?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`mvd-row mvd-sweep-host ${hot ? "is-hot" : ""} ${className}`} style={style}>
      {children}
      {active && (
        <span className="mvd-sweep" aria-hidden>
          <b />
          <i />
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. ModalSheet — spring slide-up, backdrop dims                       */
/* ------------------------------------------------------------------ */
export function ModalSheet({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) {
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            className="mvd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div
            key="sheet"
            className="mvd-sheet"
            role="dialog"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%", transition: { duration: 0.35, ease: "easeIn" } }}
            transition={{ type: "spring", stiffness: 240, damping: 28 }}
          >
            <span className="mvd-grab" />
            <h3>{title}</h3>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 7. ToggleSwitch — thumb slides, track fills cyan                     */
/* ------------------------------------------------------------------ */
export function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span className={`mvd-tg ${on ? "is-on" : ""}`} role="switch" aria-checked={on}>
      <span className="mvd-tg-fill" />
      <span className="mvd-tg-thumb" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 8. PhoneMock — 9:41, content sheet slides up inside                  */
/* ------------------------------------------------------------------ */
export function PhoneMock({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="mvd-phone"
      initial={{ y: 300, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
    >
      <div className="mvd-phone-screen">
        <div className="mvd-phone-bar">
          <span>9:41</span>
          <span className="mvd-notch" />
          <span className="mvd-phone-icons">
            <Signal size={11} />
            <Wifi size={11} />
            <BatteryFull size={13} />
          </span>
        </div>
        {children}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 9. PillMarquee — rows sliding in opposite directions                 */
/* ------------------------------------------------------------------ */
export function PillMarquee({
  items,
  rows = 6,
  seconds = 7,
}: {
  items: { label: string; icon?: React.ReactNode }[];
  rows?: number;
  seconds?: number;
}) {
  return (
    <div className="mvd-marq" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => {
        const rotated = items.map((_, i) => items[(i + r) % items.length]);
        const half = [...rotated, ...rotated];
        return (
          <div
            key={r}
            className={`mvd-marq-row ${r % 2 ? "is-rev" : ""}`}
            style={{ "--dur": `${seconds + (r % 3)}s` } as CSSVars}
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="mvd-marq-half">
                {half.map((it, i) => (
                  <span key={i} className="mvd-pill">
                    {it.icon}
                    {it.label}
                  </span>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10. FlowerBloom — petals scale + rotate open from a point            */
/* ------------------------------------------------------------------ */
export function FlowerBloom({
  size = 220,
  petals = 8,
  delay = 0,
  duration = 1400,
  soft = false,
  opacity,
  children,
}: {
  size?: number | string;
  petals?: number;
  /** ms */
  delay?: number;
  duration?: number;
  /** translucent glow petals instead of solid cyan */
  soft?: boolean;
  opacity?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mvd-bloom" style={{ width: size, height: size, "--bd": `${delay}ms`, "--bt": `${duration}ms` } as CSSVars}>
      <span className="mvd-core" />
      {Array.from({ length: petals }).map((_, i) => (
        <span
          key={i}
          className={`mvd-petal ${soft ? "is-soft" : ""}`}
          style={{ "--r": `${(i * 360) / petals}deg`, "--pd": `${i * 55}ms`, ...(opacity ? { "--po": opacity } : {}) } as CSSVars}
        />
      ))}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 11. ParticleWord — particles fly in, assemble a word, settle         */
/* ------------------------------------------------------------------ */
interface Particle {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  d: number;
  r: number;
}

export function ParticleWord({ word, width = 340, height = 200 }: { word: string; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clockRef = useSceneClockRef();
  // Poppins is split into lazily-loaded subsets; make sure the weight
  // we sample from is actually loaded before reading pixels.
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    const done = () => setFontReady(true);
    document.fonts.load(`800 100px Poppins`, word).then(done, done);
  }, [word]);

  const particles = useMemo<Particle[]>(() => {
    if (!fontReady) return [];
    // Sample the word's pixels from an offscreen canvas.
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const c = off.getContext("2d");
    if (!c) return [];
    c.fillStyle = "#fff";
    c.font = `800 ${Math.round(height * 0.78)}px Poppins, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(word, width / 2, height / 2 + height * 0.04);
    const data = c.getImageData(0, 0, width, height).data;
    const pts: Particle[] = [];
    const step = 4;
    let n = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (data[(y * width + x) * 4 + 3] > 128) {
          const a = hash(n, 7) * Math.PI * 2;
          const dist = Math.max(width, height) * (0.7 + hash(n, 8) * 0.9);
          pts.push({
            tx: x,
            ty: y,
            sx: width / 2 + Math.cos(a) * dist,
            sy: height / 2 + Math.sin(a) * dist,
            d: hash(n, 9) * 0.45,
            r: 1.1 + hash(n, 10) * 1.3,
          });
          n += 1;
        }
      }
    }
    return pts;
  }, [word, width, height, fontReady]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const colA = css.getPropertyValue("--mvd-accent").trim() || "#22d3ee";
    const colB = css.getPropertyValue("--mvd-accent-2").trim() || "#7defff";
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    let raf = 0;
    const draw = () => {
      const t = clockRef.current / 1000; // scene seconds
      ctx.clearRect(0, 0, width, height);
      // 0–1.5s fly in, 1.5–2.3s hold, 2.3–3s soften
      const soften = clamp((t - 2.2) / 0.8);
      ctx.globalAlpha = 1 - soften * 0.85;
      particles.forEach((p, i) => {
        const k = ease(clamp((t - p.d) / 1.1));
        let x = p.sx + (p.tx - p.sx) * k;
        let y = p.sy + (p.ty - p.sy) * k;
        if (k >= 1) {
          x += Math.sin(t * 2 + i) * (0.6 + soften * 6);
          y += Math.cos(t * 2.3 + i) * (0.6 + soften * 6);
        }
        ctx.fillStyle = i % 3 ? colA : colB;
        ctx.fillRect(x, y, p.r * 2, p.r * 2);
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [particles, width, height, clockRef]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={word}
      style={{ width, height, maxWidth: "100%", filter: "drop-shadow(0 0 14px var(--mvd-accent-glow))" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 12. QRReveal — draws in square by square, then pulses once           */
/* ------------------------------------------------------------------ */
const QR_N = 21;

function qrCells(): { x: number; y: number; d: number }[] {
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [[0, 0], [QR_N - 7, 0], [0, QR_N - 7]]) {
      if (inBox(ox, oy)) {
        const dx = x - ox;
        const dy = y - oy;
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core ? 1 : 0;
      }
      if (x >= ox - 1 && x <= ox + 7 && y >= oy - 1 && y <= oy + 7) return 0; // quiet zone
    }
    return -1;
  };
  const out: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < QR_N; y++) {
    for (let x = 0; x < QR_N; x++) {
      const f = finder(x, y);
      const on = f === -1 ? hash(x + 3, y + 11) > 0.52 : f === 1;
      if (on) out.push({ x, y, d: Math.round((y * QR_N + x) * 2.6 + hash(x, y) * 260) });
    }
  }
  return out;
}

export function QRReveal() {
  const cells = useMemo(qrCells, []);
  return (
    <div className="mvd-qr" role="img" aria-label="Meal pass QR code">
      <svg viewBox={`0 0 ${QR_N} ${QR_N}`} shapeRendering="crispEdges">
        {cells.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={1} height={1} style={{ "--qd": `${c.d}ms` } as CSSVars} />
        ))}
      </svg>
    </div>
  );
}
