import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import "./demo.css";
import { DEMO_SCENES } from "./demoData";
import {
  SceneLogo,
  SceneHeadline,
  SceneWallet,
  SceneOrder,
  SceneRules,
  ScenePayment,
  SceneQr,
} from "./scenesA";
import {
  SceneBloom,
  SceneQueue,
  SceneSales,
  SceneStaff,
  SceneSavings,
  SceneParticles,
  SceneEnd,
} from "./scenesB";

/*
 * MealVest product demo — autoplay orchestrator.
 *
 * Mounts one scene at a time, advancing on each scene's own duration
 * (demoData.DEMO_SCENES). Keying the mounted scene by index forces a
 * fresh mount per entry, so every scene's CSS animations and internal
 * step timers restart cleanly (and on replay). A top progress bar, a
 * skip control, and an end-card replay button round it out.
 *
 * Self-contained: only imports sibling demo modules — no api/auth/
 * service/theme code, no network. Mounted at the public /demo route.
 */

const LAST = DEMO_SCENES.length - 1;

export default function DemoScreen() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  const replay = useCallback(() => setIndex(0), []);
  const skip = useCallback(() => setIndex(LAST), []);
  const close = useCallback(() => {
    // Return where the viewer came from (e.g. the login page); fall back
    // to the app entry if the demo was opened directly as a fresh tab.
    if (window.history.length > 1) navigate(-1);
    else navigate("/login");
  }, [navigate]);

  // Auto-advance, except on the final (end) scene which holds.
  useEffect(() => {
    if (index >= LAST) return;
    const ms = DEMO_SCENES[index].ms;
    const t = setTimeout(() => setIndex((i) => (i < LAST ? i + 1 : i)), ms);
    return () => clearTimeout(t);
  }, [index]);

  const renderScene = () => {
    switch (DEMO_SCENES[index].key) {
      case "logo":
        return <SceneLogo />;
      case "headline":
        return <SceneHeadline />;
      case "wallet":
        return <SceneWallet />;
      case "order":
        return <SceneOrder />;
      case "rules":
        return <SceneRules />;
      case "payment":
        return <ScenePayment />;
      case "qr":
        return <SceneQr />;
      case "bloom":
        return <SceneBloom />;
      case "queue":
        return <SceneQueue />;
      case "sales":
        return <SceneSales />;
      case "staff":
        return <SceneStaff />;
      case "savings":
        return <SceneSavings />;
      case "particles":
        return <SceneParticles />;
      case "end":
        return <SceneEnd onReplay={replay} />;
      default:
        return null;
    }
  };

  return (
    <div className="mv-demo">
      {/* Progress segments */}
      <div className="mv-demo-controls" aria-hidden>
        {DEMO_SCENES.map((s, i) => (
          <div
            key={s.id}
            className={
              "mv-progress-seg" +
              (i < index ? " is-done" : i === index ? " is-active" : "")
            }
          >
            <span
              style={
                i === index
                  ? ({ ["--mv-seg-ms" as string]: `${s.ms}ms` } as React.CSSProperties)
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      <button
        className="mv-close-btn"
        onClick={close}
        type="button"
        aria-label="Close demo"
      >
        <X size={18} />
      </button>

      {index < LAST && (
        <button className="mv-skip-btn" onClick={skip} type="button">
          Skip ›
        </button>
      )}

      <div className="mv-demo-stage">
        {/* key remounts the scene each entry so animations/timers restart */}
        <React.Fragment key={index}>{renderScene()}</React.Fragment>
      </div>
    </div>
  );
}
