// Section mascots for the dashboard (web/src/Dashboard.tsx) -- all-SVG, no external
// assets, same discipline as pet/Pet.tsx. One friendly animal per learning section so a
// child can navigate by character the way the sesamestreet.org/games reference does
// (filter/browse by character), not just by a topic label. Gradient fills (defined once,
// reused per mascot) give the bodies a soft shaded-sphere look instead of flat color, and
// each animal carries one small charm (owl glasses, rabbit bow, monkey hair tuft, turtle
// leaf) purely for personality -- all still hand-drawn shapes, nothing sourced.

export type AnimalKind = "monkey" | "rabbit" | "owl" | "turtle";

interface AnimalMascotProps {
  kind: AnimalKind;
  size?: number;
}

function Defs() {
  return (
    <defs>
      <radialGradient id="mascot-monkey" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#c08c5e" />
        <stop offset="100%" stopColor="#8a5a3a" />
      </radialGradient>
      <radialGradient id="mascot-rabbit" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#efe2c9" />
      </radialGradient>
      <radialGradient id="mascot-owl" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#c9a578" />
        <stop offset="100%" stopColor="#a9805a" />
      </radialGradient>
      <radialGradient id="mascot-turtle" cx="35%" cy="25%" r="80%">
        <stop offset="0%" stopColor="#7bcf7f" />
        <stop offset="100%" stopColor="#4caf50" />
      </radialGradient>
    </defs>
  );
}

export default function AnimalMascot({ kind, size = 72 }: AnimalMascotProps) {
  return (
    <svg viewBox="-60 -60 120 120" width={size} height={size}>
      <Defs />
      {kind === "monkey" && <Monkey />}
      {kind === "rabbit" && <Rabbit />}
      {kind === "owl" && <Owl />}
      {kind === "turtle" && <Turtle />}
    </svg>
  );
}

