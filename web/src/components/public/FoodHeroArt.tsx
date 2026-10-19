import React from "react";

/**
 * Hero food illustration — original SVG artwork (a plate of pilau with beef,
 * kachumbari and chapati), drawn in the brand palette. The repo ships no food
 * photography, and this guarantees the hero never has a broken or unlicensed
 * image. To use a photo instead, drop it in and swap this one component.
 */
export function FoodHeroArt() {
  // Rice grains: fixed coordinates so the picture is identical on every render.
  const grains = [
    [188, 190], [206, 176], [226, 184], [246, 172], [266, 186], [286, 176], [200, 206], [220, 200], [240, 196],
    [260, 204], [280, 198], [196, 224], [216, 218], [238, 214], [258, 222], [278, 216], [212, 238], [234, 234],
    [256, 240], [226, 252], [248, 256],
  ];
  return (
    <svg viewBox="0 0 480 400" role="img" aria-label="A plate of pilau rice with beef, tomato slices and chapati" focusable="false">
      <defs>
        <radialGradient id="fh-plate" cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFF6EA" />
          <stop offset="1" stopColor="#F4CFA8" />
        </radialGradient>
        <radialGradient id="fh-rice" cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#F3C77B" />
          <stop offset="1" stopColor="#D79A45" />
        </radialGradient>
        <radialGradient id="fh-beef" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#B45A35" />
          <stop offset="1" stopColor="#7A301B" />
        </radialGradient>
      </defs>

      {/* table shadow */}
      <ellipse cx="240" cy="352" rx="170" ry="20" fill="#2C1610" opacity="0.22" />

      {/* chapati tucked behind the plate */}
      <g>
        <circle cx="388" cy="146" r="66" fill="#E9B567" />
        <circle cx="388" cy="146" r="66" fill="none" stroke="#C98B3C" strokeWidth="3" opacity="0.5" />
        {[[366, 128], [402, 120], [414, 156], [380, 168], [352, 150], [396, 142]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4 + (i % 3)} fill="#B97A2E" opacity="0.55" />
        ))}
      </g>

      {/* plate */}
      <circle cx="232" cy="214" r="158" fill="#E7B88C" opacity="0.55" transform="translate(0 8)" />
      <circle cx="232" cy="214" r="158" fill="url(#fh-plate)" />
      <circle cx="232" cy="214" r="124" fill="none" stroke="#E9C29B" strokeWidth="3" />
      <circle cx="232" cy="214" r="118" fill="#FBE6CD" opacity="0.7" />

      {/* pilau mound */}
      <ellipse cx="232" cy="212" rx="86" ry="66" fill="url(#fh-rice)" />
      {grains.map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="7" ry="2.6" fill="#FBE3A8" opacity="0.8" transform={`rotate(${(i * 37) % 160 - 80} ${x} ${y})`} />
      ))}

      {/* beef pieces */}
      <rect x="170" y="150" width="46" height="32" rx="14" fill="url(#fh-beef)" transform="rotate(-18 193 166)" />
      <rect x="236" y="140" width="50" height="34" rx="15" fill="url(#fh-beef)" transform="rotate(12 261 157)" />
      <rect x="206" y="226" width="44" height="30" rx="13" fill="url(#fh-beef)" transform="rotate(-6 228 241)" />
      <ellipse cx="184" cy="158" rx="12" ry="4" fill="#fff" opacity="0.18" transform="rotate(-18 184 158)" />
      <ellipse cx="252" cy="148" rx="13" ry="4" fill="#fff" opacity="0.18" transform="rotate(12 252 148)" />

      {/* kachumbari: tomato slices + greens */}
      {[[330, 252], [356, 222], [310, 282]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="24" fill="#E5482E" />
          <circle cx={x} cy={y} r="17" fill="#F3735A" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx={x + Math.cos((a * Math.PI) / 180) * 8} cy={y + Math.sin((a * Math.PI) / 180) * 8} rx="3.4" ry="2" fill="#FFD9C9" transform={`rotate(${a} ${x + Math.cos((a * Math.PI) / 180) * 8} ${y + Math.sin((a * Math.PI) / 180) * 8})`} />
          ))}
        </g>
      ))}
      <path d="M338 196c14-14 34-12 40 2-16 8-30 8-40-2z" fill="#5FAF45" />
      <path d="M292 304c10-16 32-18 42-6-14 12-30 14-42 6z" fill="#4C9438" />
      <path d="M126 258c-4-16 8-30 24-30 2 16-6 30-24 30z" fill="#5FAF45" />

      {/* steam */}
      <g className="mvp-steam" fill="none" stroke="#FCF4EA" strokeWidth="5" strokeLinecap="round" opacity="0.55">
        <path d="M200 112c-12-16 12-24 0-42" />
        <path d="M236 104c-12-16 12-24 0-42" />
        <path d="M272 112c-12-16 12-24 0-42" />
      </g>
    </svg>
  );
}
