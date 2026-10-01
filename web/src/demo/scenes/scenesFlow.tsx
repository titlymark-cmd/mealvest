import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Search, ShieldCheck, ShoppingBag } from "lucide-react";
import { CardStage, FloatingShapes, KineticHeadline, ModalSheet, PhoneMock, QRReveal, RowSweep, ToggleSwitch } from "../pieces";
import { useSceneTime } from "../clock";
import { CART, CART_TOTAL, HOTEL, MENU, WALLET, kes } from "../mockData";

const typed = (word: string, t: number, start: number, per: number) =>
  word.slice(0, Math.max(0, Math.min(word.length, Math.floor((t - start) / per) + (t >= start ? 1 : 0))));

/** Scene 4 — Order flow. */
export function OrderScene() {
  const t = useSceneTime();
  const query = typed("Pilau", t, 1500, 130);
  const filtering = t >= 2300;
  const rows = filtering ? MENU.filter((m) => m.name.toLowerCase().includes("pilau")) : MENU;
  const sweeping = t >= 4000 && t < 5200;
  const hot = t >= 4000;
  const modalOpen = t >= 5900 && t < 8900;
  const pressed = t >= 7800 && t < 8150;

  return (
    <div className="mvd-scene">
      <KineticHeadline text="Order in seconds" accent="seconds" size="md" />
      <CardStage delay={0.3} style={{ marginTop: 10 }}>
        <div className="mvd-glass mvd-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 16 }}>{HOTEL}</strong>
            <span className="mvd-label">Menu</span>
          </div>
          <div className="mvd-field" style={{ minHeight: 42, fontSize: 14 }}>
            <Search size={16} color="var(--mvd-muted)" />
            <span className={query && query.length < 5 ? "mvd-caret" : ""} style={{ color: query ? "var(--mvd-text)" : "var(--mvd-muted)" }}>
              {query || "Search"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 190 }}>
            <AnimatePresence initial={false} mode="popLayout">
              {rows.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                >
                  <RowSweep active={sweeping && m.id === "pc"} hot={hot && m.id === "pc"}>
                    <span>{m.name}</span>
                    <span style={{ color: "var(--mvd-muted)" }}>{kes(m.price)}</span>
                  </RowSweep>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {t >= 5000 && (
            <div className="mvd-pop" style={{ alignSelf: "center" }}>
              <span className="mvd-pill is-on">
                <ShoppingBag size={14} /> Add to cart
              </span>
            </div>
          )}
        </div>
      </CardStage>

      <ModalSheet open={modalOpen} title="Cart">
        {CART.map((i) => (
          <div key={i.id} className="mvd-row" style={{ minHeight: 48 }}>
            <span>{i.name}</span>
            <span>{kes(i.price)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 4px" }}>
          <span className="mvd-label">Total</span>
          <span className="mvd-num" style={{ fontSize: 24 }}>
            {kes(CART_TOTAL)}
          </span>
        </div>
        <button className={`mvd-btn ${pressed ? "is-pressed" : ""}`} style={{ width: "100%", minHeight: 54 }} tabIndex={-1}>
          Pay with M-Pesa
        </button>
      </ModalSheet>
    </div>
  );
}

/** Scene 5 — Budget rules. */
export function RulesScene() {
  const t = useSceneTime();
  const amount = typed("350", t, 1200, 260);
  const typing = t >= 1200 && amount.length < 3;
  const toggled = t >= 2800;
  return (
    <div className="mvd-scene">
      <KineticHeadline text="Set the budget once" accent="budget" size="md" />
      <CardStage delay={0.3} style={{ marginTop: 10 }}>
        <div className="mvd-glass mvd-card">
          <span className="mvd-label">Daily allowance</span>
          <div className={`mvd-field ${t >= 1000 && t < 2600 ? "is-focus" : ""}`}>
            <span style={{ color: "var(--mvd-muted)", fontSize: 13 }}>KES</span>
            <span className={`mvd-num ${typing ? "mvd-caret" : ""}`} style={{ fontSize: 20 }}>
              {amount}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6 }}>
            <span style={{ fontWeight: 500 }}>Auto rollover</span>
            <ToggleSwitch on={toggled} />
          </div>
        </div>
        <div className="mvd-glass mvd-card" style={{ marginTop: 6 }}>
          <span className="mvd-label">Preview</span>
          {t >= 3600 && (
            <div className="mvd-row mvd-slide-x" style={{ minHeight: 48 }}>
              <span>Daily allowance</span>
              <span className="mvd-accent mvd-num">{kes(WALLET.daily)}</span>
            </div>
          )}
          {t >= 4400 && (
            <div className="mvd-row mvd-slide-x" style={{ minHeight: 48 }}>
              <span>Rollover</span>
              <span className="mvd-accent mvd-num">On</span>
            </div>
          )}
        </div>
      </CardStage>
    </div>
  );
}

/** Scene 6 — Phone payment, then the meal pass. */
export function PaymentScene() {
  const t = useSceneTime();
  const showCard = t < 900;

  const phone = t >= 700;
  const sheetOpen = t >= 1800;
  const phase = t >= 7200 ? "pass" : t >= 4800 ? "paid" : "pay";
  const pinDots = Math.max(0, Math.min(4, Math.floor((t - 3200) / 250)));

  return (
    <div className="mvd-scene mvd-center">
      <FloatingShapes count={9} />
      <AnimatePresence>
        {showCard && (
          <CardStage key="card" style={{ position: "absolute", top: "40%", left: 18, right: 18, width: "auto", alignItems: "center", zIndex: 2 }}>
            <div className="mvd-glass mvd-card" style={{ alignItems: "center" }}>
              <span className="mvd-label">Total</span>
              <span className="mvd-num" style={{ fontSize: 28 }}>{kes(CART_TOTAL)}</span>
            </div>
          </CardStage>
        )}
      </AnimatePresence>

      {phone && (
        <div style={{ position: "relative", zIndex: 2 }}>
          <PhoneMock>
            <AnimatePresence>
              {sheetOpen && (
                <motion.div
                  key="sheet"
                  className="mvd-psheet"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 22 }}
                >
                  {phase === "pay" && (
                    <>
                      <strong style={{ fontSize: 14 }}>Pay with M-Pesa</strong>
                      <span className="mvd-num" style={{ fontSize: 22 }}>{kes(CART_TOTAL)}</span>
                      {t >= 2800 && (
                        <div className="mvd-pop mvd-glass" style={{ width: "100%", padding: "10px 12px", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                          <span className="mvd-label" style={{ fontSize: 10 }}>Enter PIN</span>
                          <div style={{ display: "flex", gap: 8 }}>
                            {[0, 1, 2, 3].map((i) => (
                              <span
                                key={i}
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  background: i < pinDots ? "var(--mvd-accent)" : "var(--mvd-glass-strong)",
                                  border: "1px solid var(--mvd-border)",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {phase === "paid" && (
                    <>
                      <div style={{ position: "relative", width: 64, height: 64 }}>
                        <span className="mvd-ring" />
                        <span
                          className="mvd-pop"
                          style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--mvd-accent)", color: "var(--mvd-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px var(--mvd-accent-glow)" }}
                        >
                          <Check size={36} strokeWidth={3.2} />
                        </span>
                      </div>
                      <strong className="mvd-slide" style={{ fontSize: 15, ["--sd" as string]: "250ms" } as React.CSSProperties}>Paid</strong>
                    </>
                  )}
                  {phase === "pass" && (
                    <>
                      <div style={{ width: 118 }}>
                        <QRReveal />
                      </div>
                      <strong style={{ fontSize: 13 }}>Meal pass</strong>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </PhoneMock>
          {t >= 2000 && (
            <span
              className="mvd-pop"
              style={{ position: "absolute", right: -18, top: 54, width: 44, height: 44, borderRadius: "50%", background: "var(--mvd-accent)", color: "var(--mvd-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 26px var(--mvd-accent-glow)" }}
            >
              <ShieldCheck size={24} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