function Monkey() {
  return (
    <g>
      <circle cx={-34} cy={-6} r={14} fill="url(#mascot-monkey)" />
      <circle cx={34} cy={-6} r={14} fill="url(#mascot-monkey)" />
      <circle cx={-34} cy={-6} r={7} fill="#e8c9a3" />
      <circle cx={34} cy={-6} r={7} fill="#e8c9a3" />
      <ellipse cx={0} cy={4} rx={40} ry={36} fill="url(#mascot-monkey)" />
      {/* hair tuft */}
      <path d="M -8 -32 Q 0 -42 8 -32 Q 4 -34 0 -30 Q -4 -34 -8 -32 Z" fill="#5e3d24" />
      <ellipse cx={0} cy={14} rx={22} ry={18} fill="#e8c9a3" />
      <ellipse cx={-10} cy={2} rx={5} ry={4} fill="#ffb3c6" opacity={0.6} />
      <ellipse cx={10} cy={2} rx={5} ry={4} fill="#ffb3c6" opacity={0.6} />
      <circle cx={-10} cy={6} r={4} fill="#2b1c12" />
      <circle cx={10} cy={6} r={4} fill="#2b1c12" />
      <circle cx={-8.5} cy={4.5} r={1.2} fill="#fff" />
      <circle cx={11.5} cy={4.5} r={1.2} fill="#fff" />
      <path d="M -10 20 Q 0 26 10 20" stroke="#2b1c12" strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Rabbit() {
  return (
    <g>
      <ellipse cx={-14} cy={-38} rx={9} ry={26} fill="url(#mascot-rabbit)" stroke="#e3d5bd" strokeWidth={2} />
      <ellipse cx={14} cy={-38} rx={9} ry={26} fill="url(#mascot-rabbit)" stroke="#e3d5bd" strokeWidth={2} />
      <ellipse cx={-14} cy={-36} rx={4} ry={18} fill="#ffb3c6" />
      <ellipse cx={14} cy={-36} rx={4} ry={18} fill="#ffb3c6" />
      <ellipse cx={0} cy={10} rx={38} ry={34} fill="url(#mascot-rabbit)" stroke="#e3d5bd" strokeWidth={2} />
      <ellipse cx={-18} cy={14} rx={6} ry={4.5} fill="#ffb3c6" opacity={0.7} />
      <ellipse cx={18} cy={14} rx={6} ry={4.5} fill="#ffb3c6" opacity={0.7} />
      <circle cx={-11} cy={6} r={4} fill="#2b1c12" />
      <circle cx={11} cy={6} r={4} fill="#2b1c12" />
      <circle cx={-9.5} cy={4.5} r={1.1} fill="#fff" />
      <circle cx={12.5} cy={4.5} r={1.1} fill="#fff" />
      <ellipse cx={0} cy={16} rx={4} ry={3} fill="#ff8fa3" />
      <path d="M -10 24 Q 0 30 10 24" stroke="#2b1c12" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* bow */}
      <path d="M -6 -14 L -16 -20 L -16 -8 Z" fill="#ff6b6b" />
      <path d="M 6 -14 L 16 -20 L 16 -8 Z" fill="#ff6b6b" />
      <circle cx={0} cy={-14} r={4} fill="#e14f4f" />
    </g>
  );
}

function Owl() {
  return (
    <g>
      <path d="M -30 -34 L -18 -14 L -38 -18 Z" fill="#7a5a3a" />
      <path d="M 30 -34 L 18 -14 L 38 -18 Z" fill="#7a5a3a" />
      <ellipse cx={0} cy={4} rx={40} ry={38} fill="url(#mascot-owl)" />
      {/* wing shading */}
      <path d="M -34 10 Q -30 30 -10 34 Q -26 24 -24 6 Z" fill="#8a6845" opacity={0.6} />
      <path d="M 34 10 Q 30 30 10 34 Q 26 24 24 6 Z" fill="#8a6845" opacity={0.6} />
      <circle cx={-16} cy={-4} r={17} fill="#fff8ec" />
      <circle cx={16} cy={-4} r={17} fill="#fff8ec" />
      <circle cx={-16} cy={-4} r={8} fill="#2b1c12" />
      <circle cx={16} cy={-4} r={8} fill="#2b1c12" />
      <circle cx={-13.5} cy={-6.5} r={2} fill="#fff" />
      <circle cx={18.5} cy={-6.5} r={2} fill="#fff" />
      {/* glasses */}
      <circle cx={-16} cy={-4} r={19} fill="none" stroke="#4a3f35" strokeWidth={2.4} />
      <circle cx={16} cy={-4} r={19} fill="none" stroke="#4a3f35" strokeWidth={2.4} />
      <path d="M 0 -6 Q 0 -2 0 -4" stroke="#4a3f35" strokeWidth={2.4} fill="none" />
      <path d="M 0 6 L -6 16 L 6 16 Z" fill="#ffb703" />
    </g>
  );
}

function Turtle() {
  return (
    <g>
      <ellipse cx={0} cy={30} rx={20} ry={8} fill="#4caf50" opacity={0.4} />
      <circle cx={0} cy={16} r={40} fill="url(#mascot-turtle)" />
      <circle cx={-14} cy={4} r={8} fill="#388e3c" />
      <circle cx={14} cy={4} r={8} fill="#388e3c" />
      <circle cx={0} cy={-8} r={9} fill="#388e3c" />
      <circle cx={-20} cy={22} r={7} fill="#388e3c" />
      <circle cx={20} cy={22} r={7} fill="#388e3c" />
      <ellipse cx={0} cy={-30} rx={20} ry={18} fill="#8bc34a" />
      <circle cx={-7} cy={-32} r={3.5} fill="#2b1c12" />
      <circle cx={7} cy={-32} r={3.5} fill="#2b1c12" />
      <circle cx={-5.8} cy={-33.2} r={1} fill="#fff" />
      <circle cx={8.2} cy={-33.2} r={1} fill="#fff" />
      <path d="M -6 -22 Q 0 -18 6 -22" stroke="#2b1c12" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      {/* leaf on shell */}
      <path d="M 18 -6 Q 30 -14 34 -2 Q 26 2 18 -6 Z" fill="#c8e6c9" stroke="#8bc34a" strokeWidth={1.2} />
    </g>
  );
}
