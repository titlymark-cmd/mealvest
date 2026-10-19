import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Maximize2, Pause, Play } from "lucide-react";
import { DEMO_SCENES } from "../../pages/demo/demoData";
import { useMediaQuery } from "../../hooks/useMediaQuery";

/**
 * The product demo section.
 *
 * There is no video file in this project: the demo is the app's own animated
 * walkthrough, the self-contained /demo route (pages/demo). It is embedded here
 * in an iframe in "embed" mode, where it hides its close/skip controls and
 * loops. It carries no audio at all, so "muted by default" holds trivially.
 *
 * Phones: this component returns null, so on a phone the section does not
 * exist in the DOM. No hidden container, no leftover spacing, nothing loads.
 *
 * Playback hygiene: the iframe is only mounted while the section is within
 * ~one screen of the viewport (IntersectionObserver), so it doesn't run
 * off-screen. With prefers-reduced-motion it does not autoplay; the viewer
 * presses Play. A Pause/Play button is always available.
 */
const SECONDS = Math.round(DEMO_SCENES.reduce((t, s) => t + s.ms, 0) / 1000);

export function DemoShowcase() {
  const isTabletUp = useMediaQuery("(min-width: 768px)");
  if (!isTabletUp) return null;
  return <DemoSection />;
}

function DemoSection() {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const screen = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = screen.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const wantsPlay = !userPaused && (userStarted || !reduceMotion);
  const playing = near && wantsPlay;

  useEffect(() => {
    if (!playing) setLoaded(false);
  }, [playing]);

  return (
    <section className="mvp-section" aria-labelledby="mvp-demo-title" id="demo">
      <div> <center>
          <span className="mvp-eyebrow">Product demo</span>
          <h2 id="mvp-demo-title" className="mvp-h2">
            See MEALVEST in motion
          </h2> </center>
        </div> <br />
      <div className="mv-container"> 
        <div>
          <div className="mvp-demo-frame">
            <div className="mvp-demo-screen" ref={screen}>
              {playing && (
                <iframe
                  title="MEALVEST product demo (animated walkthrough, no sound)"
                  src="/demo?embed=1"
                  loading="lazy"
                  sandbox="allow-scripts allow-same-origin"
                  onLoad={() => setLoaded(true)}
                />
              )}
              {(!playing || !loaded) && (
                <div className="mvp-demo-poster">
                  {playing ? (
                    <p role="status">Loading demo…</p>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="mvp-cta mvp-cta--primary"
                        onClick={() => {
                          setUserPaused(false);
                          setUserStarted(true);
                        }}
                      >
                        <Play size={18} aria-hidden /> {userPaused ? "Resume demo" : "Play demo"}
                      </button>
                      <p>About {SECONDS} seconds · no sound</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mvp-demo-bar">
            <div className="mvp-demo-actions">
              {playing && (
                <button type="button" className="mvp-cta mvp-cta--secondary mvp-cta--sm" onClick={() => setUserPaused(true)}>
                  <Pause size={15} aria-hidden /> Pause
                </button>
              )}
              <Link to="/demo" className="mvp-cta mvp-cta--secondary mvp-cta--sm">
                <Maximize2 size={15} aria-hidden /> Full screen
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
