import React, { createContext, useContext, useEffect, useRef, useState } from "react";

/**
 * Pause state shared by the player and every scene.
 */
export const PausedContext = createContext(false);

interface SceneClock {
  /** scene-local elapsed ms, refreshed ~20x/sec (pause-aware) */
  t: number;
  /** same clock, refreshed every frame — for canvas drawing */
  tRef: React.MutableRefObject<number>;
}

const SceneClockContext = createContext<SceneClock>({ t: 0, tRef: { current: 0 } });

const STATE_STEP_MS = 50;

/**
 * Each scene owns its own clock, starting at 0 on mount. Scenes derive
 * what's on screen from `t` (typing, filtering, toggles, counters...),
 * so pausing the player simply stops the clock.
 */
export function SceneHost({ children }: { children: React.ReactNode }) {
  const paused = useContext(PausedContext);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const tRef = useRef(0);
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastSet = 0;
    const loop = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!pausedRef.current) {
        tRef.current += dt;
        if (tRef.current - lastSet >= STATE_STEP_MS) {
          lastSet = tRef.current;
          setT(tRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <SceneClockContext.Provider value={{ t, tRef }}>{children}</SceneClockContext.Provider>;
}

export const useSceneTime = () => useContext(SceneClockContext).t;
export const useSceneClockRef = () => useContext(SceneClockContext).tRef;

export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** true once the scene clock has passed `ms` */
export const useAfter = (ms: number) => useSceneTime() >= ms;

/** deterministic pseudo-random in [0,1) */
export const hash = (a: number, b = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
