// A full-bleed illustrated meadow scene behind the dashboard -- original flat-vector
// art in the same style as animals/AnimalMascot.tsx, not a photo. Deliberately not a
// photograph: this project ships fully offline (see Baloo2/Blockly-media entries in
// DECISIONS.md -- everything visual is either drawn here or vendored under a license
// that permits redistribution), and a stock photo pulled from a commercial site like
// rawpixel doesn't clear that bar. Sits fixed behind the page; every piece of real
// dashboard content renders in front of it with its own solid/semi-opaque background so
// legibility never depends on how busy this scene gets.
export default function BackgroundScene() {
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

      {/* sun */}
      <circle cx="1420" cy="150" r="90" fill="#ffdb70" opacity="0.9" />
      <circle cx="1420" cy="150" r="60" fill="#ffb703" />

      {/* clouds */}
      <g fill="#ffffff" opacity="0.85">
        <g transform="translate(220,120)">
          <ellipse cx="0" cy="0" rx="70" ry="30" />
          <ellipse cx="50" cy="-14" rx="46" ry="26" />
          <ellipse cx="-55" cy="-8" rx="40" ry="22" />
        </g>
        <g transform="translate(760,90)">
          <ellipse cx="0" cy="0" rx="55" ry="24" />
          <ellipse cx="40" cy="-10" rx="36" ry="20" />
        </g>
        <g transform="translate(1080,210)">
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

      {/* trees on the mid hill */}
      {[
        { x: 140, y: 660, s: 1 },
        { x: 1500, y: 690, s: 1.2 },
        { x: 60, y: 720, s: 0.8 },
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

      {/* flowers scattered on the foreground */}
      {[
        { x: 90, y: 850, c: "#ff6b6b" },
        { x: 260, y: 875, c: "#ffb703" },
        { x: 520, y: 855, c: "#9b6bdb" },
        { x: 900, y: 870, c: "#ff6b6b" },
        { x: 1180, y: 850, c: "#3bb4e5" },
        { x: 1420, y: 875, c: "#ffb703" },
      ].map((f, i) => (
        <g key={i} transform={`translate(${f.x},${f.y})`}>
          <circle cx="0" cy="-8" r="6" fill={f.c} />
          <circle cx="-6" cy="-2" r="6" fill={f.c} />
          <circle cx="6" cy="-2" r="6" fill={f.c} />
          <circle cx="0" cy="4" r="6" fill={f.c} />
          <circle cx="0" cy="-2" r="4" fill="#fff8ec" />
        </g>
      ))}
    </svg>
  );
}
