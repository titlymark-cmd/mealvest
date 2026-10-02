import React, { useEffect, useState } from "react";
import logoSrc from "../../assets/mealvest-logo.png";
import {
  CountUp,
  KineticWords,
  PhoneMock,
  FloatingConfetti,
} from "./demoPrimitives";
import { DEMO_STUDENT, DEMO_HOTELS, DEMO_MEALS } from "./demoData";

/* Scenes 1–7: the student side. Each is a self-contained animated
   component; the orchestrator mounts exactly one at a time. Colours are
   CSS variables from demo.css. */

/* ---- Scene 1: Logo bloom ------------------------------------------ */
export function SceneLogo() {
  return (
    <div className="mv-demo-scene" data-state="in">
      <FloatingConfetti count={6} />
      <div className="mv-bloom-logo">
        <img src={logoSrc} alt="MealVest" />
      </div>
      <div
        className="mv-rise"
        style={{
          marginTop: 22,
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: 3,
          animationDelay: "650ms",
        }}
      >
        MEALVEST
      </div>
      <div
        className="mv-rise"
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.6,
          color: "var(--mv-accent)",
          animationDelay: "950ms",
        }}
      >
        Your food money, already planned.
      </div>
    </div>
  );
}

/* ---- Scene 2: Kinetic headline (problem → fix) -------------------- */
export function SceneHeadline() {
  const [showFix, setShowFix] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowFix(true), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mv-demo-scene" data-state="in">
      <FloatingConfetti count={6} />
      {!showFix ? (
        <KineticWords
          words={["Lunch", "money", "runs", "out."]}
          accentIndex={3}
          size={38}
        />
      ) : (
        <KineticWords
          words={["Now", "it", "lasts", "all", "term."]}
          accentIndex={2}
          size={38}
        />
      )}
    </div>
  );
}

/* ---- Scene 3: Student wallet dashboard ---------------------------- */
export function SceneWallet() {
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 18 }}>
        👛 Your wallet, in view
      </div>
      <div
        className="mv-glass-card mv-pop"
        style={{
          width: "min(360px, 90vw)",
          padding: 22,
          animationDelay: "120ms",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--mv-on-dark-muted)" }}>
          Good afternoon, {DEMO_STUDENT.name}
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 800,
            marginTop: 6,
            color: "var(--mv-on-dark)",
          }}
        >
          <CountUp value={DEMO_STUDENT.balance} prefix="KSh " duration={1000} />
        </div>
        <div style={{ fontSize: 12, color: "var(--mv-on-dark-muted)" }}>
          Food balance
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <div
            className="mv-pop"
            style={{ ...chip, animationDelay: "420ms" }}
          >
            <div style={chipLabel}>Today's allowance</div>
            <div style={chipValue}>
              <CountUp value={DEMO_STUDENT.dailyAllowance} prefix="KSh " duration={900} />
            </div>
          </div>
          <div
            className="mv-pop"
            style={{ ...chip, animationDelay: "600ms" }}
          >
            <div style={chipLabel}>Rolled over</div>
            <div style={{ ...chipValue, color: "var(--mv-success)" }}>
              +KSh {DEMO_STUDENT.rollover}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Scene 4: Ordering (pick hotel + meal, pay with M-Pesa) -------- */
