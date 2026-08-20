import { activeExtraTrees, activeFlowers } from "./trail/worldMarkers";

// A full-bleed illustrated meadow scene behind the dashboard -- original flat-vector
// art in the same style as animals/AnimalMascot.tsx, not a photo. Deliberately not a
// photograph: this project ships fully offline (see Baloo2/Blockly-media entries in
// DECISIONS.md -- everything visual is either drawn here or vendored under a license
// that permits redistribution), and a stock photo pulled from a commercial site like
// rawpixel doesn't clear that bar. Sits fixed behind the page; every piece of real
// dashboard content renders in front of it with its own solid/semi-opaque background so
// legibility never depends on how busy this scene gets.
//
// `solvedCount` grows the meadow (trail/worldMarkers.ts's WORLD_GROWTH_STAGES) -- a pure,
// additive derivation of GameState.solved_levels.length, not a new progression system.
interface BackgroundSceneProps {
  solvedCount?: number;
}

export default function BackgroundScene({ solvedCount = 0 }: BackgroundSceneProps) {
  const extraFlowers = activeFlowers(solvedCount);
  const extraTrees = activeExtraTrees(solvedCount);

  return (
    <svg
      className="fixed inset-0 -z-10 h-full w-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="quest-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfe6f5" />
          <stop offset="100%" stopColor="#fff8ec" />
        </linearGradient>
      </defs>

      <rect width="1600" height="900" fill="url(#quest-sky)" />

      {/* The sun's disc/face is STATIC; only its ray ring turns, slowly (see
          idleAnimation.test.ts's WORLD AMBIENT MOTION budget). Clouds drift too
          (quest-cloud): reinstated deliberately per "make the world feel alive",
          reversing this file's earlier "static, pet is the only exception" decision --
          but every motion here is stepped/transform-only and gated off in Calm Mode via
          the same quest-decorative kill-switch as everything else.
          NOTE the structure: an outer <g transform="translate(...)"> that only ever
          POSITIONS things (a plain SVG attribute), wrapping an inner <g className="quest-...">
          that CSS ANIMATES. Never both on the same element -- a CSS `transform` animation
          silently replaces an element's own `transform="translate(...)"` attribute rather
          than composing with it, which would fling the animated piece to the SVG's origin.
          Confirmed the hard way once already this session (Trail.tsx's disabled-button
          hover bug); every animated shape below follows this split from the start. */}
      <g transform="translate(1420,150)">
        <g className="quest-sun-rays quest-decorative">
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="-6" y="-142" width="12" height="30" rx="6" fill="#ffd166" transform={`rotate(${i * 45})`} />
          ))}
        </g>
        <circle r="90" fill="#ffdb70" opacity="0.9" />
        <circle r="62" fill="#ffb703" />
        {/* a friendly face -- the classic kids'-illustration sun, not just a disc */}
        <circle cx="-20" cy="-8" r="6" fill="#8a5a3a" />
        <circle cx="20" cy="-8" r="6" fill="#8a5a3a" />
        <path d="M -24 16 Q 0 38 24 16" stroke="#8a5a3a" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>

      <g fill="#ffffff" opacity="0.85">
        <g className="quest-cloud quest-decorative" style={{ animationDelay: "0s" }} transform="translate(220,120)">
          <ellipse cx="0" cy="0" rx="70" ry="30" />
          <ellipse cx="50" cy="-14" rx="46" ry="26" />
          <ellipse cx="-55" cy="-8" rx="40" ry="22" />
        </g>
        <g className="quest-cloud quest-decorative" style={{ animationDelay: "-7s" }} transform="translate(760,90)">
          <ellipse cx="0" cy="0" rx="55" ry="24" />
          <ellipse cx="40" cy="-10" rx="36" ry="20" />
        </g>
        <g className="quest-cloud quest-decorative" style={{ animationDelay: "-14s" }} transform="translate(1080,210)">
          <ellipse cx="0" cy="0" rx="48" ry="20" />
          <ellipse cx="34" cy="-8" rx="30" ry="16" />
        </g>
      </g>

      {/* birds */}
      <g stroke="#4a3f35" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.5">
        <path d="M 380 200 Q 392 188 404 200 Q 416 188 428 200" />
        <path d="M 500 260 Q 510 250 520 260 Q 530 250 540 260" />
        <path d="M 980 160 Q 990 150 1000 160 Q 1010 150 1020 160" />
      </g>

      {/* far hill */}
      <path d="M 0 620 Q 260 540 560 610 T 1120 600 T 1600 630 V 900 H 0 Z" fill="#bfe0a8" />
      {/* mid hill */}
      <path d="M 0 700 Q 320 620 700 690 T 1300 680 T 1600 700 V 900 H 0 Z" fill="#8bc34a" />

      {/* trees on the mid hill -- extraTrees grows this additively as solvedCount passes
          trail/worldMarkers.ts's thresholds, same base art, no new asset. */}
      {[
        { x: 140, y: 660, s: 1 },
        { x: 1500, y: 690, s: 1.2 },
        { x: 60, y: 720, s: 0.8 },
        ...extraTrees,
      ].map((t, i) => (
        <g key={i} transform={`translate(${t.x},${t.y}) scale(${t.s})`}>
          <rect x="-6" y="10" width="12" height="30" fill="#8a5a3a" rx="3" />
          <circle cx="0" cy="-4" r="34" fill="#4caf50" />
          <circle cx="-20" cy="10" r="24" fill="#4caf50" />
          <circle cx="22" cy="10" r="24" fill="#4caf50" />
        </g>
      ))}

      {/* foreground hill */}
      <path d="M 0 780 Q 300 720 700 770 T 1300 760 T 1600 780 V 900 H 0 Z" fill="#4caf50" />

      {/* winding path, like a real playground's paved walkway -- referenced from the
          playground illustration the user shared. Under everything else so toys/bushes
          sit on top of it. */}
      <path
        d="M -40 830 Q 260 760 560 815 T 1150 790 T 1650 840"
        stroke="#f3e2bb"
        strokeWidth="40"
        fill="none"
        strokeLinecap="round"
        opacity="0.65"
      />

      {/* bushes -- small rounded shrub clusters along the path/grass, the abundant
          greenery the reference photo is full of. Same trunk-free technique as the
          trees above, just smaller and without a trunk. */}
      {[
        { x: 210, y: 800, s: 0.8 },
        { x: 430, y: 815, s: 0.65 },
        { x: 760, y: 790, s: 0.75 },
        { x: 1000, y: 830, s: 0.6 },
        { x: 1260, y: 800, s: 0.85 },
        { x: 1480, y: 830, s: 0.7 },
      ].map((b, i) => (
        <g key={i} transform={`translate(${b.x},${b.y}) scale(${b.s})`}>
          <circle cx="-16" cy="4" r="17" fill="#6fae3e" />
          <circle cx="16" cy="4" r="17" fill="#6fae3e" />
          <circle cx="0" cy="-8" r="19" fill="#7bbf49" />
        </g>
      ))}

      {/* flowers scattered on the foreground -- the base six are always there; extraFlowers
          grows the meadow additively as the child solves more levels (worldMarkers.ts). */}
      {[
        { x: 90, y: 850, c: "#ff6b6b" },
        { x: 260, y: 875, c: "#ffb703" },
        { x: 520, y: 855, c: "#9b6bdb" },
        { x: 900, y: 870, c: "#ff6b6b" },
        { x: 1180, y: 850, c: "#3bb4e5" },
        { x: 1420, y: 875, c: "#ffb703" },
        ...extraFlowers,
      ].map((f, i) => (
        <g key={i} transform={`translate(${f.x},${f.y})`}>
          <circle cx="0" cy="-8" r="6" fill={f.c} />
          <circle cx="-6" cy="-2" r="6" fill={f.c} />
          <circle cx="6" cy="-2" r="6" fill={f.c} />
          <circle cx="0" cy="4" r="6" fill={f.c} />
          <circle cx="0" cy="-2" r="4" fill="#fff8ec" />
        </g>
      ))}

      {/* ===================================================================
       * PLAYGROUND & TOYS -- the kiddish set-dressing that makes this read as a
       * children's world rather than a generic meadow: a swing set, a slide, a seesaw,
       * a few teddy bears, a beach ball, a stack of building blocks. Flat-vector, same
       * palette as everything else on this page (coral/gold/sky-blue/purple + the
       * existing wood-brown), fully static -- decorative equipment, not something that
       * needs to move to read as alive; the clouds already carry that job. */}

      {/* swing set */}
      <g transform="translate(300,700)" stroke="#6b4423" strokeWidth="10" strokeLinecap="round" fill="none">
        <path d="M -70 110 L -20 0 L 30 110" />
        <path d="M 50 110 L 100 0 L 150 110" />
        <line x1="-20" y1="0" x2="100" y2="0" />
        <g stroke="#4a3f35" strokeWidth="3">
          <line x1="0" y1="4" x2="-6" y2="66" />
          <line x1="10" y1="4" x2="16" y2="66" />
          <line x1="55" y1="4" x2="49" y2="66" />
          <line x1="65" y1="4" x2="71" y2="66" />
        </g>
        <rect x="-11" y="66" width="30" height="10" rx="4" fill="#ff6b6b" stroke="none" />
        <rect x="44" y="66" width="30" height="10" rx="4" fill="#3bb4e5" stroke="none" />
      </g>

      {/* slide */}
      <g transform="translate(980,700)">
        <rect x="-6" y="60" width="9" height="70" fill="#6b4423" />
        <rect x="27" y="60" width="9" height="70" fill="#6b4423" />
        <line x1="-2" y1="128" x2="-2" y2="62" stroke="#8a5a3a" strokeWidth="5" />
        <line x1="31" y1="128" x2="31" y2="62" stroke="#8a5a3a" strokeWidth="5" />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="-2" y1={110 - i * 18} x2="31" y2={110 - i * 18} stroke="#8a5a3a" strokeWidth="4" />
        ))}
        <rect x="-10" y="48" width="55" height="14" rx="5" fill="#ffb703" />
        <path d="M 40 54 Q 120 90 155 150 L 130 150 Q 100 96 34 62 Z" fill="#3bb4e5" />
      </g>

      {/* seesaw */}
      <g transform="translate(700,862)">
        <path d="M -18 0 L 18 0 L 0 -20 Z" fill="#8a5a3a" />
        <rect x="-75" y="-27" width="150" height="11" rx="5" fill="#ff6b6b" transform="rotate(-11)" />
        <circle cx="-63" cy="-14" r="6" fill="#ffb703" />
        <circle cx="63" cy="-38" r="6" fill="#ffb703" />
      </g>

      {/* beach ball */}
      <g transform="translate(1080,865) scale(0.85)">
        {(() => {
          const R = 20;
          const colors = ["#ff6b6b", "#ffb703", "#3bb4e5", "#ff6b6b", "#ffb703", "#3bb4e5"];
          return colors.map((c, i) => {
            const a1 = (Math.PI / 3) * i;
            const a2 = (Math.PI / 3) * (i + 1);
            const x1 = R * Math.cos(a1);
            const y1 = R * Math.sin(a1);
            const x2 = R * Math.cos(a2);
            const y2 = R * Math.sin(a2);
            return <path key={i} d={`M0,0 L${x1},${y1} A${R},${R} 0 0,1 ${x2},${y2} Z`} fill={c} />;
          });
        })()}
        <circle r={20} fill="none" stroke="#fff8ec" strokeWidth="1.5" />
      </g>

      {/* stacked building blocks */}
      <g transform="translate(480,855)">
        <rect x="-24" y="-8" width="22" height="22" rx="3" fill="#ff6b6b" />
        <rect x="0" y="-8" width="22" height="22" rx="3" fill="#3bb4e5" />
        <rect x="-13" y="-29" width="22" height="22" rx="3" fill="#ffb703" />
      </g>

      {/* sandbox with a bucket and shovel, straight out of the reference photo */}
      <g transform="translate(1260,815)">
        <ellipse cx="0" cy="18" rx="82" ry="30" fill="#c98a52" />
        <ellipse cx="0" cy="12" rx="68" ry="22" fill="#f3d9a1" />
        <path d="M -18 -2 L -13 16 L 5 16 L 9 -2 Z" fill="#ff6b6b" />
        <rect x="-20" y="-6" width="30" height="6" rx="2" fill="#ff6b6b" />
        <line x1="24" y1="-4" x2="40" y2="-22" stroke="#8a5a3a" strokeWidth="4" strokeLinecap="round" />
        <path d="M 36 -26 L 48 -14 L 40 -8 L 30 -20 Z" fill="#3bb4e5" />
      </g>

      {/* kite, up in the sky, swaying gently on its string */}
      <g transform="translate(230,240)">
        <g className="quest-kite-inner quest-decorative" style={{ transformOrigin: "0px -30px" }}>
          <path d="M 0 -30 L 22 0 L 0 0 Z" fill="#ffb703" />
          <path d="M 0 -30 L -22 0 L 0 0 Z" fill="#ff6b6b" />
          <path d="M 0 0 L 22 0 L 0 30 Z" fill="#3bb4e5" />
          <path d="M 0 0 L -22 0 L 0 30 Z" fill="#9b6bdb" />
          <line x1="0" y1="30" x2="-14" y2="110" stroke="#8a5a3a" strokeWidth="2" />
          <path d="M -14 110 l -7 9 l 7 5 l 7 -5 Z" fill="#ff6b6b" />
          <path d="M -20 132 l -7 9 l 7 5 l 7 -5 Z" fill="#3bb4e5" />
        </g>
      </g>

      {/* pinwheel, planted in the grass, blades spinning */}
      <g transform="translate(600,798)">
        <line x1="0" y1="0" x2="0" y2="52" stroke="#8a5a3a" strokeWidth="4" strokeLinecap="round" />
        <g transform="translate(0,-2)">
          <g className="quest-pinwheel-blades quest-decorative" style={{ transformOrigin: "0px 0px" }}>
            {["#ff6b6b", "#ffb703", "#3bb4e5", "#9b6bdb"].map((c, i) => (
              <path key={c} d="M0,0 L18,-7 L18,7 Z" fill={c} transform={`rotate(${i * 90})`} />
            ))}
            <circle r="4" fill="#4a3f35" />
          </g>
        </g>
      </g>

      {/* balloons, bobbing on their strings */}
      {[
        { x: 520, y: 320, c: "#ff6b6b", delay: "0s" },
        { x: 1180, y: 360, c: "#9b6bdb", delay: "-2.4s" },
      ].map((b) => (
        <g key={b.c} transform={`translate(${b.x},${b.y})`}>
          <g className="quest-balloon-inner quest-decorative" style={{ animationDelay: b.delay }}>
            <ellipse rx="17" ry="21" fill={b.c} />
            <path d="M 0 21 L 4 27 L -4 27 Z" fill={b.c} />
            <path d="M 0 27 Q 6 46 0 62 Q -6 78 0 96" stroke="#8a5a3a" strokeWidth="1.5" fill="none" />
          </g>
        </g>
      ))}

      {/* teddy bears */}
      {[
        { x: 150, y: 862, s: 0.95 },
        { x: 1300, y: 858, s: 1 },
        { x: 850, y: 705, s: 0.62 },
      ].map((b, i) => (
        <g key={i} transform={`translate(${b.x},${b.y}) scale(${b.s})`}>
          <circle cx="-14" cy="-30" r="9" fill="#c98a52" />
          <circle cx="14" cy="-30" r="9" fill="#c98a52" />
          <circle cx="-22" cy="18" r="10" fill="#c98a52" />
          <circle cx="22" cy="18" r="10" fill="#c98a52" />
          <circle cx="0" cy="18" r="27" fill="#c98a52" />
          <circle cx="0" cy="-13" r="20" fill="#c98a52" />
          <circle cx="0" cy="21" r="15" fill="#f3d9b1" />
          <circle cx="0" cy="-8" r="10" fill="#f3d9b1" />
          <circle cx="-7" cy="-16" r="2.4" fill="#3a2a1a" />
          <circle cx="7" cy="-16" r="2.4" fill="#3a2a1a" />
          <ellipse cx="0" cy="-8" rx="3" ry="2.4" fill="#3a2a1a" />
        </g>
      ))}
    </svg>
  );
}
