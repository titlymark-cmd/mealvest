import React, { useState } from "react";
import { FoodHeroArt } from "./FoodHeroArt";

/**
 * Hero food photo: a plate of pilau, beef stew, fried chicken and cabbage,
 * from the WordPress Photo Directory (CC0 / public domain: free for any use,
 * no attribution required). Photo by Joan Namunina.
 * Source page: https://wordpress.org/photos/photo/40769ce140/
 *
 * Hot-linked from pd.w.org as requested. If it ever fails to load (offline,
 * blocked, removed upstream) it falls back to the bundled illustration, so the
 * hero never shows a broken image. To self-host later, download the file into
 * public/ and point HERO_SRC at it.
 */
const BASE = "https://pd.w.org/2026/04/40769ce140ee26037.52720050";
const HERO_SRC = `${BASE}-1536x1152.jpg`;
const HERO_SRCSET = `${BASE}-768x576.jpg 768w, ${BASE}-1536x1152.jpg 1536w`;

export function HeroPhoto() {
  const [failed, setFailed] = useState(false);
  if (failed) return <FoodHeroArt />;
  return (
    <img
      src={HERO_SRC}
      srcSet={HERO_SRCSET}
      sizes="(min-width: 1024px) 520px, (min-width: 768px) 45vw, 92vw"
      width={1536}
      height={1152}
      alt="A plate of pilau rice with beef stew, fried chicken, cabbage and melon slices, with a glass of orange juice"
      decoding="async"
      // @ts-expect-error fetchpriority is valid HTML; React 19 types it as lowercase attribute
      fetchpriority="high"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
