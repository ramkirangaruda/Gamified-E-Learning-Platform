// A small original icon set replacing emoji across the UI. Not a stylistic whim: emoji
// glyphs render as completely different artwork on Windows/macOS/Linux/each browser's
// own font, which fights the "one consistent, designed look" this pass is going for --
// a custom SVG icon looks identical everywhere and can actually match the app's palette.
// Same discipline as animals/AnimalMascot.tsx and BackgroundScene.tsx: hand-authored
// shapes, not sourced from anywhere, so there's nothing to license.

export type IconName = "star" | "trophy" | "apple" | "check" | "party" | "play" | "reset" | "step" | "pause" | "lock";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export default function Icon({ name, size = 18, className }: IconProps) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", className, "aria-hidden": true as const };
  switch (name) {
    case "star":
      return (
        <svg {...props}>
          <path
            d="M12 2.5 L14.8 9 L21.8 9.6 L16.5 14.2 L18.1 21 L12 17.3 L5.9 21 L7.5 14.2 L2.2 9.6 L9.2 9 Z"
            fill="#ffb703"
            stroke="#e08e00"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "trophy":
      return (
        <svg {...props}>
          <path d="M7 3 H17 V9 A5 5 0 0 1 7 9 Z" fill="#ffb703" stroke="#e08e00" strokeWidth="1" />
          <path d="M7 4 H4 V6 A3 3 0 0 0 7 9" fill="none" stroke="#e08e00" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M17 4 H20 V6 A3 3 0 0 1 17 9" fill="none" stroke="#e08e00" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="10.5" y="13" width="3" height="4" fill="#e08e00" />
          <rect x="7.5" y="18" width="9" height="2.4" rx="1" fill="#e08e00" />
        </svg>
      );
    case "apple":
      return (
        <svg {...props}>
          <path d="M12 8.5 C 9 6 4 8 4 13.5 C 4 18 7.5 21 10 21 C 11 21 11 20.3 12 20.3 C 13 20.3 13 21 14 21 C 16.5 21 20 18 20 13.5 C 20 8 15 6 12 8.5 Z" fill="#ff6b6b" stroke="#e14f4f" strokeWidth="1" />
          <path d="M12 8.5 C 12 6.5 13 5 15 4.5" fill="none" stroke="#4caf50" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" fill="#4caf50" />
          <path d="M7.5 12.5 L10.5 15.5 L16.5 9" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "party":
      return (
        <svg {...props}>
          <path d="M4 20 L9 6 L20 15 Z" fill="#3bb4e5" stroke="#1f96c9" strokeWidth="1" strokeLinejoin="round" />
          <circle cx="18" cy="5" r="1.6" fill="#ffb703" />
          <circle cx="21" cy="9" r="1.2" fill="#ff6b6b" />
          <circle cx="15" cy="3" r="1.2" fill="#9b6bdb" />
        </svg>
      );
    case "play":
      return (
        <svg {...props}>
          <path d="M6 4 L20 12 L6 20 Z" fill="currentColor" />
        </svg>
      );
    case "pause":
      return (
        <svg {...props}>
          <rect x="6" y="4" width="4.5" height="16" rx="1.5" fill="currentColor" />
          <rect x="13.5" y="4" width="4.5" height="16" rx="1.5" fill="currentColor" />
        </svg>
      );
    case "reset":
      return (
        <svg {...props}>
          <path d="M5 12 A 7 7 0 1 1 8 17.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M5 12 V 7 M5 12 H10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "lock":
      return (
        <svg {...props}>
          {/* "Not yet", never failure -- a closed padlock with a soft body, no red, no cross. */}
          <path d="M8 10 V7.5 A4 4 0 0 1 16 7.5 V10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="4.5" y="10" width="15" height="10.5" rx="3" fill="currentColor" />
        </svg>
      );
    case "step":
      return (
        <svg {...props}>
          <path d="M5 5 L14 12 L5 19 Z" fill="currentColor" />
          <rect x="16" y="5" width="3" height="14" rx="1" fill="currentColor" />
        </svg>
      );
  }
}
