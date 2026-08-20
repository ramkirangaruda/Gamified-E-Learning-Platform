// Section mascots for the dashboard (web/src/Dashboard.tsx) -- all-SVG, no external
// assets, same discipline as pet/Pet.tsx. One friendly animal per learning section so a
// child can navigate by character the way the sesamestreet.org/games reference does
// (filter/browse by character), not just by a topic label.

export type AnimalKind = "monkey" | "rabbit" | "owl" | "turtle";

interface AnimalMascotProps {
  kind: AnimalKind;
  size?: number;
}

export default function AnimalMascot({ kind, size = 72 }: AnimalMascotProps) {
  return (
    <svg viewBox="-60 -60 120 120" width={size} height={size}>
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
      <circle cx={-34} cy={-6} r={14} fill="#8a5a3a" />
      <circle cx={34} cy={-6} r={14} fill="#8a5a3a" />
      <circle cx={-34} cy={-6} r={7} fill="#e8c9a3" />
      <circle cx={34} cy={-6} r={7} fill="#e8c9a3" />
      <ellipse cx={0} cy={4} rx={40} ry={36} fill="#a9713f" />
      <ellipse cx={0} cy={14} rx={22} ry={18} fill="#e8c9a3" />
      <circle cx={-10} cy={6} r={4} fill="#2b1c12" />
      <circle cx={10} cy={6} r={4} fill="#2b1c12" />
      <path d="M -10 20 Q 0 26 10 20" stroke="#2b1c12" strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Rabbit() {
  return (
    <g>
      <ellipse cx={-14} cy={-38} rx={9} ry={26} fill="#fdf6ec" stroke="#e3d5bd" strokeWidth={2} />
      <ellipse cx={14} cy={-38} rx={9} ry={26} fill="#fdf6ec" stroke="#e3d5bd" strokeWidth={2} />
      <ellipse cx={-14} cy={-36} rx={4} ry={18} fill="#ffb3c6" />
      <ellipse cx={14} cy={-36} rx={4} ry={18} fill="#ffb3c6" />
      <ellipse cx={0} cy={10} rx={38} ry={34} fill="#fdf6ec" stroke="#e3d5bd" strokeWidth={2} />
      <circle cx={-11} cy={6} r={4} fill="#2b1c12" />
      <circle cx={11} cy={6} r={4} fill="#2b1c12" />
      <ellipse cx={0} cy={16} rx={4} ry={3} fill="#ff8fa3" />
      <path d="M -10 24 Q 0 30 10 24" stroke="#2b1c12" strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Owl() {
  return (
    <g>
      <path d="M -30 -34 L -18 -14 L -38 -18 Z" fill="#7a5a3a" />
      <path d="M 30 -34 L 18 -14 L 38 -18 Z" fill="#7a5a3a" />
      <ellipse cx={0} cy={4} rx={40} ry={38} fill="#a9805a" />
      <circle cx={-16} cy={-4} r={17} fill="#fff8ec" />
      <circle cx={16} cy={-4} r={17} fill="#fff8ec" />
      <circle cx={-16} cy={-4} r={8} fill="#2b1c12" />
      <circle cx={16} cy={-4} r={8} fill="#2b1c12" />
      <path d="M 0 6 L -6 16 L 6 16 Z" fill="#ffb703" />
    </g>
  );
}

function Turtle() {
  return (
    <g>
      <ellipse cx={0} cy={30} rx={20} ry={8} fill="#4caf50" opacity={0.4} />
      <circle cx={0} cy={16} r={40} fill="#4caf50" />
      <circle cx={-14} cy={4} r={8} fill="#388e3c" />
      <circle cx={14} cy={4} r={8} fill="#388e3c" />
      <circle cx={0} cy={-8} r={9} fill="#388e3c" />
      <circle cx={-20} cy={22} r={7} fill="#388e3c" />
      <circle cx={20} cy={22} r={7} fill="#388e3c" />
      <ellipse cx={0} cy={-30} rx={20} ry={18} fill="#8bc34a" />
      <circle cx={-7} cy={-32} r={3.5} fill="#2b1c12" />
      <circle cx={7} cy={-32} r={3.5} fill="#2b1c12" />
      <path d="M -6 -22 Q 0 -18 6 -22" stroke="#2b1c12" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </g>
  );
}
