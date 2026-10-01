import React from "react";
import { ArrowRight, Check, Users } from "lucide-react";
import logoSrc from "../../assets/mealvest-logo.png";
import { CardStage, CountUp, FlowerBloom, KineticHeadline, ModalSheet, ParticleWord } from "../pieces";
import { useSceneTime } from "../clock";
import { SAVINGS, kes } from "../mockData";

const typed = (word: string, t: number, start: number, per: number) =>
  t < start ? "" : word.slice(0, Math.min(word.length, Math.floor((t - start) / per) + 1));

/** Scene 11 — Add staff. */
export function StaffScene() {
  const t = useSceneTime();
  const name = typed("Wanjiru", t, 1100, 150);
  const typing = t >= 1100 && name.length < 7;
  const role = t >= 2800 ? "Hotel Staff" : "";
  const pressed = t >= 4000 && t < 4350;
  const added = t >= 4400;
  return (
    <div className="mvd-scene">
      <KineticHeadline text="Right people, right role" accent="role" size="md" />
      <CardStage delay={0.3} style={{ marginTop: 10 }}>
        <div className="mvd-glass mvd-card">
          <span className="mvd-label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Users size={14} /> Team
          </span>
          <div className="mvd-row"><span>Brian</span><span className="mvd-pill">Hotel Staff</span></div>
          <div className="mvd-row"><span>Faith</span><span className="mvd-pill">Hotel Owner</span></div>
        </div>
      </CardStage>
      <ModalSheet open={t >= 500} title="Add staff">
        <div className={`mvd-field ${t >= 1000 && t < 2600 ? "is-focus" : ""}`}>
          <span className={typing ? "mvd-caret" : ""} style={{ color: name ? "var(--mvd-text)" : "var(--mvd-muted)" }}>
            {name || "Name"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {["Hotel Staff", "Hotel Owner"].map((r) => (
            <span key={r} className={`mvd-pill ${role === r ? "is-on" : ""}`} style={{ flex: 1, justifyContent: "center", padding: "11px 8px", transition: "transform 300ms", transform: role === r ? "scale(1.04)" : "none" }}>
              {role === r && <Check size={14} strokeWidth={3} />}
              {r}
            </span>
          ))}
        </div>
        <button className={`mvd-btn ${pressed ? "is-pressed" : ""}`} style={{ width: "100%", minHeight: 52 }} tabIndex={-1}>
          {added ? (
            <>
              <Check size={18} strokeWidth={3} /> Added
            </>
          ) : (
            "Add"
          )}
        </button>
      </ModalSheet>
    </div>
  );
}

/** Scene 12 — Savings: leftover rolls into tomorrow. */
export function SavingsScene() {
  const t = useSceneTime();
  const moved = t >= 2800;
  const pressed = t >= 1300 && t < 1650;
  return (
    <div className="mvd-scene">
      <KineticHeadline text="Unspent? Keep it" accent="Keep" size="md" />
      <CardStage delay={0.3} style={{ marginTop: 10 }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="mvd-glass mvd-card">
            <span className="mvd-label">Saved</span>
            <div style={{ fontSize: 34 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: "var(--mvd-muted)", marginRight: 6 }}>KES</span>
              <CountUp to={SAVINGS.leftover} start={700} dur={900} />
            </div>
            <button className={`mvd-btn ${pressed ? "is-pressed" : ""}`} style={{ width: "100%" }} tabIndex={-1}>
              Move to tomorrow
            </button>
          </div>
          <div className="mvd-glass mvd-card">
            <span className="mvd-label">Tomorrow</span>
            <div style={{ fontSize: 30 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: "var(--mvd-muted)", marginRight: 6 }}>KES</span>
              {moved ? <CountUp to={SAVINGS.daily + SAVINGS.leftover} start={2800} dur={800} /> : <span className="mvd-num">{SAVINGS.daily}</span>}
            </div>
          </div>
          {t >= 1700 && t < 3200 && (
            <div className="mvd-fly" style={{ top: 84, "--fy": "168px" } as React.CSSProperties}>
              <span className="mvd-pill is-on mvd-num" style={{ boxShadow: "0 0 24px var(--mvd-accent-glow)" }}>+{kes(SAVINGS.leftover)}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", minHeight: 52 }}>
          {t >= 3800 && (
            <button className="mvd-btn is-ghost mvd-slide" tabIndex={-1}>
              Withdraw
            </button>
          )}
          {t >= 4600 && (
            <span className="mvd-pill is-on mvd-pop">
              <Check size={14} strokeWidth={3} /> 100% yours
            </span>
          )}
        </div>
      </CardStage>
    </div>
  );
}

/** Scene 13 — Particle word. */
export function ParticleScene() {
  return (
    <div className="mvd-scene mvd-center">
      <ParticleWord word="fed" />
    </div>
  );
}

/** Scene 14 — End card. */
export function EndScene() {
  return (
    <div className="mvd-scene mvd-center" style={{ gap: 22 }}>
      <FlowerBloom size={200} petals={8} soft duration={1200}>
        <img className="mvd-grow" src={logoSrc} alt="MealVest" style={{ position: "absolute", width: 80, height: 80, objectFit: "contain", "--gd": "500ms" } as React.CSSProperties} />
      </FlowerBloom>
      <div className="mvd-slide" style={{ "--sd": "1000ms", fontSize: 26, fontWeight: 700, letterSpacing: "0.02em" } as React.CSSProperties}>
        Meal<span className="mvd-accent">Vest</span>
      </div>
      <div className="mvd-slide" style={{ "--sd": "1500ms", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 } as React.CSSProperties}>
        <button className="mvd-btn mvd-breathe" tabIndex={-1} style={{ minHeight: 54, padding: "0 34px" }}>
          Get started <ArrowRight size={18} />
        </button>
        <span style={{ fontSize: 12, color: "var(--mvd-muted)" }}>Coming soon</span>
      </div>
    </div>
  );
}
