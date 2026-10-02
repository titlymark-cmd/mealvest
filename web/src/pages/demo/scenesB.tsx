import React, { useEffect, useState } from "react";
import logoSrc from "../../assets/mealvest-logo.png";
import { CountUp, ParticleWord, GlowBloomWipe, FloatingConfetti } from "./demoPrimitives";
import { DEMO_QUEUE, DEMO_SALES, DEMO_STAFF, DEMO_NEW_STAFF } from "./demoData";

/* Scenes 8–14: the hotel side + close. */

/* ---- Scene 8: Bloom transition (student → hotel) ------------------ */
export function SceneBloom() {
  return (
    <div className="mv-demo-scene" data-state="in">
      <GlowBloomWipe />
      <div
        className="mv-rise"
        style={{ textAlign: "center", animationDelay: "250ms" }}
      >
        <div className="mv-scene-eyebrow">Now the kitchen side</div>
        <div className="mv-scene-headline" style={{ marginTop: 8 }}>
          For hotels
        </div>
      </div>
    </div>
  );
}

/* ---- Scene 9: Hotel staff queue clears one by one ----------------- */
export function SceneQueue() {
  const [cleared, setCleared] = useState(0);
  useEffect(() => {
    const timers = DEMO_QUEUE.map((_, i) =>
      setTimeout(() => setCleared(i + 1), 900 + i * 520)
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 14 }}>
        ✅ Scan &amp; serve
      </div>
      <div
        className="mv-glass-card mv-pop"
        style={{ width: "min(380px,92vw)", padding: 18, animationDelay: "120ms" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Pickup queue</div>
          <div style={{ fontSize: 12, color: "var(--mv-on-dark-muted)" }}>
            {DEMO_QUEUE.length - cleared} waiting
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {DEMO_QUEUE.map((o, i) => {
            const done = i < cleared;
            return (
              <div
                key={o.id}
                className="mv-pop"
                style={{
                  ...queueRow,
                  animationDelay: `${150 + i * 110}ms`,
                  opacity: done ? 0.45 : 1,
                  borderColor: done ? "var(--mv-success)" : "var(--mv-glass-border)",
                }}
              >
                <div style={queueCode}>{o.code}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{o.meal}</div>
                  <div style={{ fontSize: 10, color: "var(--mv-on-dark-muted)" }}>
                    {o.student}
                  </div>
                </div>
                {done ? (
                  <span className="mv-chip-flip" style={servedChip}>
                    Served
                  </span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700 }}>KSh {o.price}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Scene 10: Sales log, rows fill in + total -------------------- */
export function SceneSales() {
  const total = DEMO_SALES.reduce((s, r) => s + r.price, 0);
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 14 }}>
        📈 Today's sales
      </div>
      <div
        className="mv-glass-card mv-pop"
        style={{ width: "min(380px,92vw)", padding: 18, animationDelay: "120ms" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {DEMO_SALES.map((r, i) => (
            <div
              key={r.id}
              className="mv-pop mv-row-sweep"
              style={{ ...salesRow, animationDelay: `${150 + i * 150}ms` }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{r.meal}</div>
                <div style={{ fontSize: 10, color: "var(--mv-on-dark-muted)" }}>
                  {r.student}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>KSh {r.price}</div>
            </div>
          ))}
        </div>
        <div style={salesTotalRow}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--mv-on-dark-muted)" }}>
            Paid out today
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--mv-accent)" }}>
            <CountUp value={total} prefix="KSh " duration={1100} />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---- Scene 11: Staff invite --------------------------------------- */
export function SceneStaff() {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAdded(true), 1300);
    return () => clearTimeout(t);
  }, []);
  const all = added ? [...DEMO_STAFF, DEMO_NEW_STAFF] : DEMO_STAFF;
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 14 }}>
        👥 Add your team
      </div>
      <div
        className="mv-glass-card mv-pop"
        style={{ width: "min(360px,92vw)", padding: 18, animationDelay: "120ms" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Staff</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {all.map((s, i) => (
            <div
              key={i}
              className={i === all.length - 1 && added ? "mv-rise" : ""}
              style={staffRow}
            >
              <div style={staffAvatar}>{s.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 10, color: "var(--mv-on-dark-muted)" }}>
                  {s.role}
                </div>
              </div>
              {i === all.length - 1 && added && (
                <span className="mv-chip-flip" style={invitedChip}>
                  Invited
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={{ ...addStaffBtn, opacity: added ? 0.5 : 1 }}>+ Invite staff</div>
      </div>
    </div>
  );
}

/* ---- Scene 12: Savings rollover (money moves to next day) ---------- */
export function SceneSavings() {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMoved(true), 700);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 20 }}>
        🔁 Nothing wasted
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div className="mv-pop" style={dayCard}>
          <div style={dayLabel}>Today</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>KSh 50</div>
          <div style={{ fontSize: 10, color: "var(--mv-on-dark-muted)" }}>unspent</div>
        </div>

        <div style={{ position: "relative", width: 60, height: 20 }}>
          <div style={arrowLine} />
          {moved && (
            <div
              className="mv-money-move"
              style={
                {
                  ...moneyDot,
                  ["--mv-move-x" as string]: "56px",
                  ["--mv-move-y" as string]: "0px",
                } as React.CSSProperties
              }
            />
          )}
        </div>

        <div
          className="mv-pop"
          style={{ ...dayCard, animationDelay: "200ms", borderColor: "var(--mv-success)" }}
        >
          <div style={dayLabel}>Tomorrow</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--mv-success)" }}>
            {moved ? "KSh 280" : "KSh 230"}
          </div>
          <div style={{ fontSize: 10, color: "var(--mv-on-dark-muted)" }}>
            {moved ? "allowance + rollover" : "allowance"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Scene 13: Particle word "fed" -------------------------------- */
export function SceneParticles() {
  return (
    <div className="mv-demo-scene" data-state="in">
      <FloatingConfetti count={5} />
      <div className="mv-scene-eyebrow mv-pop" style={{ marginBottom: 18 }}>
        Students, kept
      </div>
      <ParticleWord word="fed" />
    </div>
  );
}

/* ---- Scene 14: End card ------------------------------------------- */
export function SceneEnd({ onReplay }: { onReplay: () => void }) {
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-bloom-logo" style={{ width: 104, height: 104 }}>
        <img src={logoSrc} alt="MealVest" style={{ width: 88, height: 88 }} />
      </div>
      <div
        className="mv-rise"
        style={{ marginTop: 18, fontSize: 26, fontWeight: 800, letterSpacing: 2, animationDelay: "400ms" }}
      >
        MEALVEST
      </div>
      <div
        className="mv-rise"
        style={{
          marginTop: 10,
          fontSize: 15,
          fontWeight: 600,
          color: "var(--mv-accent)",
          animationDelay: "560ms",
        }}
      >
        Coming soon
      </div>
      <button className="mv-replay-btn" onClick={onReplay} type="button">
        ↻ Replay
      </button>
    </div>
  );
}

/* ---- shared inline style fragments -------------------------------- */
const queueRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "var(--mv-glass)",
  border: "1px solid var(--mv-glass-border)",
  borderRadius: 12,
  padding: "9px 12px",
  transition: "opacity 300ms ease, border-color 300ms ease",
};
const queueCode: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--mv-accent)",
  background: "var(--mv-glass-strong)",
  borderRadius: 8,
  padding: "4px 7px",
};
const servedChip: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#fff",
  background: "var(--mv-success)",
  borderRadius: 999,
  padding: "4px 9px",
};
const salesRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 6px",
  borderBottom: "1px solid var(--mv-glass-border)",
};
const salesTotalRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid var(--mv-glass-border)",
};
const staffRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "var(--mv-glass)",
  border: "1px solid var(--mv-glass-border)",
  borderRadius: 12,
  padding: "9px 12px",
};
const staffAvatar: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  background: "linear-gradient(135deg, var(--mv-primary), var(--mv-primary-light))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "#fff",
};
const invitedChip: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--mv-success)",
  background: "var(--mv-success-soft)",
  borderRadius: 999,
  padding: "4px 9px",
};
const addStaffBtn: React.CSSProperties = {
  marginTop: 14,
  textAlign: "center",
  border: "1px dashed var(--mv-glass-border)",
  borderRadius: 12,
  padding: "10px",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--mv-on-dark-muted)",
};
const dayCard: React.CSSProperties = {
  width: 120,
  background: "var(--mv-glass)",
  border: "1px solid var(--mv-glass-border)",
  borderRadius: 16,
  padding: "14px 12px",
  textAlign: "center",
};
const dayLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--mv-on-dark-muted)",
  marginBottom: 4,
};
const arrowLine: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: 0,
  right: 0,
  height: 2,
  background: "linear-gradient(90deg, var(--mv-primary), var(--mv-accent))",
  transform: "translateY(-50%)",
};
const moneyDot: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: 0,
  width: 12,
  height: 12,
  marginTop: -6,
  borderRadius: "50%",
  background: "var(--mv-accent)",
  boxShadow: "0 0 10px var(--mv-glow-accent)",
};
