import { useEffect, useState } from "react";

/**
 * Live `matchMedia` subscription. Used where a section must not exist in the
 * DOM at all for some viewports (e.g. the demo on phones), which a CSS
 * `display:none` can't guarantee: hidden content would still mount, load and
 * run. Returns `false` where matchMedia is unavailable (old browsers, tests).
 */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange); // Safari < 14
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}