export function SceneOrder() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1100);
    const t2 = setTimeout(() => setStep(2), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const meal = DEMO_MEALS[0];
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 14 }}>
        🍽️ Order in seconds
      </div>
      <PhoneMock>
        <div style={phoneBody}>
          <div style={phoneTitle}>Nearby kitchens</div>
          {DEMO_HOTELS.map((h, i) => (
            <div
              key={h.id}
              className="mv-pop"
              style={{
                ...listRow,
                animationDelay: `${150 + i * 120}ms`,
                border:
                  step >= 1 && i === 0
                    ? "1.5px solid var(--mv-primary)"
                    : "1px solid var(--mv-glass-border)",
                background:
                  step >= 1 && i === 0
                    ? "var(--mv-glass-strong)"
                    : "var(--mv-glass)",
              }}
            >
              <span style={{ fontSize: 20 }}>{h.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                <div style={{ fontSize: 10, color: "var(--mv-on-dark-muted)" }}>
                  {h.tag}
                </div>
              </div>
            </div>
          ))}

          {step >= 2 && (
            <div
              className="mv-rise"
              style={{
                marginTop: "auto",
                background: "var(--mv-card)",
                color: "var(--mv-text)",
                borderRadius: 16,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{meal.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{meal.name}</div>
                  <div style={{ fontSize: 10, color: "var(--mv-text-muted)" }}>
                    Caro Hives
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>KSh {meal.price}</div>
              </div>
              <div style={payBtn}>Pay with M-Pesa</div>
            </div>
          )}
        </div>
      </PhoneMock>
    </div>
  );
}

/* ---- Scene 5: Budget rules (animated cards) ----------------------- */
export function SceneRules() {
  const rules = [
    {
      icon: "📅",
      title: "Daily allowance",
      body: "KSh 230 unlocked every day — never all at once.",
      delay: 150,
    },
    {
      icon: "🔁",
      title: "Auto rollover",
      body: "Unspent balance carries to tomorrow.",
      delay: 380,
    },
  ];
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 18 }}>
        🧭 Smart budget rules
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "min(360px,90vw)" }}>
        {rules.map((r) => (
          <div
            key={r.title}
            className="mv-pop"
            style={{ ...ruleCard, animationDelay: `${r.delay}ms` }}
          >
            <div style={ruleIcon}>{r.icon}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "var(--mv-on-dark-muted)", marginTop: 2 }}>
                {r.body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Scene 6: Phone payment success ------------------------------- */
export function ScenePayment() {
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 14 }}>
        📲 Paid instantly
      </div>
      <PhoneMock>
        <div style={{ ...phoneBody, alignItems: "center", justifyContent: "center" }}>
          <div className="mv-tick-ring" style={tickRing}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle
                cx="30"
                cy="30"
                r="27"
                fill="none"
                stroke="var(--mv-success)"
                strokeWidth="3"
                opacity="0.35"
              />
              <path
                className="mv-tick-path"
                d="M18 31 L27 40 L43 22"
                fill="none"
                stroke="var(--mv-success)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            className="mv-rise"
            style={{ marginTop: 18, fontSize: 18, fontWeight: 800, animationDelay: "300ms" }}
          >
            Payment confirmed
          </div>
          <div
            className="mv-rise"
            style={{
              marginTop: 4,
              fontSize: 13,
              color: "var(--mv-on-dark-muted)",
              animationDelay: "420ms",
            }}
          >
            KSh 180 • M-Pesa
          </div>
        </div>
      </PhoneMock>
    </div>
  );
}

/* ---- Scene 7: QR meal pass ---------------------------------------- */
export function SceneQr() {
  // 7x7 pseudo-random QR matrix (fixed pattern, deterministic reveal).
  const size = 9;
  const cells: React.ReactNode[] = [];
  let k = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const on = (r * 3 + c * 5 + ((r * c) % 4)) % 2 === 0;
      cells.push(
        <div
          key={k}
          className={on ? "mv-qr-cell" : ""}
          style={{
            width: "100%",
            paddingBottom: "100%",
            borderRadius: 2,
            background: on ? "var(--mv-text)" : "transparent",
            animationDelay: `${(k % size) * 40 + r * 30}ms`,
          }}
        />
      );
      k++;
    }
  }
  return (
    <div className="mv-demo-scene" data-state="in">
      <div className="mv-pill mv-pop" style={{ marginBottom: 14 }}>
        🎟️ Your meal pass
      </div>
      <PhoneMock>
        <div style={{ ...phoneBody, alignItems: "center" }}>
          <div style={phoneTitle}>Scan at the kitchen</div>
          <div
            className="mv-pop"
            style={{
              background: "var(--mv-card-white)",
              borderRadius: 18,
              padding: 16,
              marginTop: 8,
              width: 170,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${size}, 1fr)`,
                gap: 3,
              }}
            >
              {cells}
            </div>
          </div>
          <div
            className="mv-rise"
            style={{ marginTop: 16, fontSize: 14, fontWeight: 700, animationDelay: "500ms" }}
          >
            Beef Pilau • Caro Hives
          </div>
          <div
            className="mv-rise"
            style={{
              marginTop: 2,
              fontSize: 11,
              color: "var(--mv-on-dark-muted)",
              animationDelay: "600ms",
            }}
          >
            Pass MV-7731
          </div>
        </div>
      </PhoneMock>
    </div>
  );
}

/* ---- shared inline style fragments -------------------------------- */
const chip: React.CSSProperties = {
  flex: 1,
  background: "var(--mv-glass-strong)",
  border: "1px solid var(--mv-glass-border)",
  borderRadius: 14,
  padding: "10px 12px",
};
const chipLabel: React.CSSProperties = {
  fontSize: 10,
  color: "var(--mv-on-dark-muted)",
  fontWeight: 600,
};
const chipValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  marginTop: 2,
};
const phoneBody: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  padding: "34px 14px 16px",
  gap: 8,
};
const phoneTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--mv-on-dark)",
  marginBottom: 4,
};
const listRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 14,
  padding: "10px 12px",
};
const payBtn: React.CSSProperties = {
  marginTop: 12,
  background: "linear-gradient(90deg, var(--mv-primary), var(--mv-primary-light))",
  color: "#fff",
  borderRadius: 12,
  padding: "11px",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 700,
  boxShadow: "0 8px 20px var(--mv-glow-primary)",
};
const ruleCard: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  background: "var(--mv-glass)",
  border: "1px solid var(--mv-glass-border)",
  borderRadius: 18,
  padding: 16,
};
const ruleIcon: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  background: "var(--mv-glass-strong)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  flexShrink: 0,
};
const tickRing: React.CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: "50%",
  background: "var(--mv-success-soft)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
