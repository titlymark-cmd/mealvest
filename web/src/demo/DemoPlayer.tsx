import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Pause, RotateCcw } from "lucide-react";
import { SCENES, TOTAL_MS } from "./timeline";
import { PausedContext, SceneHost } from "./clock";
import { KineticHeadline } from "./pieces";

const STARTS = SCENES.reduce<number[]>((acc, s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].duration * 1000);
  return acc;
}, []);

const sceneAt = (ms: number) => {
  for (let i = SCENES.length - 1; i >= 0; i--) if (ms >= STARTS[i]) return i;
  return 0;
};

/**
 * The player: one master timeline over SCENES. Autoplays, tap the stage
 * (or press Space) to pause/resume, restart button, Replay at the end.
 * Scenes never hard-cut — the outgoing one fades/slides out while the
 * next slides in (AnimatePresence).
 */
export default function DemoPlayer() {
  const navigate = useNavigate();
  const reduced = !!useReducedMotion();
  const [run, setRun] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);

  const pausedRef = useRef(false);
  const endedRef = useRef(false);
  const elapsed = useRef(0);
  const barRef = useRef<HTMLElement>(null);
  pausedRef.current = paused;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!pausedRef.current && !endedRef.current) {
        elapsed.current = Math.min(TOTAL_MS, elapsed.current + dt);
        setIndex((cur) => {
          const next = sceneAt(elapsed.current);
          return next === cur ? cur : next;
        });
        if (elapsed.current >= TOTAL_MS) {
          endedRef.current = true;
          setEnded(true);
        }
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${elapsed.current / TOTAL_MS})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  const restart = useCallback(() => {
    elapsed.current = 0;
    endedRef.current = false;
    setEnded(false);
    setPaused(false);
    setIndex(0);
    setRun((r) => r + 1);
  }, []);

  const toggle = useCallback(() => {
    if (!endedRef.current) setPaused((p) => !p);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/");
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const scene = SCENES[index];
  const Scene = scene.component;

  return (
    <PausedContext.Provider value={paused}>
      <div className="mvd-root">
        <div
          className={`mvd-stage ${paused ? "mvd-paused" : ""}`}
          onClick={toggle}
          role="button"
          tabIndex={0}
          aria-label={paused ? "Resume demo" : "Pause demo"}
        >
          <div className="mvd-hud">
            <div className="mvd-bar" aria-hidden>
              <i ref={barRef} />
            </div>
            <div className="mvd-hud-row">
              <button className="mvd-iconbtn" onClick={stop(back)} aria-label="Back">
                <ArrowLeft size={16} />
              </button>
              <button className="mvd-iconbtn" onClick={stop(restart)} aria-label="Restart demo">
                <RotateCcw size={15} />
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {reduced ? (
              <motion.div
                key={`${run}-${scene.id}`}
                className="mvd-static"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="mvd-glass">
                  <KineticHeadline text={scene.card.title} accent={scene.card.accent} size="md" />
                  {scene.card.caption && <div className="mvd-label" style={{ marginTop: 12 }}>{scene.card.caption}</div>}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`${run}-${scene.id}`}
                style={{ position: "absolute", inset: 0, willChange: "transform, opacity" }}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 0.6, ease: [0.22, 0.9, 0.3, 1] }}
              >
                <SceneHost>
                  <Scene />
                </SceneHost>
              </motion.div>
            )}
          </AnimatePresence>

          {paused && (
            <div className="mvd-pause-flash" aria-hidden>
              <Pause size={28} />
            </div>
          )}
          {ended && (
            <div className="mvd-replay">
              <button className="mvd-btn is-ghost" onClick={stop(restart)}>
                <RotateCcw size={16} /> Replay
              </button>
            </div>
          )}
        </div>
      </div>
    </PausedContext.Provider>
  );
}
