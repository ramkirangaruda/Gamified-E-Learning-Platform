import { useEffect, useState } from "react";
import Icon from "../icons/Icon";
import PetBar from "../pet/PetBar";
import { SUBJECTS } from "../subjects";
import { activeSubjectId, type Route } from "../routes";
import { toneClasses } from "../ui/tone";
import { fetchTierInfo, type TierInfo } from "../api";

// The one persistent header, and the backbone of the redesigned dashboard.
//
// Two stacked rows inside a single fixed shell:
//   1. NAVIGATION -- brand, the subject tabs, and the three whole-app destinations
//      (Progress, Classroom, Settings) plus the Calm Mode switch.
//   2. THE PET     -- pet/PetBar.tsx, unchanged in behaviour.
//
// Why they are one element and not two stacked fixed bars: the pet row must be mounted
// exactly once for the whole session (PetProvider's contract -- unmounting it resets the
// pet's mood, speech and animation phase), and the nav has the same requirement for a
// different reason (a nav that remounts per page re-runs its enter transition on every
// click). Making the shell the single fixed thing means pages below pad past ONE value,
// --app-header-h, which is derived from the two row heights rather than typed again.
//
// The nav row scrolls horizontally rather than wrapping: a wrapping nav changes the
// header's height, which would silently break every page's `pt-[var(--app-header-h)]`.

interface AppHeaderProps {
  route: Route;
  onNavigate: (route: Route) => void;
  /** Owned by App, which resolves it from the server/session -- see App.tsx. */
  lite: boolean;
  onToggleLite: () => void;
}

/** A subject tab. Locked subjects stay visible and clickable -- clicking one opens its
 *  "coming soon" page rather than doing nothing, because a tab that silently ignores a
 *  click reads as broken to a child, and §10's "never punish" applies to dead ends too. */
function SubjectTab({
  subject,
  active,
  onClick,
}: {
  subject: (typeof SUBJECTS)[number];
  active: boolean;
  onClick: () => void;
}) {
  const t = toneClasses(subject.tone);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={subject.available ? subject.desc : `${subject.title} — coming soon`}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border-b-[4px] px-4 py-2.5 font-display text-base font-bold shadow-chunk-sm transition-transform duration-100
        hover:-translate-y-0.5 active:translate-y-[2px]
        ${active ? `${t.bg} ${t.border} ${t.text}` : "border-quest-locked bg-quest-paper text-quest-ink"}`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full font-display text-xs font-bold
          ${active ? "bg-white/25 text-inherit" : `${t.bg} ${t.text}`}`}
        aria-hidden="true"
      >
        {subject.letter}
      </span>
      {subject.title}
      {!subject.available && (
        <span className={active ? "opacity-80" : "text-quest-locked-deep"} aria-hidden="true">
          <Icon name="lock" size={14} />
        </span>
      )}
    </button>
  );
}

/** A right-hand nav destination. Smaller and quieter than a subject tab on purpose --
 *  these are for the adult-ish corners of the app, not the thing a child came here for. */
function NavAction({
  label,
  active,
  onClick,
  title,
  pressed,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  title?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? "page" : undefined}
      aria-pressed={pressed}
      className={`shrink-0 rounded-full border-2 px-4 py-2.5 font-display text-base font-bold transition-transform duration-100
        hover:-translate-y-0.5 active:translate-y-[2px]
        ${active ? "border-quest-gold-dark bg-quest-gold text-quest-ink" : "border-quest-ink/15 bg-quest-paper text-quest-ink-soft hover:text-quest-ink"}`}
    >
      {label}
    </button>
  );
}

/** The whole "why not just a web app" objection dies the moment someone reads this: it's
 *  a standing, visible claim -- not a slide, not a spoken aside -- that nothing on this
 *  screen ever leaves the machine. Fetched once (GET /api/tier, itself a loopback call)
 *  so the model name backing it is real, not asserted; the badge still reads "Offline"
 *  immediately on mount rather than waiting on that response, because the claim is true
 *  before the tutor engine finishes reporting in.
 *
 *  `hidden sm:inline-flex`: on the narrowest viewports the subject-tab strip already
 *  needs every pixel it can scroll into (see the comment on that div below), so this
 *  drops first rather than fighting it for space. */
function OfflineBadge({ tierInfo }: { tierInfo: TierInfo | null }) {
  const detail = tierInfo?.model
    ? `Hints are rephrased by ${tierInfo.model}, running locally.`
    : "Hints use verified text, no model loaded.";
  return (
    <span
      className="hidden shrink-0 items-center gap-1.5 rounded-full border-2 border-quest-ink/15 bg-quest-paper px-3 py-1.5 font-display text-xs font-bold text-quest-ink-soft sm:inline-flex"
      title={`No network requests leave this machine -- everything runs on-device. ${detail}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
      Offline
    </span>
  );
}

export default function AppHeader({ route, onNavigate, lite, onToggleLite }: AppHeaderProps) {
  const currentSubject = activeSubjectId(route);
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);

  useEffect(() => {
    fetchTierInfo().then(setTierInfo).catch(() => setTierInfo(null));
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 h-[var(--app-header-h)] border-b-(length:--outline-chunk-thick) border-quest-ink/15 bg-quest-paper/95 backdrop-blur-sm"
      data-testid="app-header"
    >
      <nav
        className="mx-auto flex h-[var(--app-header-nav-h)] max-w-6xl items-center gap-4 px-5"
        aria-label="Subjects and sections"
      >
        <button
          type="button"
          onClick={() => onNavigate({ name: "home" })}
          aria-current={route.name === "home" ? "page" : undefined}
          className="shrink-0 font-display text-2xl font-bold text-quest-ink transition-transform duration-100 hover:-translate-y-0.5"
        >
          Tessera Quest
        </button>

        <OfflineBadge tierInfo={tierInfo} />

        {/* min-w-0 lets this flex child actually shrink, which is what allows the tab
            strip to scroll instead of pushing the actions off the right edge.

            quest-scroll-hidden (tokens.css) drops the horizontal bar itself. A tab sliced
            off at the edge is already the affordance, and the bar was costing more than it
            told anyone: overflow-x also clips vertically, so 12px of scrollbar ate into a
            fixed-height row and cut the flat offset shadows off the tabs above it. py-1.5
            is the matching half -- 6px clears both the 3px shadow and the 2px hover lift,
            which py-1 did not. */}
        <div className="quest-scroll-hidden flex min-w-0 flex-1 gap-2 overflow-x-auto py-1.5">
          {SUBJECTS.map((s) => (
            <SubjectTab
              key={s.id}
              subject={s}
              active={currentSubject === s.id}
              onClick={() => onNavigate({ name: "subject", subjectId: s.id })}
            />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <NavAction
            label="Progress"
            active={route.name === "progress"}
            title="Everything you've done so far"
            onClick={() => onNavigate({ name: "progress" })}
          />
          <NavAction
            label="Classroom"
            active={route.name === "classroom"}
            title="Sync your progress to a classroom computer, or recover a lost key"
            onClick={() => onNavigate({ name: "classroom" })}
          />
          <NavAction
            label="Settings"
            active={route.name === "settings"}
            title="Pick which pet keeps you company"
            onClick={() => onNavigate({ name: "settings" })}
          />
          <NavAction
            label={lite ? "Calm: on" : "Calm: off"}
            pressed={lite}
            title="Turn decoration off for slower machines"
            onClick={onToggleLite}
          />
        </div>
      </nav>

      <PetBar />
    </header>
  );
}
