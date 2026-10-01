import React from "react";
import { ChefHat, GraduationCap, ShieldUser, Store } from "lucide-react";
import { CardStage, CountUp, FlowerBloom, KineticHeadline, PillMarquee } from "../pieces";
import { useSceneTime } from "../clock";
import { PASSES, SALES, STAFF_HOTEL, kes } from "../mockData";

const ROLE_ITEMS = [
  { label: "Student", icon: <GraduationCap size={16} /> },
  { label: "Hotel Staff", icon: <ChefHat size={16} /> },
  { label: "Hotel Owner", icon: <Store size={16} /> },
  { label: "Admin", icon: <ShieldUser size={16} /> },
];

/** Scene 7 — Roles marquee. */
export function RolesScene() {
  return (
    <div className="mvd-scene mvd-center" style={{ padding: 0 }}>
      <PillMarquee items={ROLE_ITEMS} rows={7} seconds={6} />
      <div className="mvd-glass mvd-pop" style={{ ["--pd" as string]: "500ms", position: "relative", zIndex: 2, padding: "22px 34px", textAlign: "center", background: "var(--mvd-bg)" } as React.CSSProperties}>
        <div style={{ fontSize: 40, lineHeight: 1 }} className="mvd-accent">
          <CountUp to={4} start={700} dur={700} />
        </div>
        <div className="mvd-label" style={{ marginTop: 6 }}>roles</div>
      </div>
    </div>
  );
}

/** Scene 8 — Bloom transition: cyan fills the screen, then opens. */
export function BloomTransitionScene() {
  return (
    <div className="mvd-scene" style={{ padding: 0 }} aria-hidden>
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <FlowerBloom size="150vmax" petals={10} duration={1100} />
      </div>
      <span className="mvd-disc is-cyan" style={{ "--ds": "140vmax", "--dt": "700ms", "--dd": "850ms" } as React.CSSProperties} />
      <span className="mvd-disc is-navy" style={{ "--ds": "140vmax", "--dt": "1000ms", "--dd": "1750ms" } as React.CSSProperties} />
    </div>
  );
}

const ROW_PITCH = 64;
const SCAN_START = 1600;
const SCAN_MS = 4200;

function Flip({ done }: { done: boolean }) {
  return (
    <span className={`mvd-flip ${done ? "is-done" : ""}`}>
      <span className="mvd-flip-in">
        <span className="mvd-face">Ready</span>
        <span className="mvd-face is-back">Redeemed</span>
      </span>
    </span>
  );
}

/** Scene 9 — Redeem queue (hotel staff view). */
export function RedeemScene() {
  const t = useSceneTime();
  const listH = PASSES.length * ROW_PITCH - 8;
  return (
    <div className="mvd-scene">
      <KineticHeadline text="Redeem in seconds" accent="seconds" size="md" />
      <CardStage delay={0.3} style={{ marginTop: 10 }}>
        <div className="mvd-glass mvd-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="mvd-pill is-on">Hotel Staff</span>
            <span className="mvd-label">{STAFF_HOTEL}</span>
          </div>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, height: listH }}>
            {PASSES.map((p, i) => (
              <div key={p.id} className="mvd-row">
                <span>
                  {p.who}
                  <small>
                    {p.id} · {p.dish}
                  </small>
                </span>
                <Flip done={t >= SCAN_START + (SCAN_MS * (i + 0.6)) / PASSES.length} />
              </div>
            ))}
            <span className="mvd-scan" style={{ "--sdel": `${SCAN_START}ms`, "--sdur": `${SCAN_MS}ms`, "--sh": `${listH - 3}px` } as React.CSSProperties} />
          </div>
        </div>
      </CardStage>
    </div>
  );
}

const STEPS = ["Ordered", "Paid", "Redeemed"];
const STEP_AT = [3400, 4000, 4600];

/** Scene 10 — Every meal on record (hotel owner view). */
export function RecordScene() {
  const t = useSceneTime();
  const rows = SALES.slice(0, 4);
  const picked = 2;
  const done = STEP_AT.filter((a) => t >= a).length;
  return (
    <div className="mvd-scene">
      <KineticHeadline text="Every meal on record" accent="record" size="md" />
      <CardStage delay={0.3} style={{ marginTop: 10 }}>
        <div className="mvd-glass mvd-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="mvd-pill is-on">Hotel Owner</span>
            <span className="mvd-label">Sales</span>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.who}
              className={`mvd-row mvd-slide ${t >= 2600 && i === picked ? "is-hot" : ""}`}
              style={{ "--sd": `${900 + i * 180}ms`, minHeight: 50 } as React.CSSProperties}
            >
              <span>
                {r.who}
                <small>
                  {r.dish} · {r.time}
                </small>
              </span>
              <span className="mvd-num">{kes(r.amount)}</span>
            </div>
          ))}
        </div>
        {t >= 2800 && (
          <div className="mvd-glass mvd-card mvd-slide-x" style={{ borderColor: "var(--mvd-accent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 500 }}>{rows[picked].who}</span>
              <span className="mvd-num mvd-accent" style={{ fontSize: 22 }}>{kes(rows[picked].amount)}</span>
            </div>
            <div className="mvd-steps">
              <div className="mvd-stepline">
                <i style={{ "--p": Math.max(0, (done - 1) / 2) } as React.CSSProperties} />
              </div>
              {STEPS.map((s, i) => (
                <div key={s} className={`mvd-step ${i < done ? "is-done" : ""}`}>
                  <i />
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardStage>
    </div>
  );
}
