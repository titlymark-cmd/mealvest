import React from "react";
import { Check, Wallet as WalletIcon, UtensilsCrossed, CalendarDays } from "lucide-react";
import logoSrc from "../../assets/mealvest-logo.png";
import { CardStage, CountUp, FloatingShapes, FlowerBloom, KineticHeadline } from "../pieces";
import { STUDENT, WALLET } from "../mockData";

/** Scene 1 — Logo bloom. No text. */
export function LogoBloomScene() {
  return (
    <div className="mvd-scene mvd-center">
      <FlowerBloom size={260} petals={8} soft duration={1500}>
        <img
          className="mvd-grow"
          src={logoSrc}
          alt="MealVest"
          style={{ position: "absolute", width: 96, height: 96, objectFit: "contain", ["--gd" as string]: "900ms" }}
        />
      </FlowerBloom>
    </div>
  );
}

/** Scene 2 — Opening headline. */
export function HeadlineScene() {
  return (
    <div className="mvd-scene mvd-center">
      <FloatingShapes />
      <div style={{ position: "relative", zIndex: 2, padding: "0 10px" }}>
        <KineticHeadline text="Campus meals, sorted" accent="sorted" delay={200} />
      </div>
      <div className="mvd-pop" style={{ ["--pd" as string]: "2000ms", position: "relative", zIndex: 2 }}>
        <span className="mvd-fchip is-check" style={{ ["--s" as string]: "46px", width: 46, height: 46 } as React.CSSProperties}>
          <Check size={26} strokeWidth={3} />
        </span>
      </div>
    </div>
  );
}

/** Scene 3 — Wallet dashboard. */
export function WalletScene() {
  return (
    <div className="mvd-scene">
      <KineticHeadline text="Every shilling, in view" accent="in view" size="md" />
      <CardStage delay={0.35} style={{ marginTop: 10 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div className="mvd-label">Good morning, {STUDENT.name}</div>
        </div>
        <div className="mvd-glass mvd-card" style={{ padding: 20 }}>
          <span className="mvd-label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <WalletIcon size={14} /> Balance
          </span>
          <div style={{ fontSize: 38 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: "var(--mvd-muted)", marginRight: 6 }}>KES</span>
            <CountUp to={WALLET.balance} start={900} dur={1600} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 380 }}>
          <div className="mvd-glass mvd-card" style={{ flex: 1, padding: 16, minWidth: 0 }}>
            <span className="mvd-label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <CalendarDays size={13} /> Daily allowance
            </span>
            <div style={{ fontSize: 24 }}>
              <CountUp to={WALLET.daily} start={1300} dur={1400} />
            </div>
          </div>
          <div className="mvd-glass mvd-card" style={{ flex: 1, padding: 16, minWidth: 0 }}>
            <span className="mvd-label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <UtensilsCrossed size={13} /> Meals left
            </span>
            <div style={{ fontSize: 24 }}>
              <CountUp to={WALLET.mealsLeft} start={1700} dur={1200} />
            </div>
          </div>
        </div>
      </CardStage>
    </div>
  );
}
